/**
 * 教学子集解释器 + 执行轨迹
 * ------------------------------------------------------------------
 * 设计取舍：
 * - 用宿主 JS 递归实现函数调用（深度上限 64），执行到每条语句时记录
 *   TraceStep，保证 UI 可以逐步回放；
 * - 作用域用 Scope 链：全局 → 函数参数帧 → 块级作用域；
 * - 指针用 Ref（可读写引用）表示，支持 &x、*p、指针交换、指向数组元素；
 * - 只支持教学子集，遇到不支持的写法立即返回 supported=false。
 */
import type {
  HeapBlockSnapshot,
  RuntimeVar,
  SimulateOptions,
  TraceError,
  TraceEvent,
  TraceHeapIssue,
  TraceResult,
  TraceStep,
} from './types';
import type { ClassDeclNode, ExprNode, FieldDeclNode, FuncDeclNode, ParamNode, ProgramNode, StmtNode } from './ast';
import type { FormatSpec } from './io';
import { flattenBinaryChain, parseFormat, rootName } from './io';
import { buildSupportRegistry, findUnsupportedProgram } from './support';
import {
  arrayElementRef,
  arrayElementTexts,
  arrayToPointer,
  asInt,
  asNumber,
  baseTypeName,
  boolValue,
  categoryOfValue,
  charDisplay,
  charsOf,
  coerceValue,
  countElements,
  escapeText,
  floatValue,
  formatValue,
  intValue,
  isCharType,
  isFloatType,
  isPointerType,
  isStringType,
  nullValue,
  stringValue,
  truthy,
  voidValue,
} from './values';
import type { ArrayValue, PointerValue, Ref, RValue, StructValue } from './values';
import { exprToText, formatNumber, scalarSize, truncateText } from './utils';

const MAX_CALL_DEPTH = 64;
const OPS_LIMIT = 200000;

class SimError extends Error {
  readonly kind: 'runtime' | 'unsupported';
  readonly line: number;
  constructor(message: string, line: number, kind: 'runtime' | 'unsupported' = 'runtime') {
    super(message);
    this.name = 'SimError';
    this.kind = kind;
    this.line = line;
  }
}

class StepLimitError extends Error {
  constructor() {
    super('step limit');
    this.name = 'StepLimitError';
  }
}

class OpsLimitError extends Error {
  constructor() {
    super('ops limit');
    this.name = 'OpsLimitError';
  }
}

interface Slot {
  name: string;
  value: RValue;
  ref: Ref;
  typeText: string;
  category: ReturnType<typeof categoryOfValue>;
  isConst: boolean;
}

class Scope {
  readonly vars = new Map<string, Slot>();
  constructor(readonly parent: Scope | null) {}
}

interface Frame {
  fn: FuncDeclNode | null;
  name: string;
  line: number;
  scopes: Scope[];
}

type Signal =
  | { kind: 'normal' }
  | { kind: 'return'; value: RValue }
  | { kind: 'break' }
  | { kind: 'continue' };

const NORMAL: Signal = { kind: 'normal' };

function lastSegment(name: string): string {
  const index = name.lastIndexOf('::');
  return index >= 0 ? name.slice(index + 2) : name;
}

function trimZeros(text: string): string {
  if (!text.includes('.')) return text;
  return text.replace(/0+$/, '').replace(/\.$/, '');
}

function flattenClasses(program: ProgramNode): ClassDeclNode[] {
  const result: ClassDeclNode[] = [];
  const visit = (cls: ClassDeclNode): void => {
    result.push(cls);
    for (const nested of cls.nested) visit(nested);
  };
  for (const cls of program.classes) visit(cls);
  return result;
}

function collectEnums(program: ProgramNode): Map<string, number> {
  const values = new Map<string, number>();
  for (const enumDecl of program.enums) {
    let next = 0;
    for (const enumerator of enumDecl.enumerators) {
      if (enumerator.valueText) {
        const parsed = Number(enumerator.valueText);
        if (Number.isFinite(parsed)) next = parsed;
      }
      values.set(enumerator.name, next);
      next++;
    }
  }
  return values;
}

/** 解释器内部的堆块：用 ArrayValue 统一承载，标量也当成 1 个元素的数组 */
interface HeapBlock {
  id: number;
  label: string;
  elemType: string;
  isArray: boolean;
  array: ArrayValue;
  /** 指向数组第 0 个元素的引用，标量指针就用它 */
  ref: Ref;
  freed: boolean;
  line: number;
}

const MAX_HEAP_BLOCKS = 64;
const HEAP_PREVIEW = 16;

/** 解释器主类 */
class Interpreter {
  private program: ProgramNode;
  private stepLimit: number;
  private globalScope = new Scope(null);
  private frames: Frame[] = [];
  private steps: TraceStep[] = [];
  private outputText = '';
  private lastSnapshot = new Map<string, string>();
  private truncated = false;
  private ops = 0;
  private input: string;
  private inputPos = 0;
  private currentLine = 1;
  /** 全局变量初始化期间不记录步骤，保证首步是 start */
  private quiet = false;
  private functionMap = new Map<string, FuncDeclNode>();
  private classMap = new Map<string, ClassDeclNode>();
  private enumValues: Map<string, number>;
  /** new 出来的堆块，按申请顺序排列 */
  private heapBlocks: HeapBlock[] = [];
  /** 数组对象 → 所属堆块，用于判断指针是否指向已释放内存 */
  private heapIndex = new Map<ArrayValue, HeapBlock>();
  private nextHeapId = 1;
  private heapPeak = 0;
  private heapIssues: TraceHeapIssue[] = [];
  private leaksCollected = false;

  constructor(program: ProgramNode, options: SimulateOptions) {
    this.program = program;
    this.stepLimit = Math.min(Math.max(options.maxSteps ?? 3000, 10), 20000);
    this.input = options.stdin ?? '';
    this.enumValues = collectEnums(program);

    for (const cls of flattenClasses(program)) {
      if (!this.classMap.has(cls.name)) this.classMap.set(cls.name, cls);
    }
    for (const fn of program.functions) {
      if (!fn.body) continue;
      if (!this.functionMap.has(fn.name)) this.functionMap.set(fn.name, fn);
    }
    for (const cls of this.classMap.values()) {
      for (const method of cls.methods) {
        if (!method.body) continue;
        if (!this.functionMap.has(method.name)) this.functionMap.set(method.name, method);
      }
    }
  }

  run(): TraceResult {
    const mainFn = this.findMain();
    if (!mainFn) {
      return this.unsupportedResult(1, '没有找到 main 函数，无法执行。');
    }
    try {
      this.quiet = true;
      this.initGlobals();
      this.quiet = false;
      this.emit({ event: 'start', description: '开始执行 main 函数', line: mainFn.line }, true);
      this.callFunction(mainFn, [], mainFn.line);
      this.finishEnd(false);
      return this.successResult();
    } catch (error) {
      if (error instanceof StepLimitError) {
        this.truncated = true;
        this.finishEnd(true);
        return this.successResult();
      }
      if (error instanceof OpsLimitError) {
        const message = `循环或计算次数超过 ${OPS_LIMIT} 次，可能是死循环或数据规模过大。`;
        this.pushErrorStep(message, this.currentLine, 'limit');
        this.truncated = true;
        this.finishEnd(true);
        return this.failureResult({ message, line: this.currentLine, kind: 'limit' }, true, true);
      }
      if (error instanceof SimError) {
        this.pushErrorStep(error.message, error.line, error.kind === 'unsupported' ? 'unsupported' : 'runtime');
        this.finishEnd(true);
        return this.failureResult(
          { message: error.message, line: error.line, kind: error.kind },
          error.kind !== 'unsupported',
          false,
        );
      }
      const message = '执行过程中遇到了意外错误。';
      this.pushErrorStep(message, this.currentLine, 'runtime');
      this.finishEnd(true);
      return this.failureResult({ message, line: this.currentLine, kind: 'runtime' }, true, false);
    }
  }

  /* ============================== 结果 / 步骤 ============================== */

  private successResult(): TraceResult {
    this.collectLeaks();
    return {
      ok: true,
      supported: true,
      steps: this.steps,
      output: this.outputText,
      truncated: this.truncated,
      maxSteps: this.stepLimit,
      interpreterNote:
        '教学解释器子集：整数 / 浮点 / 字符 / 字符串、数组、循环、递归、指针基础、struct 读写，以及 new / delete 的堆内存。',
      stdinConsumed: this.input.slice(0, this.inputPos),
      heapIssues: this.heapIssues,
      heapPeak: this.heapPeak,
    };
  }

  private failureResult(error: TraceError, supported: boolean, truncated: boolean): TraceResult {
    this.collectLeaks();
    return {
      ok: false,
      supported,
      error,
      steps: this.steps,
      output: this.outputText,
      truncated,
      maxSteps: this.stepLimit,
      stdinConsumed: this.input.slice(0, this.inputPos),
      heapIssues: this.heapIssues,
      heapPeak: this.heapPeak,
    };
  }

  private unsupportedResult(line: number, message: string): TraceResult {
    return {
      ok: false,
      supported: false,
      error: { message, line, kind: 'unsupported' },
      steps: [],
      output: '',
      truncated: false,
      maxSteps: this.stepLimit,
    };
  }

  private findMain(): FuncDeclNode | undefined {
    const candidates = this.program.functions.filter((fn) => fn.name === 'main' && fn.body);
    if (candidates.length > 0) return candidates[0];
    return undefined;
  }

  private pushErrorStep(message: string, line: number, kind: 'runtime' | 'unsupported' | 'limit'): void {
    try {
      this.emit(
        { event: 'error', description: kind === 'limit' ? message : `运行错误：${message}`, line },
        true,
      );
    } catch {
      // 忽略
    }
  }

  private finishEnd(aborted: boolean): void {
    if (this.steps.length > 0 && this.steps[this.steps.length - 1].event === 'end') return;
    this.emit(
      {
        event: 'end',
        description: aborted
          ? this.truncated
            ? `已达到步数 / 次数上限（最多 ${this.stepLimit} 步），追踪提前结束。`
            : '执行因错误提前结束。'
          : '程序执行结束',
        line: this.currentLine,
      },
      true,
    );
  }

  private tick(): void {
    this.ops++;
    if (this.ops > OPS_LIMIT) throw new OpsLimitError();
  }

  private emit(
    options: {
      event: TraceEvent;
      description: string;
      line?: number;
      conditionResult?: boolean;
      outputChunk?: string;
    },
    force = false,
  ): void {
    if (this.quiet) return;
    if (!force && this.steps.length >= this.stepLimit) {
      this.truncated = true;
      throw new StepLimitError();
    }
    const line = options.line ?? this.currentLine;
    const frame = this.frames[this.frames.length - 1];
    const vars = this.buildRuntimeVars();
    const step: TraceStep = {
      index: this.steps.length,
      line,
      functionName: frame ? frame.name : 'main',
      depth: Math.max(0, this.frames.length - 1),
      event: options.event,
      description: truncateText(options.description, 90),
      vars,
      callStack: this.frames.map((f) => ({ functionName: f.name, line: f.line })),
      stdout: this.outputText,
    };
    const heap = this.heapSnapshot();
    if (heap) step.heap = heap;
    if (options.conditionResult !== undefined) step.conditionResult = options.conditionResult;
    if (options.outputChunk !== undefined) step.outputChunk = options.outputChunk;
    this.steps.push(step);
  }

  private visibleSlots(): Slot[] {
    const frame = this.frames[this.frames.length - 1];
    const ordered: Slot[] = [];
    const indexByName = new Map<string, number>();
    if (frame) {
      for (const scope of frame.scopes) {
        for (const slot of scope.vars.values()) {
          const index = indexByName.get(slot.name);
          if (index === undefined) {
            indexByName.set(slot.name, ordered.length);
            ordered.push(slot);
          } else {
            ordered[index] = slot;
          }
        }
      }
    }
    const localNames = new Set(ordered.map((slot) => slot.name));
    const result: Slot[] = [];
    for (const slot of this.globalScope.vars.values()) {
      if (!localNames.has(slot.name)) result.push(slot);
    }
    result.push(...ordered);
    return result;
  }

  private buildRuntimeVars(): RuntimeVar[] {
    const slots = this.visibleSlots();
    const nextSnapshot = new Map<string, string>();
    const vars: RuntimeVar[] = slots.map((slot) => {
      const valueText = formatValue(slot.value);
      nextSnapshot.set(slot.name, valueText);
      const entry: RuntimeVar = {
        name: slot.name,
        typeText: slot.typeText,
        valueText,
        category: slot.category,
        changed: this.lastSnapshot.get(slot.name) !== valueText,
      };
      if (slot.value.t === 'array') {
        entry.arrayValues = arrayElementTexts(slot.value);
      } else if (slot.value.t === 'pointer') {
        entry.pointerTarget = slot.value.target ? slot.value.label : slot.value.str !== undefined ? '(字符串常量)' : '空指针';
      }
      return entry;
    });
    this.lastSnapshot = nextSnapshot;
    return vars;
  }

  private printOutput(chunk: string, line: number): void {
    if (chunk.length === 0) return;
    this.outputText += chunk;
    this.emit({
      event: 'output',
      description: `输出 ${escapeText(chunk, 50)}`,
      line,
      outputChunk: chunk,
    });
  }

  /* ============================== 作用域 ============================== */

  private currentFrame(): Frame | undefined {
    return this.frames[this.frames.length - 1];
  }

  private currentScope(): Scope {
    const frame = this.currentFrame();
    if (!frame) return this.globalScope;
    return frame.scopes[frame.scopes.length - 1];
  }

  private lookupSlot(name: string, line: number): Slot {
    const frame = this.currentFrame();
    if (frame) {
      for (let i = frame.scopes.length - 1; i >= 0; i--) {
        const slot = frame.scopes[i].vars.get(name);
        if (slot) return slot;
      }
    }
    const globalSlot = this.globalScope.vars.get(name);
    if (globalSlot) return globalSlot;
    throw new SimError(`变量 ${name} 在使用前没有声明。`, line);
  }

  private makeSlot(name: string, value: RValue, typeText: string, isConst = false): Slot {
    const slot: Slot = {
      name,
      value,
      ref: {
        get: () => slot.value,
        set: (next) => {
          slot.value = next;
        },
        label: name,
        typeText,
      },
      typeText,
      category: categoryOfValue(value),
      isConst,
    };
    return slot;
  }

  private declare(name: string, value: RValue, typeText: string, isConst = false): Slot {
    const slot = this.makeSlot(name, value, typeText, isConst);
    this.currentScope().vars.set(name, slot);
    return slot;
  }

  private declareGlobal(name: string, value: RValue, typeText: string): Slot {
    const slot = this.makeSlot(name, value, typeText);
    this.globalScope.vars.set(name, slot);
    return slot;
  }

  /* ============================== 全局变量初始化 ============================== */

  private initGlobals(): void {
    for (const decl of this.program.globals) {
      for (const declarator of decl.declarators) {
        if (!declarator.name) continue;
        const typeText = this.declTypeText(decl.typeSpec.text, declarator);
        const value = this.instantiateDeclarator(
          declarator,
          decl.typeSpec.base,
          typeText,
        );
        this.declareGlobal(declarator.name, value, typeText);
      }
    }
  }

  /* ============================== 语句执行 ============================== */

  private execStmt(stmt: StmtNode): Signal {
    this.tick();
    this.currentLine = stmt.line;
    const frame = this.currentFrame();
    if (frame) frame.line = stmt.line;

    switch (stmt.kind) {
      case 'block': {
        const scope = new Scope(this.currentScope());
        const current = this.currentFrame();
        if (!current) return NORMAL;
        current.scopes.push(scope);
        try {
          for (const inner of stmt.statements) {
            const signal = this.execStmt(inner);
            if (signal.kind !== 'normal') return signal;
          }
          return NORMAL;
        } finally {
          current.scopes.pop();
        }
      }
      case 'decl':
        this.execDecl(stmt);
        return NORMAL;
      case 'expr':
        this.execExprStatement(stmt.expr);
        return NORMAL;
      case 'if': {
        const condition = this.evalExpr(stmt.cond);
        const result = truthy(condition);
        this.emit({
          event: 'branch',
          description: `判断 ${exprToText(stmt.cond)} → ${result ? '真' : '假'}`,
          line: stmt.line,
          conditionResult: result,
        });
        if (result) return this.execStmt(stmt.then);
        if (stmt.else) return this.execStmt(stmt.else);
        return NORMAL;
      }
      case 'while':
        return this.execWhile(stmt);
      case 'doWhile':
        return this.execDoWhile(stmt);
      case 'for':
        return this.execFor(stmt);
      case 'rangeFor':
        return this.execRangeFor(stmt);
      case 'switch':
        return this.execSwitch(stmt);
      case 'return': {
        const value = stmt.expr ? this.evalExpr(stmt.expr) : voidValue();
        this.emit({
          event: 'return',
          description: stmt.expr ? `返回 ${formatValue(value)}` : '返回（void）',
          line: stmt.line,
        });
        return { kind: 'return', value };
      }
      case 'break':
        this.emit({ event: 'break', description: '跳出当前循环 / switch', line: stmt.line });
        return { kind: 'break' };
      case 'continue':
        this.emit({ event: 'continue', description: '进入下一次循环', line: stmt.line });
        return { kind: 'continue' };
      case 'empty':
        return NORMAL;
      case 'goto':
        throw new SimError('goto 语句暂不支持单步执行。', stmt.line, 'unsupported');
      case 'labeled':
        return this.execStmt(stmt.statement);
      case 'unknown':
        throw new SimError(`无法解析的语句：${stmt.text}`, stmt.line, 'unsupported');
      default:
        return NORMAL;
    }
  }

  private execExprStatement(expr: ExprNode): void {
    const stepsBefore = this.steps.length;
    if (expr.kind === 'assign') {
      const value = this.evalExpr(expr);
      this.emit({
        event: 'assign',
        description: `执行 ${exprToText(expr)}，${exprToText(expr.target)} 变为 ${formatValue(value)}`,
        line: expr.line,
      });
      return;
    }
    if (expr.kind === 'unary' && (expr.op === '++' || expr.op === '--')) {
      const value = this.evalExpr(expr);
      this.emit({
        event: 'assign',
        description: `执行 ${exprToText(expr)}，${exprToText(expr.operand)} 变为 ${formatValue(value)}`,
        line: expr.line,
      });
      return;
    }
    if (expr.kind === 'postfix') {
      const value = this.evalExpr(expr);
      this.emit({
        event: 'assign',
        description: `执行 ${exprToText(expr)}，${exprToText(expr.operand)} 变为 ${formatValue(value)}`,
        line: expr.line,
      });
      return;
    }
    this.evalExpr(expr);
    if (this.steps.length === stepsBefore) {
      this.emit({
        event: 'step',
        description: `执行 ${truncateText(exprToText(expr), 50)}`,
        line: expr.line,
      });
    }
  }

  private execDecl(stmt: StmtNode & { kind: 'decl' }): void {
    const typeSpec = stmt.decl.typeSpec;
    for (const declarator of stmt.decl.declarators) {
      if (!declarator.name) continue;
      const typeText = this.declTypeText(typeSpec.text, declarator);
      const value = this.instantiateDeclarator(declarator, typeSpec.base, typeText);
      this.declare(declarator.name, value, typeText, typeSpec.isConst);
      this.emit({
        event: 'declare',
        description: declarator.init
          ? `声明 ${declarator.name} = ${formatValue(value)}`
          : `声明 ${declarator.name}`,
        line: declarator.line,
      });
    }
  }

  private execWhile(stmt: StmtNode & { kind: 'while' }): Signal {
    let iteration = 0;
    for (;;) {
      const condition = this.evalExpr(stmt.cond);
      const result = truthy(condition);
      iteration++;
      this.emit({
        event: 'loop',
        description: `第 ${iteration} 次判断 ${exprToText(stmt.cond)} → ${result ? '真' : '假'}`,
        line: stmt.line,
        conditionResult: result,
      });
      if (!result) return NORMAL;
      const signal = this.execStmt(stmt.body);
      if (signal.kind === 'break') return NORMAL;
      if (signal.kind === 'return') return signal;
      // continue → 进入下一次判断
    }
  }

  private execDoWhile(stmt: StmtNode & { kind: 'doWhile' }): Signal {
    let iteration = 0;
    for (;;) {
      const signal = this.execStmt(stmt.body);
      if (signal.kind === 'break') return NORMAL;
      if (signal.kind === 'return') return signal;
      const condition = this.evalExpr(stmt.cond);
      const result = truthy(condition);
      iteration++;
      this.emit({
        event: 'loop',
        description: `第 ${iteration} 次判断 ${exprToText(stmt.cond)} → ${result ? '真' : '假'}`,
        line: stmt.line,
        conditionResult: result,
      });
      if (!result) return NORMAL;
    }
  }

  private execFor(stmt: StmtNode & { kind: 'for' }): Signal {
    const scope = new Scope(this.currentScope());
    const frame = this.currentFrame();
    if (!frame) return NORMAL;
    frame.scopes.push(scope);
    try {
      if (stmt.init) {
        const signal = this.execStmt(stmt.init);
        if (signal.kind !== 'normal') return signal;
      }
      for (const expr of stmt.initExprs) this.evalExpr(expr);

      let iteration = 0;
      for (;;) {
        let result = true;
        if (stmt.cond) {
          const condition = this.evalExpr(stmt.cond);
          result = truthy(condition);
        }
        iteration++;
        this.emit({
          event: 'loop',
          description: stmt.cond
            ? `第 ${iteration} 次判断 ${exprToText(stmt.cond)} → ${result ? '真' : '假'}`
            : `第 ${iteration} 次循环`,
          line: stmt.line,
          conditionResult: result,
        });
        if (!result) return NORMAL;
        const signal = this.execStmt(stmt.body);
        if (signal.kind === 'break') return NORMAL;
        if (signal.kind === 'return') return signal;
        for (const update of stmt.update) {
          const value = this.evalExpr(update);
          this.emit({
            event: 'assign',
            description: `执行 ${exprToText(update)}，${this.updateTargetText(update)}变为 ${formatValue(value)}`,
            line: update.line,
          });
        }
      }
    } finally {
      frame.scopes.pop();
    }
  }

  private updateTargetText(update: ExprNode): string {
    if (update.kind === 'assign') return `${exprToText(update.target)} `;
    if (update.kind === 'postfix') return `${exprToText(update.operand)} `;
    if (update.kind === 'unary' && (update.op === '++' || update.op === '--')) return `${exprToText(update.operand)} `;
    return '';
  }

  private execRangeFor(stmt: StmtNode & { kind: 'rangeFor' }): Signal {
    const iterable = this.evalExpr(stmt.iterable);
    let items: RValue[];
    if (iterable.t === 'array') items = iterable.elems;
    else if (iterable.t === 'string') {
      items = Array.from(iterable.v).map((ch) => intValue(ch.charCodeAt(0), 'char'));
    } else {
      throw new SimError('范围 for 只能遍历数组或字符串。', stmt.line, 'unsupported');
    }
    for (const item of items) {
      const scope = new Scope(this.currentScope());
      const frame = this.currentFrame();
      if (!frame) return NORMAL;
      frame.scopes.push(scope);
      try {
        this.declare(stmt.varName, item, 'int');
        this.emit({
          event: 'declare',
          description: `遍历元素 ${stmt.varName} = ${formatValue(item)}`,
          line: stmt.line,
        });
        const signal = this.execStmt(stmt.body);
        if (signal.kind === 'break') return NORMAL;
        if (signal.kind === 'return') return signal;
      } finally {
        frame.scopes.pop();
      }
    }
    return NORMAL;
  }

  private execSwitch(stmt: StmtNode & { kind: 'switch' }): Signal {
    const target = this.evalExpr(stmt.expr);
    let startIndex = -1;
    let defaultIndex = -1;
    for (let i = 0; i < stmt.cases.length; i++) {
      const caseNode = stmt.cases[i];
      if (caseNode.isDefault) {
        defaultIndex = i;
        continue;
      }
      if (!caseNode.valueExpr) continue;
      if (startIndex >= 0) continue;
      const caseValue = this.evalExpr(caseNode.valueExpr);
      if (this.valuesEqual(target, caseValue)) startIndex = i;
    }
    if (startIndex < 0) startIndex = defaultIndex;
    this.emit({
      event: 'branch',
      description:
        startIndex >= 0
          ? `switch(${exprToText(stmt.expr)}) 匹配 ${stmt.cases[startIndex].label}`
          : `switch(${exprToText(stmt.expr)}) 没有匹配的 case`,
      line: stmt.line,
      conditionResult: startIndex >= 0,
    });
    if (startIndex < 0) return NORMAL;
    for (let i = startIndex; i < stmt.cases.length; i++) {
      for (const inner of stmt.cases[i].statements) {
        const signal = this.execStmt(inner);
        if (signal.kind === 'break') return NORMAL;
        if (signal.kind === 'return') return signal;
        if (signal.kind === 'continue') return signal;
      }
    }
    return NORMAL;
  }

  private valuesEqual(left: RValue, right: RValue): boolean {
    if (left.t === 'string' || right.t === 'string') {
      return (charsOf(left) ?? formatValue(left)) === (charsOf(right) ?? formatValue(right));
    }
    return asNumber(left) === asNumber(right);
  }

  /* ============================== 声明实例化 ============================== */

  private declTypeText(baseText: string, declarator: { pointerDepth: number; isReference: boolean }): string {
    let text = baseText;
    if (declarator.pointerDepth > 0) text += '*'.repeat(declarator.pointerDepth);
    if (declarator.isReference) text += '&';
    return text;
  }

  private instantiateDeclarator(
    declarator: { name: string; pointerDepth: number; isReference: boolean; arrayDims: (number | null)[]; init?: ExprNode },
    base: string,
    typeText: string,
  ): RValue {
    if (declarator.arrayDims.length > 0) {
      const dims = declarator.arrayDims.map((d) => (d === null ? 0 : d));
      return this.createArray(base, declarator.pointerDepth, dims, declarator.init);
    }
    if (declarator.pointerDepth > 0) {
      if (!declarator.init) return nullValue();
      const value = this.evalExpr(declarator.init);
      return this.coercePointer(value, base);
    }
    if (isStringType(base) && !isPointerType(typeText)) {
      if (!declarator.init) return stringValue('', base);
      return coerceValue(this.evalExpr(declarator.init), typeText);
    }
    const className = lastSegment(base);
    if (this.classMap.has(className)) {
      const cls = this.classMap.get(className) as ClassDeclNode;
      if (declarator.init && declarator.init.kind === 'initlist') {
        return this.createStructValue(cls.name, declarator.init);
      }
      if (declarator.init && declarator.init.kind === 'call') {
        throw new SimError('class / struct 的构造函数调用暂不支持单步执行。', declarator.init.line, 'unsupported');
      }
      return this.createStructValue(cls.name, undefined);
    }
    if (!declarator.init) return this.defaultScalar(base, typeText);
    return coerceValue(this.evalExpr(declarator.init), typeText);
  }

  private coercePointer(value: RValue, base: string): RValue {
    if (value.t === 'array') return arrayToPointer(value, 'arr');
    if (value.t === 'pointer' || value.t === 'null') return value;
    if (value.t === 'string') {
      return {
        t: 'pointer',
        label: '(字符串常量)',
        target: null,
        elemType: 'char',
        typeText: `${base}*`,
        offset: 0,
        str: value.v,
      };
    }
    return nullValue();
  }

  private defaultScalar(base: string, typeText: string): RValue {
    if (isStringType(typeText)) return stringValue('', typeText);
    if (isCharType(typeText)) return intValue(0, typeText);
    if (isFloatType(typeText)) return floatValue(0, typeText);
    if (/bool/.test(typeText)) return boolValue(false);
    return intValue(0, typeText || base || 'int');
  }

  private createArray(
    base: string,
    pointerDepth: number,
    dims: number[],
    init: ExprNode | undefined,
  ): ArrayValue {
    const className = lastSegment(base);
    const cls = this.classMap.get(className);
    const elemType = pointerDepth > 0 ? `${base}*` : base;
    let resolvedDims = dims.slice();
    if (resolvedDims.length === 0) resolvedDims = [0];
    if (init) {
      if (init.kind === 'initlist' && resolvedDims[0] <= 0) resolvedDims[0] = init.items.length;
      if (init.kind === 'string' && resolvedDims[0] <= 0) resolvedDims[0] = Array.from(init.value).length + 1;
    }
    resolvedDims = resolvedDims.map((d) => (d > 0 ? d : 1));

    // 多维数组按行嵌套，这样 a[0][2] 与 a[0] 都能自然工作
    if (resolvedDims.length > 1) {
      const rows = resolvedDims[0];
      const initItems = init && init.kind === 'initlist' ? init.items : [];
      const elems: RValue[] = [];
      for (let i = 0; i < rows; i++) {
        elems.push(this.createArray(base, pointerDepth, resolvedDims.slice(1), initItems[i]));
      }
      return {
        t: 'array',
        elems,
        dims: resolvedDims,
        elemType: pointerDepth > 0 ? `${base}*` : base,
        typeText: `${base}${resolvedDims.map((d) => `[${d}]`).join('')}`,
      };
    }

    const total = countElements(resolvedDims);
    const elems: RValue[] = new Array(total);

    const makeDefault = (): RValue => {
      if (cls) return this.createStructValue(cls.name, undefined);
      if (pointerDepth > 0) return nullValue();
      return this.defaultScalar(base, elemType);
    };
    for (let i = 0; i < total; i++) elems[i] = makeDefault();

    if (init) {
      if (init.kind === 'string' && isCharType(elemType)) {
        const chars = Array.from(init.value);
        for (let i = 0; i < total; i++) elems[i] = intValue(i < chars.length ? chars[i].charCodeAt(0) : 0, elemType);
      } else if (cls) {
        if (init.kind === 'initlist') {
          for (let i = 0; i < Math.min(total, init.items.length); i++) {
            const item = init.items[i];
            if (item.kind === 'initlist') elems[i] = this.createStructValue(cls.name, item);
            else elems[i] = this.createStructValue(cls.name, undefined);
          }
        }
      } else if (isCharType(elemType) && resolvedDims.length >= 2 && init.kind === 'initlist' && init.items.every((item) => item.kind === 'string')) {
        const rowLength = resolvedDims[resolvedDims.length - 1];
        init.items.forEach((item, row) => {
          if (item.kind !== 'string') return;
          const chars = Array.from(item.value);
          for (let col = 0; col < rowLength; col++) {
            const index = row * rowLength + col;
            if (index < total) {
              elems[index] = intValue(col < chars.length ? chars[col].charCodeAt(0) : 0, elemType);
            }
          }
        });
      } else {
        const flat: ExprNode[] = [];
        const flatten = (expr: ExprNode): void => {
          if (expr.kind === 'initlist') {
            for (const item of expr.items) flatten(item);
            return;
          }
          flat.push(expr);
        };
        if (init.kind === 'initlist') flatten(init);
        for (let i = 0; i < Math.min(total, flat.length); i++) {
          elems[i] = pointerDepth > 0
            ? this.coercePointer(this.evalExpr(flat[i]), base)
            : coerceValue(this.evalExpr(flat[i]), elemType);
        }
      }
    }

    return {
      t: 'array',
      elems,
      dims: resolvedDims,
      elemType,
      typeText: `${base}${resolvedDims.map((d) => `[${d}]`).join('')}`,
    };
  }

  private createStructValue(typeName: string, init: ExprNode | undefined): StructValue {
    const cls = this.classMap.get(lastSegment(typeName));
    const value: StructValue = {
      t: 'struct',
      typeName: lastSegment(typeName),
      fields: new Map(),
      fieldTypes: new Map(),
      typeText: lastSegment(typeName),
    };
    if (!cls) return value;
    const fields = cls.fields.filter((field) => !field.isStatic);
    const initItems = init && init.kind === 'initlist' ? init.items : [];
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      const fieldType = this.fieldTypeText(field);
      value.fieldTypes.set(field.name, fieldType);
      const item = initItems[i];
      value.fields.set(field.name, this.defaultFieldValue(field, item));
    }
    return value;
  }

  private fieldTypeText(field: FieldDeclNode): string {
    let text = field.typeText;
    if (field.pointerDepth > 0) text += '*'.repeat(field.pointerDepth);
    if (field.isReference) text += '&';
    return text;
  }

  private defaultFieldValue(field: FieldDeclNode, init: ExprNode | undefined): RValue {
    const dims = field.arrayDims.map((d) => (d === null ? 0 : d));
    if (dims.length > 0) {
      return this.createArray(field.base, field.pointerDepth, dims, init);
    }
    if (field.pointerDepth > 0) {
      return init ? this.coercePointer(this.evalExpr(init), field.base) : nullValue();
    }
    const className = lastSegment(field.base);
    if (this.classMap.has(className)) {
      return this.createStructValue(className, init);
    }
    if (isStringType(field.typeText)) {
      return init ? coerceValue(this.evalExpr(init), field.typeText) : stringValue('', field.typeText);
    }
    if (init) return coerceValue(this.evalExpr(init), this.fieldTypeText(field));
    return this.defaultScalar(field.base, this.fieldTypeText(field));
  }

  /* ============================== 表达式求值 ============================== */

  private evalExpr(expr: ExprNode): RValue {
    this.tick();
    switch (expr.kind) {
      case 'number':
        if (expr.isFloat) {
          return floatValue(expr.value, /[fF]$/.test(expr.raw) ? 'float' : 'double');
        }
        return intValue(expr.value, 'int');
      case 'string':
        return stringValue(expr.value);
      case 'char':
        return intValue(expr.value.length > 0 ? expr.value.charCodeAt(0) : 0, 'char');
      case 'bool':
        return boolValue(expr.value);
      case 'null':
        return nullValue();
      case 'ident':
        return this.evalIdent(expr);
      case 'unary':
        return this.evalUnary(expr);
      case 'postfix':
        return this.evalIncDec(expr.operand, expr.op, false, expr.line);
      case 'binary':
        return this.evalBinary(expr);
      case 'assign':
        return this.evalAssign(expr);
      case 'ternary':
        return truthy(this.evalExpr(expr.cond)) ? this.evalExpr(expr.whenTrue) : this.evalExpr(expr.whenFalse);
      case 'call':
        return this.evalCall(expr);
      case 'index': {
        const object = this.evalExpr(expr.object);
        const index = asInt(this.evalExpr(expr.index));
        return this.readElement(object, index, expr.line, expr);
      }
      case 'member':
        return this.evalMember(expr);
      case 'cast': {
        const value = this.evalExpr(expr.expr);
        if (isPointerType(expr.typeText)) {
          if (value.t === 'int' && value.v === 0) return nullValue();
          return value;
        }
        return coerceValue(value, expr.typeText);
      }
      case 'sizeof':
        return intValue(this.sizeOfExpr(expr), 'int');
      case 'new':
        return this.evalNew(expr);
      case 'delete':
        return this.evalDelete(expr);
      case 'initlist': {
        const elems = expr.items.map((item) =>
          item.kind === 'initlist' ? this.evalExpr({ ...item, kind: 'initlist' }) : this.evalExpr(item),
        );
        return {
          t: 'array',
          elems,
          dims: [elems.length],
          elemType: 'int',
          typeText: 'initializer_list',
        };
      }
      case 'comma': {
        let last: RValue = voidValue();
        for (const item of expr.items) last = this.evalExpr(item);
        return last;
      }
      case 'lambda':
        throw new SimError('lambda 表达式暂不支持单步执行。', expr.line, 'unsupported');
      case 'unknown':
      default:
        throw new SimError(`表达式 ${exprToText(expr)} 暂不支持单步执行。`, expr.line, 'unsupported');
    }
  }

  private evalIdent(expr: ExprNode & { kind: 'ident' }): RValue {
    if (expr.name === 'endl') return stringValue('\n');
    const enumValue = this.enumValues.get(expr.name);
    if (enumValue !== undefined) return intValue(enumValue, 'int');
    if (expr.name === 'std') throw new SimError('std 命名空间不能直接当作值使用。', expr.line, 'unsupported');
    const slot = this.lookupSlot(expr.name, expr.line);
    return slot.value;
  }

  private evalUnary(expr: ExprNode & { kind: 'unary' }): RValue {
    if (expr.op === '&') {
      // &a[i] 保留数组信息，这样 p = &a[2] 之后 p[1] 仍然可用
      if (expr.operand.kind === 'index') {
        const indexExpr = expr.operand;
        const object = this.evalExpr(indexExpr.object);
        const index = asInt(this.evalExpr(indexExpr.index));
        if (object.t === 'array') {
          if (index < 0 || index >= object.elems.length) {
            throw new SimError(`数组下标 ${index} 越界（长度 ${object.elems.length}）。`, expr.line);
          }
          return {
            t: 'pointer',
            label: this.elementLabel(indexExpr, index),
            target: arrayElementRef(object, index, this.elementLabel(indexExpr, index)),
            elemType: object.elemType,
            typeText: `${object.elemType}*`,
            array: object,
            offset: index,
          };
        }
        if (object.t === 'pointer' && object.array) {
          const absolute = object.offset + index;
          if (absolute < 0 || absolute >= object.array.elems.length) {
            throw new SimError(`指针下标 ${index} 越界。`, expr.line);
          }
          return {
            ...object,
            label: this.elementLabel(indexExpr, index),
            offset: absolute,
          };
        }
      }
      const ref = this.resolveLValue(expr.operand);
      const typeText = ref.typeText ?? 'int';
      return {
        t: 'pointer',
        label: ref.label,
        target: ref,
        elemType: baseTypeName(typeText),
        typeText: `${typeText}*`,
        offset: 0,
      };
    }
    if (expr.op === '*') {
      const pointer = this.evalExpr(expr.operand);
      return this.derefValue(pointer, expr.line, expr);
    }
    if (expr.op === '++' || expr.op === '--') {
      return this.evalIncDec(expr.operand, expr.op, true, expr.line);
    }
    const value = this.evalExpr(expr.operand);
    switch (expr.op) {
      case '-':
        if (value.t === 'float') return floatValue(-value.v, value.typeText);
        return intValue(-asInt(value), value.t === 'int' ? value.typeText : 'int');
      case '+':
        return value;
      case '!':
        return boolValue(!truthy(value));
      case '~':
        return intValue(~asInt(value), 'int');
      default:
        throw new SimError(`一元运算符 ${expr.op} 暂不支持。`, expr.line, 'unsupported');
    }
  }

  private evalIncDec(operand: ExprNode, op: '++' | '--' | string, prefix: boolean, line: number): RValue {
    const ref = this.resolveLValue(operand);
    const current = ref.get();
    const delta = op === '++' ? 1 : -1;
    let next: RValue;
    if (current.t === 'float') next = floatValue(current.v + delta, current.typeText);
    else if (current.t === 'int') next = intValue(current.v + delta, current.typeText);
    else if (current.t === 'pointer' && current.array) {
      next = { ...current, offset: current.offset + delta };
    } else {
      throw new SimError('这个值不能自增 / 自减。', line);
    }
    ref.set(next);
    return prefix ? next : current;
  }

  private evalBinary(expr: ExprNode & { kind: 'binary' }): RValue {
    if (expr.op === '&&') {
      if (!truthy(this.evalExpr(expr.left))) return boolValue(false);
      return boolValue(truthy(this.evalExpr(expr.right)));
    }
    if (expr.op === '||') {
      if (truthy(this.evalExpr(expr.left))) return boolValue(true);
      return boolValue(truthy(this.evalExpr(expr.right)));
    }
    if (expr.op === '<<') {
      const { base } = flattenBinaryChain(expr, '<<');
      if (/(^|::)cout$/.test(rootName(base))) return this.execCout(expr);
    }
    if (expr.op === '>>') {
      const { base } = flattenBinaryChain(expr, '>>');
      if (/(^|::)cin$/.test(rootName(base))) return this.execCin(expr);
    }
    const left = this.evalExpr(expr.left);
    const right = this.evalExpr(expr.right);
    return this.binaryOp(expr.op, left, right, expr.line);
  }

  private binaryOp(op: string, left: RValue, right: RValue, line: number): RValue {
    // 字符串拼接 / 比较
    if (op === '+' && (left.t === 'string' || right.t === 'string')) {
      return stringValue(this.toText(left) + this.toText(right));
    }
    if ((op === '==' || op === '!=') && (left.t === 'string' || right.t === 'string')) {
      const equal = this.toText(left) === this.toText(right);
      return boolValue(op === '==' ? equal : !equal);
    }
    // 指针运算
    if (left.t === 'pointer' && (op === '+' || op === '-') && right.t !== 'pointer') {
      const delta = asInt(right) * (op === '+' ? 1 : -1);
      return { ...left, offset: left.offset + delta, label: `${left.array ? this.arrayBaseLabel(left.label) : left.label}${op}${Math.abs(delta)}` };
    }
    if (left.t === 'pointer' && (op === '==' || op === '!=')) {
      const rightIsNull = right.t === 'null' || (right.t === 'int' && right.v === 0);
      const leftIsNull = left.target === null && left.array === undefined && left.str === undefined;
      const equal = rightIsNull ? leftIsNull : right.t === 'pointer' && left.label === right.label;
      return boolValue(op === '==' ? equal : !equal);
    }
    if (right.t === 'pointer' && (op === '==' || op === '!=')) {
      return this.binaryOp(op, right, left, line);
    }

    switch (op) {
      case '+':
        return this.arithmetic(left, right, (a, b) => a + b);
      case '-':
        return this.arithmetic(left, right, (a, b) => a - b);
      case '*':
        return this.arithmetic(left, right, (a, b) => a * b);
      case '/': {
        const divisor = asNumber(right);
        if (divisor === 0) throw new SimError('除数为 0，无法继续执行。', line);
        const leftNumber = asNumber(left);
        if (left.t === 'float' || right.t === 'float') {
          return floatValue(leftNumber / divisor, this.resultFloatType(left, right));
        }
        return intValue(Math.trunc(leftNumber / divisor), this.resultIntType(left, right));
      }
      case '%': {
        const divisor = asInt(right);
        if (divisor === 0) throw new SimError('取余的除数为 0，无法继续执行。', line);
        return intValue(asInt(left) % divisor, this.resultIntType(left, right));
      }
      case '<':
      case '<=':
      case '>':
      case '>=': {
        const a = asNumber(left);
        const b = asNumber(right);
        const result = op === '<' ? a < b : op === '<=' ? a <= b : op === '>' ? a > b : a >= b;
        return boolValue(result);
      }
      case '==':
      case '!=': {
        const equal = asNumber(left) === asNumber(right);
        return boolValue(op === '==' ? equal : !equal);
      }
      case '&':
        return intValue(asInt(left) & asInt(right), 'int');
      case '|':
        return intValue(asInt(left) | asInt(right), 'int');
      case '^':
        return intValue(asInt(left) ^ asInt(right), 'int');
      case '<<':
        return intValue(asInt(left) << (asInt(right) & 31), 'int');
      case '>>':
        return intValue(asInt(left) >> (asInt(right) & 31), 'int');
      default:
        throw new SimError(`运算符 ${op} 暂不支持单步执行。`, line, 'unsupported');
    }
  }

  private arithmetic(
    left: RValue,
    right: RValue,
    operation: (a: number, b: number) => number,
  ): RValue {
    const a = asNumber(left);
    const b = asNumber(right);
    const result = operation(a, b);
    if (left.t === 'float' || right.t === 'float') {
      return floatValue(result, this.resultFloatType(left, right));
    }
    return intValue(result, this.resultIntType(left, right));
  }

  private resultFloatType(left: RValue, right: RValue): string {
    if (left.t === 'float' && /double/i.test(left.typeText)) return left.typeText;
    if (right.t === 'float' && /double/i.test(right.typeText)) return right.typeText;
    return 'float';
  }

  private resultIntType(left: RValue, right: RValue): string {
    if (left.t === 'int' && !/bool|char/.test(left.typeText)) return left.typeText;
    if (right.t === 'int' && !/bool|char/.test(right.typeText)) return right.typeText;
    return 'int';
  }

  private evalAssign(expr: ExprNode & { kind: 'assign' }): RValue {
    const ref = this.resolveLValue(expr.target);
    if (expr.op === '=') {
      const raw = this.evalExpr(expr.value);
      const value = this.coerceForRef(raw, ref);
      ref.set(value);
      return value;
    }
    const current = ref.get();
    const right = this.evalExpr(expr.value);
    const baseOp = expr.op.slice(0, -1);
    let next: RValue;
    if (baseOp === '+' && (current.t === 'string' || right.t === 'string')) {
      next = stringValue(this.toText(current) + this.toText(right));
    } else {
      next = this.binaryOp(baseOp, current, right, expr.line);
    }
    const value = this.coerceForRef(next, ref);
    ref.set(value);
    return value;
  }

  private coerceForRef(value: RValue, ref: Ref): RValue {
    if (ref.typeText) return coerceValue(value, ref.typeText);
    return value;
  }

  private evalCall(expr: ExprNode & { kind: 'call' }): RValue {
    const callee = expr.callee;
    if (callee.kind === 'member' && callee.op !== '::') {
      return this.evalMemberCall(expr, callee);
    }
    const name = expr.name || (callee.kind === 'ident' ? callee.name : '');
    switch (name) {
      case 'printf':
        return this.builtinPrintf(expr);
      case 'scanf':
        return this.builtinScanf(expr);
      case 'puts': {
        const arg = this.evalExpr(expr.args[0] ?? { kind: 'null', line: expr.line, column: expr.column, endLine: expr.endLine, endColumn: expr.endColumn });
        const text = charsOf(arg) ?? this.toText(arg);
        this.printOutput(`${text}\n`, expr.line);
        return intValue(0);
      }
      case 'putchar': {
        const value = expr.args[0] ? this.evalExpr(expr.args[0]) : intValue(0);
        this.printOutput(String.fromCharCode(asInt(value)), expr.line);
        return intValue(asInt(value));
      }
      case 'strlen': {
        const value = expr.args[0] ? this.evalExpr(expr.args[0]) : stringValue('');
        const text = charsOf(value) ?? '';
        return intValue(Array.from(text).length);
      }
      case 'abs':
      case 'fabs': {
        const value = expr.args[0] ? this.evalExpr(expr.args[0]) : intValue(0);
        return name === 'fabs' ? floatValue(Math.abs(asNumber(value))) : intValue(Math.abs(asInt(value)));
      }
      case 'sqrt': {
        const value = expr.args[0] ? this.evalExpr(expr.args[0]) : intValue(0);
        return floatValue(Math.sqrt(asNumber(value)));
      }
      case 'pow': {
        const base = expr.args[0] ? asNumber(this.evalExpr(expr.args[0])) : 0;
        const exponent = expr.args[1] ? asNumber(this.evalExpr(expr.args[1])) : 0;
        return floatValue(Math.pow(base, exponent));
      }
      case 'floor': {
        const value = expr.args[0] ? this.evalExpr(expr.args[0]) : intValue(0);
        return floatValue(Math.floor(asNumber(value)));
      }
      case 'ceil': {
        const value = expr.args[0] ? this.evalExpr(expr.args[0]) : intValue(0);
        return floatValue(Math.ceil(asNumber(value)));
      }
      case 'max':
      case 'min': {
        const left = expr.args[0] ? this.evalExpr(expr.args[0]) : intValue(0);
        const right = expr.args[1] ? this.evalExpr(expr.args[1]) : intValue(0);
        const a = asNumber(left);
        const b = asNumber(right);
        const result = name === 'max' ? Math.max(a, b) : Math.min(a, b);
        if (left.t === 'float' || right.t === 'float') return floatValue(result);
        return intValue(result, left.t === 'int' ? left.typeText : 'int');
      }
      case 'toupper':
      case 'tolower': {
        const value = expr.args[0] ? this.evalExpr(expr.args[0]) : intValue(0);
        const code = asInt(value);
        const text = String.fromCharCode(code);
        return intValue((name === 'toupper' ? text.toUpperCase() : text.toLowerCase()).charCodeAt(0), 'char');
      }
      case 'getchar': {
        const char = this.readRawChar('字符');
        return intValue(char.charCodeAt(0), 'char');
      }
      case 'atoi':
      case 'atof':
      case 'stoi': {
        const text = this.textOfArg(expr.args[0]).trim();
        if (name === 'atof') return floatValue(Number.parseFloat(text) || 0);
        if (name === 'stoi' && !/^[+-]?\d/.test(text)) {
          throw new SimError(`stoi 无法把 "${truncateText(text, 12)}" 转成整数。`, expr.line);
        }
        return intValue(Number.parseInt(text, 10) || 0);
      }
      case 'to_string': {
        return stringValue(this.textOfArg(expr.args[0]));
      }
      case 'labs': {
        const value = expr.args[0] ? this.evalExpr(expr.args[0]) : intValue(0);
        return intValue(Math.abs(asInt(value)));
      }
      case 'sin':
      case 'cos':
      case 'tan':
      case 'fmod': {
        const first = expr.args[0] ? asNumber(this.evalExpr(expr.args[0])) : 0;
        const second = expr.args[1] ? asNumber(this.evalExpr(expr.args[1])) : 0;
        if (name === 'fmod') {
          if (second === 0) throw new SimError('fmod 的除数不能是 0。', expr.line);
          return floatValue(first % second);
        }
        const fn = name === 'sin' ? Math.sin : name === 'cos' ? Math.cos : Math.tan;
        return floatValue(fn(first));
      }
      case 'isdigit':
      case 'isalpha':
      case 'isalnum':
      case 'isspace':
      case 'isupper':
      case 'islower': {
        const code = expr.args[0] ? asInt(this.evalExpr(expr.args[0])) : 0;
        const char = String.fromCharCode(code);
        const test =
          name === 'isdigit'
            ? /[0-9]/.test(char)
            : name === 'isalpha'
              ? /[A-Za-z]/.test(char)
              : name === 'isalnum'
                ? /[0-9A-Za-z]/.test(char)
                : name === 'isspace'
                  ? /\s/.test(char)
                  : name === 'isupper'
                    ? /[A-Z]/.test(char)
                    : /[a-z]/.test(char);
        return intValue(test ? 1 : 0);
      }
      case 'strcpy':
      case 'strncpy': {
        const source = this.textOfArg(expr.args[1]);
        const target = this.evalScanTarget(expr.args[0], expr.line);
        const limit =
          name === 'strncpy' && expr.args[2] ? Math.max(0, asInt(this.evalExpr(expr.args[2]))) : undefined;
        const chars = Array.from(source);
        if (limit === undefined) {
          this.writeCharsToTarget(target, chars.join(''));
        } else {
          this.writeCharsToTarget(target, chars.slice(0, limit).join(''));
        }
        return stringValue(source);
      }
      case 'strcat': {
        const target = this.evalScanTarget(expr.args[0], expr.line);
        const existing = this.arrayTextOf(target.array);
        const source = this.textOfArg(expr.args[1]);
        this.writeCharsToTarget(target, `${existing}${source}`);
        return stringValue(`${existing}${source}`);
      }
      case 'strcmp':
      case 'strncmp': {
        const left = this.textOfArg(expr.args[0]);
        const right = this.textOfArg(expr.args[1]);
        const limit =
          name === 'strncmp' && expr.args[2] ? Math.max(0, asInt(this.evalExpr(expr.args[2]))) : Number.MAX_SAFE_INTEGER;
        const a = Array.from(left).slice(0, limit);
        const b = Array.from(right).slice(0, limit);
        const length = Math.min(a.length, b.length);
        let result = 0;
        for (let i = 0; i < length; i++) {
          const diff = a[i].charCodeAt(0) - b[i].charCodeAt(0);
          if (diff !== 0) {
            result = diff < 0 ? -1 : 1;
            break;
          }
        }
        if (result === 0 && a.length !== b.length && limit > length) {
          result = a.length < b.length ? -1 : 1;
        }
        return intValue(result);
      }
      default:
        break;
    }

    if (this.isTypeCastName(name)) {
      const value = expr.args[0] ? this.evalExpr(expr.args[0]) : intValue(0);
      return coerceValue(value, name);
    }

    const fn = this.functionMap.get(name);
    if (!fn) {
      if (name === 'exit' || name === 'abort') throw new SimError(`函数 ${name}() 暂不支持单步执行。`, expr.line, 'unsupported');
      throw new SimError(`调用了源码中没有定义的函数 ${name}()。`, expr.line, 'unsupported');
    }
    const args = expr.args.map((arg) => this.evalExpr(arg));
    return this.callFunction(fn, args, expr.line);
  }

  /* ============================== 堆内存 ============================== */

  /** new T / new T(初值) / new T[n]：分配一块堆内存并返回指向它的指针 */
  private evalNew(expr: ExprNode & { kind: 'new' }): RValue {
    const rawType = (expr.typeText || 'int').replace(/\s+/g, '');
    const elemType = baseTypeName(rawType);
    const base = lastSegment(elemType);
    const isArray = Boolean(expr.arraySize);
    const alive = this.heapBlocks.filter((block) => !block.freed).length;
    if (alive >= MAX_HEAP_BLOCKS) {
      throw new SimError(`堆上同时存在的内存块超过 ${MAX_HEAP_BLOCKS} 个，教学解释器停止继续分配。`, expr.line);
    }

    let length = 1;
    if (isArray) {
      length = expr.arraySize ? asInt(this.evalExpr(expr.arraySize)) : 0;
      if (length <= 0) throw new SimError('new[] 的长度必须大于 0。', expr.line);
    }

    const cls = this.classMap.get(base);
    const makeDefault = (): RValue =>
      cls ? this.createStructValue(cls.name, undefined) : this.defaultScalar(base, elemType);
    const elems: RValue[] = [];
    for (let i = 0; i < length; i++) elems.push(makeDefault());

    const typeText = isArray ? `${elemType}[${length}]` : elemType;
    const array: ArrayValue = { t: 'array', elems, dims: [length], elemType, typeText };
    const id = this.nextHeapId++;
    const label = `heap#${id}`;
    const block: HeapBlock = {
      id,
      label,
      elemType,
      isArray,
      array,
      ref: arrayElementRef(array, 0, `${label}[0]`),
      freed: false,
      line: expr.line,
    };

    // new int(5)：带初值；evaluate 放在登记之后，异常时也能在堆视图里看到这块内存
    this.heapBlocks.push(block);
    this.heapIndex.set(array, block);
    this.heapPeak = Math.max(this.heapPeak, this.heapBlocks.filter((b) => !b.freed).length);

    if (!isArray && expr.args.length > 0) {
      array.elems[0] = coerceValue(this.evalExpr(expr.args[0]), elemType);
    }

    this.emit({
      event: 'declare',
      description: `new ${typeText} → ${label}（${length} 个 ${elemType}${isArray ? '' : '，值 ' + formatValue(array.elems[0])}）`,
      line: expr.line,
    });

    return {
      t: 'pointer',
      label: `${label}[0]`,
      target: block.ref,
      elemType,
      typeText: `${elemType}*`,
      array,
      offset: 0,
    };
  }

  /** delete p / delete[] p：释放并标记，重复释放或释放后使用都给明确报错 */
  private evalDelete(expr: ExprNode & { kind: 'delete' }): RValue {
    const value = this.evalExpr(expr.expr);
    if (value.t === 'null') {
      this.emit({ event: 'assign', description: 'delete 空指针：什么也不会发生', line: expr.line });
      return voidValue();
    }
    if (value.t !== 'pointer') {
      throw new SimError(`delete 需要指针，${exprToText(expr.expr)} 不是指针。`, expr.line);
    }
    const block = value.array ? this.heapIndex.get(value.array) : undefined;
    if (!block) {
      this.heapIssues.push({
        kind: 'invalid-free',
        message: `第 ${expr.line} 行 delete 的地址不是 new 分配的`,
        line: expr.line,
      });
      throw new SimError('这个地址不是 new 出来的，不能 delete。', expr.line);
    }
    if (block.freed) {
      this.heapIssues.push({
        kind: 'double-free',
        message: `${block.label} 被重复释放（第 ${expr.line} 行，最初在第 ${block.line} 行 new）`,
        line: expr.line,
        blockId: block.id,
      });
      throw new SimError(
        `${block.label} 已经在之前的 delete 里释放过了：重复释放是未定义行为，程序可能崩溃。`,
        expr.line,
      );
    }
    if (expr.isArray !== block.isArray) {
      throw new SimError(
        block.isArray
          ? `${block.label} 是 new[] 申请的数组，必须用 delete[] 释放。`
          : `${block.label} 是单个对象，应该用 delete 而不是 delete[]。`,
        expr.line,
      );
    }
    block.freed = true;
    this.emit({
      event: 'assign',
      description: `delete${block.isArray ? '[]' : ''} ${block.label}（释放 ${block.array.elems.length} 个 ${block.elemType}）`,
      line: expr.line,
    });
    return voidValue();
  }

  /** 指针指向的堆块是否已经被释放 */
  private assertHeapAlive(array: ArrayValue | undefined, line: number): void {
    if (!array) return;
    const block = this.heapIndex.get(array);
    if (!block || !block.freed) return;
    this.heapIssues.push({
      kind: 'use-after-free',
      message: `第 ${line} 行使用了已释放的 ${block.label}（在第 ${block.line} 行 new，已 delete）`,
      line,
      blockId: block.id,
    });
    throw new SimError(
      `${block.label} 已经被 delete 了，再去读写它就是「释放后使用」，结果不可预期。`,
      line,
    );
  }

  /** 当前堆状态快照，供 UI 逐步展示 */
  private heapSnapshot(): HeapBlockSnapshot[] | undefined {
    if (this.heapBlocks.length === 0) return undefined;
    const owners = new Map<number, string[]>();
    const note = (name: string, value: RValue): void => {
      if (value.t !== 'pointer' || !value.array) return;
      const block = this.heapIndex.get(value.array);
      if (!block) return;
      const list = owners.get(block.id) ?? [];
      if (!list.includes(name)) list.push(name);
      owners.set(block.id, list);
    };
    for (const slot of this.globalScope.vars.values()) note(slot.name, slot.value);
    for (const frame of this.frames) {
      for (const scope of frame.scopes) {
        for (const slot of scope.vars.values()) note(slot.name, slot.value);
      }
    }

    return this.heapBlocks.map((block) => {
      const all = arrayElementTexts(block.array);
      const values = all.slice(0, HEAP_PREVIEW);
      return {
        id: block.id,
        label: block.label,
        elemType: block.elemType,
        isArray: block.isArray,
        length: block.array.elems.length,
        values,
        hidden: Math.max(0, all.length - values.length),
        freed: block.freed,
        line: block.line,
        owners: owners.get(block.id) ?? [],
      };
    });
  }

  /** 结束时统计泄漏：new 了但没有 delete 的块 */
  private collectLeaks(): void {
    if (this.leaksCollected) return;
    this.leaksCollected = true;
    for (const block of this.heapBlocks) {
      if (block.freed) continue;
      this.heapIssues.push({
        kind: 'leak',
        message: `${block.label}（${block.isArray ? `${block.elemType}[${block.array.elems.length}]` : block.elemType}）在第 ${block.line} 行 new 出来，程序结束前一直没有 delete`,
        line: block.line,
        blockId: block.id,
      });
    }
  }

  private isTypeCastName(name: string): boolean {
    return /^(int|long|short|char|float|double|bool|unsigned|signed|size_t)$/.test(name);
  }

  private evalMemberCall(expr: ExprNode & { kind: 'call' }, callee: ExprNode & { kind: 'member' }): RValue {
    const object = this.evalExpr(callee.object);
    const method = callee.name;
    if (method === 'length' || method === 'size') {
      if (object.t === 'string') return intValue(Array.from(object.v).length);
      if (object.t === 'array') return intValue(object.elems.length);
    }
    if (method === 'c_str' && object.t === 'string') return object;
    if (method === 'at' && expr.args[0]) {
      const index = asInt(this.evalExpr(expr.args[0]));
      return this.readElement(object, index, expr.line, expr);
    }
    throw new SimError(`成员函数 ${method}() 暂不支持单步执行。`, expr.line, 'unsupported');
  }

  private evalMember(expr: ExprNode & { kind: 'member' }): RValue {
    if (expr.op === '::') {
      if (expr.name === 'endl') return stringValue('\n');
      throw new SimError(`命名空间成员 ${exprToText(expr)} 暂不支持单步执行。`, expr.line, 'unsupported');
    }
    let object = this.evalExpr(expr.object);
    if (expr.op === '->') object = this.derefValue(object, expr.line, expr);
    if (object.t === 'struct') {
      const value = object.fields.get(expr.name);
      if (value === undefined) {
        throw new SimError(`结构体 ${object.typeName} 没有成员 ${expr.name}。`, expr.line);
      }
      return value;
    }
    throw new SimError(`${exprToText(expr)} 暂不支持读取。`, expr.line, 'unsupported');
  }

  private sizeOfExpr(expr: ExprNode & { kind: 'sizeof' }): number {
    if (expr.typeText) return this.sizeOfTypeText(expr.typeText);
    if (!expr.expr) return 4;
    if (expr.expr.kind === 'ident') {
      try {
        const slot = this.lookupSlot(expr.expr.name, expr.line);
        if (slot.value.t === 'array') {
          const elemSize = this.sizeOfTypeText(slot.value.elemType);
          return elemSize * slot.value.elems.length;
        }
        return this.sizeOfTypeText(slot.typeText);
      } catch {
        return 4;
      }
    }
    if (expr.expr.kind === 'string') return Array.from(expr.expr.value).length + 1;
    return 4;
  }

  private sizeOfTypeText(typeText: string): number {
    if (isPointerType(typeText)) return 8;
    if (isStringType(typeText)) return 32;
    const base = lastSegment(baseTypeName(typeText));
    const cls = this.classMap.get(base);
    if (cls) {
      let total = 0;
      for (const field of cls.fields) {
        if (field.isStatic) continue;
        const dims = field.arrayDims.map((d) => (d === null ? 0 : d));
        total += this.sizeOfTypeText(this.fieldTypeText(field)) * countElements(dims);
      }
      return Math.max(1, total);
    }
    return scalarSize(base, 0);
  }

  private readElement(object: RValue, index: number, line: number, expr: ExprNode): RValue {
    if (object.t === 'array') {
      if (index < 0 || index >= object.elems.length) {
        throw new SimError(`数组下标 ${index} 越界（长度 ${object.elems.length}）。`, line);
      }
      return object.elems[index];
    }
    if (object.t === 'pointer') {
      if (object.array) {
        const absolute = object.offset + index;
        if (absolute < 0 || absolute >= object.array.elems.length) {
          throw new SimError(`指针下标 ${index} 越界。`, line);
        }
        this.assertHeapAlive(object.array, line);
        return object.array.elems[absolute];
      }
      if (index === 0 && object.target) return object.target.get();
      if (object.str !== undefined && index >= 0 && index < object.str.length) {
        return intValue(object.str.charCodeAt(index), 'char');
      }
      throw new SimError(`空指针或无效指针不能取下标。`, line);
    }
    if (object.t === 'string') {
      const chars = Array.from(object.v);
      if (index < 0 || index >= chars.length) {
        throw new SimError(`字符串下标 ${index} 越界（长度 ${chars.length}）。`, line);
      }
      return intValue(chars[index].charCodeAt(0), 'char');
    }
    if (object.t === 'null') throw new SimError('空指针不能取下标。', line);
    throw new SimError(`${exprToText(expr)} 不能取下标。`, line, 'unsupported');
  }

  private resolveLValue(expr: ExprNode): Ref {
    switch (expr.kind) {
      case 'ident': {
        if (this.enumValues.has(expr.name)) {
          throw new SimError(`${expr.name} 是枚举常量，不能被赋值。`, expr.line);
        }
        const slot = this.lookupSlot(expr.name, expr.line);
        if (slot.isConst) throw new SimError(`常量 ${expr.name} 不能被赋值。`, expr.line);
        return slot.ref;
      }
      case 'index': {
        const object = this.evalExpr(expr.object);
        const index = asInt(this.evalExpr(expr.index));
        if (object.t === 'array') {
          if (index < 0 || index >= object.elems.length) {
            throw new SimError(`数组下标 ${index} 越界（长度 ${object.elems.length}）。`, expr.line);
          }
          return arrayElementRef(object, index, this.elementLabel(expr, index));
        }
        if (object.t === 'pointer' && object.array) {
          const absolute = object.offset + index;
          if (absolute < 0 || absolute >= object.array.elems.length) {
            throw new SimError(`指针下标 ${index} 越界。`, expr.line);
          }
          return arrayElementRef(object.array, absolute, this.elementLabel(expr, index));
        }
        if (object.t === 'string') {
          throw new SimError('暂时不能修改字符串中的单个字符。', expr.line, 'unsupported');
        }
        throw new SimError('空指针不能通过下标赋值。', expr.line);
      }
      case 'unary': {
        if (expr.op === '*') {
          const pointer = this.evalExpr(expr.operand);
          return this.derefRef(pointer, expr.line, expr);
        }
        break;
      }
      case 'member': {
        if (expr.op === '::') throw new SimError('这个成员不能被赋值。', expr.line);
        let object = this.evalExpr(expr.object);
        if (expr.op === '->') object = this.derefValue(object, expr.line, expr);
        if (object.t === 'struct') {
          const fieldType = object.fieldTypes.get(expr.name) ?? 'int';
          return {
            get: () => object.fields.get(expr.name) ?? intValue(0, fieldType),
            set: (value) => {
              object.fields.set(expr.name, value);
            },
            label: exprToText(expr),
            typeText: fieldType,
          };
        }
        throw new SimError(`不能给 ${exprToText(expr)} 赋值。`, expr.line);
      }
      default:
        break;
    }
    throw new SimError(`不能给 ${exprToText(expr)} 赋值。`, expr.line);
  }

  private elementLabel(expr: ExprNode & { kind: 'index' }, index: number): string {
    if (expr.object.kind === 'ident') return `${expr.object.name}[${index}]`;
    return `元素[${index}]`;
  }

  private derefValue(value: RValue, line: number, expr: ExprNode): RValue {
    if (value.t === 'null') throw new SimError('解引用空指针会导致程序崩溃。', line);
    if (value.t !== 'pointer') throw new SimError(`${exprToText(expr)} 不是指针。`, line);
    if (value.array) {
      const absolute = value.offset;
      if (absolute < 0 || absolute >= value.array.elems.length) {
        throw new SimError('指针指向了数组范围之外。', line);
      }
      this.assertHeapAlive(value.array, line);
      return value.array.elems[absolute];
    }
    if (value.target) return value.target.get();
    if (value.str !== undefined) {
      return value.offset < value.str.length
        ? intValue(value.str.charCodeAt(value.offset), 'char')
        : intValue(0, 'char');
    }
    throw new SimError('空指针不能解引用。', line);
  }

  private derefRef(value: RValue, line: number, expr: ExprNode): Ref {
    if (value.t === 'null') throw new SimError('解引用空指针会导致程序崩溃。', line);
    if (value.t !== 'pointer') throw new SimError(`${exprToText(expr)} 不是指针。`, line);
    if (value.array) {
      const absolute = value.offset;
      if (absolute < 0 || absolute >= value.array.elems.length) {
        throw new SimError('指针指向了数组范围之外。', line);
      }
      // 写入路径也要拦住「释放后使用」：*p = x 与 p[i] = x 都走这里
      this.assertHeapAlive(value.array, line);
      const label = value.label;
      return arrayElementRef(value.array, absolute, label);
    }
    if (value.target) return value.target;
    throw new SimError('不能修改字符串常量。', line);
  }

  /* ============================== 输入输出 ============================== */

  private toText(value: RValue): string {
    switch (value.t) {
      case 'int':
        if (isCharType(value.typeText)) return String.fromCharCode(value.v);
        if (/bool/.test(value.typeText)) return value.v !== 0 ? '1' : '0';
        return String(value.v);
      case 'float':
        return formatNumber(value.v);
      case 'string':
        return value.v;
      case 'array': {
        const text = charsOf(value);
        return text ?? formatValue(value);
      }
      case 'pointer':
        return value.str ?? value.label;
      case 'null':
        return '0';
      case 'struct':
        return formatValue(value);
      default:
        return '';
    }
  }

  private execCout(expr: ExprNode & { kind: 'binary' }): RValue {
    const { items } = flattenBinaryChain(expr, '<<');
    let chunk = '';
    for (const item of items) {
      if (item.kind === 'ident' && item.name === 'endl') {
        chunk += '\n';
        continue;
      }
      if (item.kind === 'member' && item.name === 'endl') {
        chunk += '\n';
        continue;
      }
      const value = this.evalExpr(item);
      if (value.t === 'void') continue;
      chunk += this.toText(value);
    }
    this.printOutput(chunk, expr.line);
    return intValue(0);
  }

  private execCin(expr: ExprNode & { kind: 'binary' }): RValue {
    const { items } = flattenBinaryChain(expr, '>>');
    for (const item of items) {
      const ref = this.resolveLValue(item);
      const typeText = ref.typeText ?? 'int';
      let value: RValue;
      if (isCharType(typeText)) {
        this.skipWhitespace();
        value = intValue(this.readRawChar('字符').charCodeAt(0), 'char');
      } else if (isStringType(typeText)) {
        value = stringValue(this.readToken('字符串'));
      } else if (isFloatType(typeText)) {
        value = floatValue(this.readNumberToken(typeText));
      } else {
        value = intValue(this.readNumberToken(typeText));
      }
      ref.set(coerceValue(value, typeText));
      this.emit({
        event: 'assign',
        description: `从输入读入 ${ref.label} = ${formatValue(ref.get())}`,
        line: expr.line,
      });
    }
    return intValue(0);
  }

  private builtinPrintf(expr: ExprNode & { kind: 'call' }): RValue {
    const formatValue_ = this.evalExpr(expr.args[0] ?? {
      kind: 'string',
      value: '',
      raw: '""',
      line: expr.line,
      column: expr.column,
      endLine: expr.endLine,
      endColumn: expr.endColumn,
    });
    const format = charsOf(formatValue_) ?? this.toText(formatValue_);
    const specs = parseFormat(format);
    let out = '';
    let cursor = 0;
    let argIndex = 1;
    for (const spec of specs) {
      out += format.slice(cursor, spec.start);
      cursor = spec.end;
      if (spec.conv === '%') {
        out += '%';
        continue;
      }
      if (spec.dynamicWidth) {
        const widthExpr = expr.args[argIndex];
        argIndex++;
        if (!widthExpr) throw new SimError('printf 的动态宽度缺少参数。', expr.line);
        const width = asInt(this.evalExpr(widthExpr));
        spec.width = Math.abs(width);
        if (width < 0) spec.flags += '-';
      }
      const argExpr = expr.args[argIndex];
      argIndex++;
      if (!argExpr) {
        throw new SimError(`printf 的格式串需要更多参数（缺少第 ${argIndex - 1} 个）。`, expr.line);
      }
      out += this.formatSpecValue(spec, this.evalExpr(argExpr));
    }
    out += format.slice(cursor);
    this.printOutput(out, expr.line);
    return intValue(out.length);
  }

  private formatSpecValue(spec: FormatSpec, value: RValue): string {
    let text: string;
    switch (spec.conv) {
      case 'd':
      case 'i':
        text = String(asInt(value));
        break;
      case 'u':
        text = String(asInt(value) >>> 0);
        break;
      case 'o':
        text = (asInt(value) >>> 0).toString(8);
        break;
      case 'x':
        text = (asInt(value) >>> 0).toString(16);
        break;
      case 'X':
        text = (asInt(value) >>> 0).toString(16).toUpperCase();
        break;
      case 'f':
      case 'F': {
        const precision = spec.precision ?? 6;
        text = asNumber(value).toFixed(precision);
        break;
      }
      case 'e':
      case 'E': {
        const precision = spec.precision ?? 6;
        text = asNumber(value).toExponential(precision);
        if (spec.conv === 'E') text = text.toUpperCase();
        break;
      }
      case 'g':
      case 'G': {
        const number = asNumber(value);
        text = spec.precision !== null ? trimZeros(number.toPrecision(spec.precision)) : formatNumber(number);
        if (spec.conv === 'G') text = text.toUpperCase();
        break;
      }
      case 'c': {
        if (value.t === 'string') text = value.v.charAt(0);
        else text = String.fromCharCode(asInt(value));
        break;
      }
      case 's': {
        text = charsOf(value) ?? this.toText(value);
        if (spec.precision !== null) text = Array.from(text).slice(0, spec.precision).join('');
        break;
      }
      case 'p': {
        if (value.t === 'pointer') text = value.target ? value.label : '0x0';
        else text = '0x0';
        break;
      }
      default:
        return spec.raw;
    }
    return this.padText(text, spec);
  }

  private padText(text: string, spec: FormatSpec): string {
    let result = text;
    if (spec.flags.includes('+') && !result.startsWith('-') && /^[0-9]/.test(result)) result = `+${result}`;
    else if (spec.flags.includes(' ') && !result.startsWith('-') && /^[0-9]/.test(result)) result = ` ${result}`;
    const width = spec.width ?? 0;
    if (result.length >= width) return result;
    const zeroPad = spec.flags.includes('0') && !spec.flags.includes('-') && /^[-+ ]?[0-9]/.test(result);
    const paddingLength = width - result.length;
    if (spec.flags.includes('-')) return result + ' '.repeat(paddingLength);
    if (zeroPad) {
      if (result.startsWith('-') || result.startsWith('+') || result.startsWith(' ')) {
        return result[0] + '0'.repeat(paddingLength) + result.slice(1);
      }
      return '0'.repeat(paddingLength) + result;
    }
    return ' '.repeat(paddingLength) + result;
  }

  private builtinScanf(expr: ExprNode & { kind: 'call' }): RValue {
    const formatValue_ = this.evalExpr(expr.args[0] ?? {
      kind: 'string',
      value: '',
      raw: '""',
      line: expr.line,
      column: expr.column,
      endLine: expr.endLine,
      endColumn: expr.endColumn,
    });
    const format = charsOf(formatValue_) ?? this.toText(formatValue_);
    const specs = parseFormat(format);
    let argIndex = 1;
    let assigned = 0;
    for (const spec of specs) {
      if (spec.conv === '%' || spec.conv === 'n') continue;
      if (spec.suppressed) {
        if (spec.conv === 'c') this.readRawChar('字符');
        else this.readToken('输入');
        continue;
      }
      const argExpr = expr.args[argIndex];
      argIndex++;
      if (!argExpr) throw new SimError('scanf 的格式串需要更多参数。', expr.line);
      const target = this.evalScanTarget(argExpr, expr.line);
      if (spec.conv === 's') {
        const text = this.readToken('字符串');
        if (target.array) {
          const chars = Array.from(text);
          for (let i = 0; i < target.array.elems.length; i++) {
            target.array.elems[i] = intValue(i < chars.length ? chars[i].charCodeAt(0) : 0, 'char');
          }
          target.ref.set(target.array.elems[0] ?? intValue(0, 'char'));
        } else {
          target.ref.set(stringValue(text));
        }
        assigned++;
        this.emit({
          event: 'assign',
          description: `从输入读入 ${target.label} = "${text}"`,
          line: expr.line,
        });
        continue;
      }
      let value: RValue;
      if (spec.conv === 'c') {
        value = intValue(this.readRawChar('字符').charCodeAt(0), 'char');
      } else if (spec.conv === 'f' || spec.conv === 'e' || spec.conv === 'g') {
        value = floatValue(this.readNumberToken('浮点数'));
      } else if ('diuoxX'.includes(spec.conv)) {
        value = intValue(this.readNumberToken('整数'));
      } else {
        value = stringValue(this.readToken('输入'));
      }
      target.ref.set(coerceValue(value, target.typeText));
      assigned++;
      this.emit({
        event: 'assign',
        description: `从输入读入 ${target.label} = ${formatValue(target.ref.get())}`,
        line: expr.line,
      });
    }
    return intValue(assigned);
  }

  /** 把实参读成字符串（字符数组 / std::string / 字面量都适用） */
  private textOfArg(expr: ExprNode | undefined): string {
    if (!expr) return '';
    const value = this.evalExpr(expr);
    return charsOf(value) ?? this.toText(value);
  }

  /** 读出字符数组到第一个 \0 为止的内容 */
  private arrayTextOf(array?: ArrayValue): string {
    if (!array) return '';
    const chars: string[] = [];
    for (const elem of array.elems) {
      const code = elem.t === 'int' ? elem.v : 0;
      if (code === 0) break;
      chars.push(String.fromCharCode(code));
    }
    return chars.join('');
  }

  /** 把字符串写入字符数组（不足部分补 \0），或直接覆盖 std::string */
  private writeCharsToTarget(
    target: { ref: Ref; typeText: string; label: string; array?: ArrayValue },
    text: string,
  ): void {
    if (target.array) {
      const capacity = target.array.elems.length;
      const chars = Array.from(text);
      for (let i = 0; i < capacity; i++) {
        target.array.elems[i] = intValue(i < chars.length ? chars[i].charCodeAt(0) : 0, 'char');
      }
      if (capacity > 0) target.ref.set(target.array.elems[0]);
      return;
    }
    target.ref.set(stringValue(text));
  }

  private evalScanTarget(
    expr: ExprNode,
    line: number,
  ): { ref: Ref; typeText: string; label: string; array?: ArrayValue } {
    const value = this.evalExpr(expr);
    if (value.t === 'pointer') {
      if (value.target) {
        return {
          ref: value.target,
          typeText: value.target.typeText ?? value.elemType ?? 'int',
          label: value.label,
        };
      }
      if (value.array) {
        return {
          ref: arrayElementRef(value.array, 0, value.label),
          typeText: value.array.elemType,
          label: value.label,
          array: value.array,
        };
      }
      throw new SimError('scanf 收到了空指针。', line);
    }
    if (value.t === 'array') {
      return {
        ref: arrayElementRef(value, 0, '数组'),
        typeText: 'char',
        label: '数组',
        array: value,
      };
    }
    if (value.t === 'null') throw new SimError('scanf 收到了空指针。', line);
    throw new SimError('scanf 需要变量的地址，例如 &x（%s 可以传字符数组名）。', line);
  }

  private skipWhitespace(): void {
    while (this.inputPos < this.input.length && /\s/.test(this.input[this.inputPos])) this.inputPos++;
  }

  private readToken(what: string): string {
    this.skipWhitespace();
    if (this.inputPos >= this.input.length) {
      throw new SimError(`输入数据不足：还需要一个${what}。`, this.currentLine);
    }
    const start = this.inputPos;
    while (this.inputPos < this.input.length && !/\s/.test(this.input[this.inputPos])) this.inputPos++;
    return this.input.slice(start, this.inputPos);
  }

  private readRawChar(what: string): string {
    if (this.inputPos >= this.input.length) {
      throw new SimError(`输入数据不足：还需要一个${what}。`, this.currentLine);
    }
    const char = this.input[this.inputPos];
    this.inputPos++;
    return char;
  }

  private readNumberToken(what: string): number {
    const token = this.readToken(what);
    const number = Number(token);
    if (!Number.isFinite(number)) {
      throw new SimError(`无法把输入 "${token}" 解析为${what}。`, this.currentLine);
    }
    return number;
  }

  private arrayBaseLabel(label: string): string {
    return label.replace(/\[\d+\]$/, '');
  }

  /* ============================== 函数调用 ============================== */

  private callFunction(fn: FuncDeclNode, args: RValue[], callLine: number): RValue {
    if (this.frames.length >= MAX_CALL_DEPTH) {
      throw new SimError(`递归层数超过 ${MAX_CALL_DEPTH} 层，可能是没有终止条件的递归。`, callLine, 'runtime');
    }
    const displayName = fn.className ? `${fn.className}::${fn.name}` : fn.name;
    this.emit({
      event: 'call',
      description: `调用 ${displayName}(${args.map((arg) => formatValue(arg)).join(', ')})`,
      line: callLine,
    });

    const parentScope = this.currentScope();
    const frame: Frame = {
      fn,
      name: displayName,
      line: fn.line,
      scopes: [new Scope(parentScope === this.globalScope ? this.globalScope : parentScope)],
    };
    this.frames.push(frame);

    for (let i = 0; i < fn.params.length; i++) {
      const param = fn.params[i];
      if (!param.name || param.name === '...') continue;
      const arg = args[i] ?? nullValue();
      const value = this.coerceParam(arg, param);
      const slot = this.makeSlot(param.name, value, param.typeText);
      frame.scopes[0].vars.set(param.name, slot);
    }

    let result: RValue = voidValue();
    let explicit = false;
    try {
      if (fn.body) {
        const signal = this.execStmt(fn.body);
        if (signal.kind === 'return') {
          result = signal.value;
          explicit = true;
        }
      }
      if (!explicit) {
        this.emit({
          event: 'return',
          description: `函数 ${displayName} 结束`,
          line: fn.endLine,
        });
        result = this.defaultReturnValue(fn.returnType);
      }
    } finally {
      this.frames.pop();
    }
    return result;
  }

  private coerceParam(arg: RValue, param: ParamNode): RValue {
    if (param.isPointer || param.isArray) {
      if (arg.t === 'array') return arrayToPointer(arg, param.name);
      if (arg.t === 'pointer' || arg.t === 'null') return arg;
      if (arg.t === 'string') {
        return {
          t: 'pointer',
          label: '(字符串常量)',
          target: null,
          elemType: 'char',
          typeText: param.typeText,
          offset: 0,
          str: arg.v,
        };
      }
      return nullValue();
    }
    if (isStringType(param.typeText)) return coerceValue(arg, param.typeText);
    return coerceValue(arg, param.typeText);
  }

  private defaultReturnValue(returnType: string): RValue {
    if (!returnType || /^\s*void\s*$/.test(returnType)) return voidValue();
    if (isFloatType(returnType)) return floatValue(0, returnType);
    if (isPointerType(returnType)) return nullValue();
    if (isStringType(returnType)) return stringValue('');
    return intValue(0, returnType);
  }
}

/* ============================== 对外入口 ============================== */

/** 对已解析的 ProgramNode 执行教学解释器，返回执行轨迹 */
export function simulateProgram(program: ProgramNode, options: SimulateOptions = {}): TraceResult {
  const maxSteps = Math.min(Math.max(options.maxSteps ?? 3000, 10), 20000);
  try {
    const classes = flattenClasses(program);
    const registry = buildSupportRegistry(program, classes);
    const mainFn = program.functions.find((fn) => fn.name === 'main' && fn.body);
    const issue = findUnsupportedProgram(program, registry, mainFn);
    if (issue) {
      return {
        ok: false,
        supported: false,
        error: { message: issue.message, line: issue.line, kind: 'unsupported' },
        steps: [],
        output: '',
        truncated: false,
        maxSteps,
        interpreterNote: '这段代码超出了教学解释器的支持范围，可以改用静态分析查看结构。',
      };
    }
    const interpreter = new Interpreter(program, { maxSteps, stdin: options.stdin });
    return interpreter.run();
  } catch (error) {
    return {
      ok: false,
      supported: false,
      error: {
        message: `执行引擎无法处理这段代码。${error instanceof Error ? `（${error.message}）` : ''}`,
        kind: 'unsupported',
        line: 1,
      },
      steps: [],
      output: '',
      truncated: false,
      maxSteps,
    };
  }
}

/** 供测试使用：把值格式化成展示文本 */
export function formatRuntimeValue(value: RValue): string {
  return formatValue(value);
}

/** 供测试使用：字符展示 */
export function formatChar(code: number): string {
  return charDisplay(code);
}
