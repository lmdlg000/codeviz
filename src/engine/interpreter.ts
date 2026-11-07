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
import { DEFAULT_MAX_STEPS, MAX_TRACE_STEPS } from './types';
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
  /** 成员函数调用时的 this 对象，用于裸字段名回退与 this-> 访问 */
  thisValue?: StructValue;
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

/**
 * 短文本复用同一个字符串实例。
 * 轨迹里塞满了 `'0'` `'\0'` `int` 这类重复文本，几千步下来会造出大量
 * 内容相同但各自独立的字符串；intern 之后内存直接降到可忽略。
 */
const textPool = new Map<string, string>();
function internText(text: string): string {
  const pooled = textPool.get(text);
  if (pooled !== undefined) return pooled;
  if (textPool.size < 4096) textPool.set(text, text);
  return text;
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

/** 可以写成 f(x) 形式的内置类型转换 */
const BUILTIN_CAST_NAMES: ReadonlySet<string> = new Set([
  'char',
  'short',
  'int',
  'long',
  'float',
  'double',
  'bool',
  'unsigned',
  'signed',
  'size_t',
]);
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
  /** 非成员运算符重载：operator+ 等可能有多个，按类型挑 */
  private freeFunctions = new Map<string, FuncDeclNode[]>();
  /** 类外定义的成员函数：`类名::方法名` → 实现（class.methods 里往往只有声明） */
  private methodIndex = new Map<string, FuncDeclNode[]>();

  private indexMethod(fn: FuncDeclNode): void {
    if (!fn.className || !fn.body) return;
    const key = `${lastSegment(fn.className)}::${fn.name}`;
    const list = this.methodIndex.get(key) ?? [];
    list.push(fn);
    this.methodIndex.set(key, list);
  }
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
  /** 上一份堆快照的内容签名，用于连续步复用同一份快照对象 */
  private heapKey = '';
  private heapCache: HeapBlockSnapshot[] | undefined;
  /** 执行 operator<< 时，把 os << x 的文本收集到这里 */
  private captureSink: string[] | null = null;
  /**
   * 表达式产生的临时类对象（函数按值返回 / 类名当构造函数用）。
   * C++ 里它们的生命周期到「完整表达式」结束，这里用语句边界近似：
   * 语句执行完统一调用析构，避免临时对象的堆缓冲变成假泄漏。
   */
  private temps: StructValue[] = [];

  constructor(program: ProgramNode, options: SimulateOptions) {
    this.program = program;
    this.stepLimit = Math.min(Math.max(options.maxSteps ?? DEFAULT_MAX_STEPS, 10), MAX_TRACE_STEPS);
    this.input = options.stdin ?? '';
    this.enumValues = collectEnums(program);

    for (const cls of flattenClasses(program)) {
      if (!this.classMap.has(cls.name)) this.classMap.set(cls.name, cls);
    }
    for (const fn of program.functions) {
      if (!fn.body) continue;
      if (!this.functionMap.has(fn.name)) this.functionMap.set(fn.name, fn);
      if (fn.className) this.indexMethod(fn);
      if (!fn.className && fn.name.startsWith('operator')) {
        const list = this.freeFunctions.get(fn.name) ?? [];
        list.push(fn);
        this.freeFunctions.set(fn.name, list);
      }
    }
    for (const cls of this.classMap.values()) {
      for (const method of cls.methods) {
        const key = `${lastSegment(cls.name)}::${method.name}`;
        const list = this.methodIndex.get(key) ?? [];
        if (method.body) list.push(method);
        this.methodIndex.set(key, list);
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
        typeText: internText(slot.typeText),
        valueText: internText(valueText),
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
    // 成员函数内部可以直接写字段名：回退到 this 对应对象的字段
    const self = frame?.thisValue;
    if (self && self.fields.has(name)) {
      const fieldType = self.fieldTypes.get(name) ?? 'int';
      return {
        name,
        value: self.fields.get(name) ?? intValue(0, fieldType),
        ref: {
          get: () => self.fields.get(name) ?? intValue(0, fieldType),
          set: (next) => {
            self.fields.set(name, next);
          },
          label: `this->${name}`,
          typeText: fieldType,
        },
        typeText: fieldType,
        category: categoryOfValue(self.fields.get(name) ?? intValue(0, fieldType)),
        isConst: false,
      };
    }
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
    // 每条语句结束都清理本语句产生的临时对象（相当于「完整表达式」边界）。
    // 嵌套语句用各自的 mark，已清理过的不会被重复析构。
    const mark = this.temps.length;
    try {
      return this.execStmtInner(stmt);
    } finally {
      this.releaseTemps(mark);
    }
  }

  private execStmtInner(stmt: StmtNode): Signal {
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
          this.destroyScope(scope);
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
        let value = stmt.expr ? this.evalExpr(stmt.expr) : voidValue();
        // 按值返回类对象时必须「当场」拷贝：等到函数帧退出再拷，
        // 局部对象的析构已经把堆缓冲 delete 掉了（会读到 \0）。
        const fn = this.currentFrame()?.fn;
        const byValue = !(fn && fn.returnType.includes('&'));
        if (value.t === 'struct' && byValue) {
          // return T(...) / return a + b：返回值本身就是刚构造的临时对象，
          // 直接移交所有权（等价于 C++17 的拷贝省略），不再多构造一次。
          if (this.isTemp(value)) this.adoptTemp(value);
          else value = this.copyObject(value, stmt.line);
        }
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
      // `const BigInt* p` 的 const 修饰的是指向的内容，指针本身仍可改指
      const pointerMutable = declarator.pointerDepth > 0 || declarator.isReference;
      this.declare(declarator.name, value, typeText, typeSpec.isConst && !pointerMutable);
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
        const args = declarator.init.args.map((arg) => this.evalExpr(arg));
        return this.constructObject(cls.name, args, declarator.init.line);
      }
      if (declarator.init) {
        // Point c = a + b; 采用表达式的值；同类对象优先走拷贝构造，保证深拷贝
        const evaluated = this.evalExpr(declarator.init);
        if (evaluated.t === 'struct' && lastSegment(evaluated.typeName) === cls.name) {
          return this.copyObject(evaluated, declarator.init.line);
        }
        return this.constructObject(cls.name, [], declarator.init.line);
      }
      // 无初始化器时，如果有默认构造函数也要执行一次
      return this.constructObject(cls.name, [], 1);
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

  /** 找非成员运算符重载：优先第二个参数类型匹配 */
  private findFreeOperator(name: string, rightType: string | null): FuncDeclNode | undefined {
    const candidates = this.freeFunctions.get(name);
    if (!candidates || candidates.length === 0) return undefined;
    if (rightType) {
      const matched = candidates.find(
        (fn) => lastSegment(baseTypeName(fn.params[1]?.base ?? '')) === lastSegment(rightType),
      );
      if (matched) return matched;
    }
    return candidates[0];
  }

  /**
   * 运算符重载分派：先试成员方法，再试非成员函数。
   * 返回 undefined 表示没有重载，调用方继续走内置语义。
   */
  private tryOperatorOverload(
    op: string,
    left: RValue,
    right: RValue,
    line: number,
  ): RValue | undefined {
    const methodName = `operator ${op}`;
    if (left.t === 'struct') {
      const member = this.findMethod(left.typeName, methodName, [right]);
      if (member) return this.callFunction(member, [right], line, left);
    }
    if (left.t !== 'struct' && right.t !== 'struct') return undefined;
    const free = this.findFreeOperator(methodName, right.t === 'struct' ? right.typeName : null);
    if (!free) return undefined;
    return this.callFunction(free, [left, right], line);
  }

  /** 调用 operator<<(ostream&, const T&)，把输出「接」回 cout 的缓冲 */
  private runStreamOperator(value: StructValue, line: number): string | null {
    const fn = this.findFreeOperator('operator <<', value.typeName);
    if (!fn) return null;
    const previous = this.captureSink;
    this.captureSink = [];
    try {
      this.callFunction(fn, [voidValue(), value], line);
      return this.captureSink.join('');
    } finally {
      this.captureSink = previous;
    }
  }

  /** 在类里找可调用的方法：参数个数完全匹配优先，其次看默认参数 */
  /**
   * 类外定义的成员函数拿不到类内声明里的默认参数（`BigInt(size_t v = 0);`
   * 只有声明带 `= 0`），这里把默认值补到实现上，否则 `BigInt t;` 会找不到构造函数。
   */
  private inheritDefaults(fn: FuncDeclNode, prototypes: FuncDeclNode[]): FuncDeclNode {
    if (!fn.params.some((param) => !param.defaultValue)) return fn;
    const proto = prototypes.find(
      (candidate) =>
        candidate !== fn &&
        candidate.params.length === fn.params.length &&
        candidate.params.some((param) => param.defaultValue),
    );
    if (!proto) return fn;
    const params = fn.params.map((param, index) =>
      param.defaultValue ? param : { ...param, defaultValue: proto.params[index]?.defaultValue },
    );
    return { ...fn, params };
  }

  /** 默认参数在 AST 里是源码文本，这里把它变成运行期值（只覆盖常见字面量） */
  private evalDefaultParam(param: ParamNode): RValue {
    const text = (param.defaultValue ?? '').trim();
    const typeText = param.typeText;
    if (!text) return param.isPointer ? nullValue() : this.defaultScalar(baseTypeName(typeText), typeText);
    if (text === 'nullptr' || text === 'NULL') return nullValue();
    if (param.isPointer) return nullValue();
    if (text === 'true' || text === 'false') return boolValue(text === 'true');
    if (/^-?0x[0-9a-fA-F]+$/.test(text)) return intValue(parseInt(text, 16), typeText);
    if (/^-?\d+$/.test(text)) return intValue(Number(text), typeText);
    if (/^-?\d*\.\d+([eE][-+]?\d+)?$/.test(text)) return floatValue(Number(text), typeText);
    if (text.startsWith("'")) {
      const inner = text.slice(1, -1);
      const char = inner === '\\0' ? 0 : inner.replace(/^\\/, '').charCodeAt(0);
      return intValue(char, typeText);
    }
    if (text.startsWith('"')) return stringValue(text.slice(1, -1), typeText);
    return this.defaultScalar(baseTypeName(typeText), typeText);
  }

  private scoreParams(method: FuncDeclNode, args: RValue[]): number {
    let score = 0;
    for (let i = 0; i < args.length && i < method.params.length; i++) {
      const param = method.params[i];
      const arg = args[i];
      const typeText = param.typeText;
      if (param.isPointer || typeText.includes('*')) {
        if (arg.t === 'string') score += 4;
        else if (arg.t === 'pointer' || arg.t === 'null') score += 4;
        else score -= 2;
        continue;
      }
      if (param.isReference || typeText.includes('&')) {
        if (arg.t === 'struct') {
          score += lastSegment(baseTypeName(typeText)) === lastSegment(arg.typeName) ? 5 : 1;
        }
        continue;
      }
      if (isStringType(typeText)) {
        score += arg.t === 'string' ? 5 : -2;
        continue;
      }
      if (isFloatType(typeText)) {
        score += arg.t === 'float' ? 4 : arg.t === 'int' ? 1 : -2;
        continue;
      }
      if (arg.t === 'int') score += 3;
      else if (arg.t === 'struct') score -= 3;
    }
    return score;
  }

  private findMethod(
    className: string,
    name: string,
    args: RValue[] | number,
  ): FuncDeclNode | undefined {
    const argCount = typeof args === 'number' ? args : args.length;
    const cls = this.classMap.get(lastSegment(className));
    if (!cls) return undefined;
    const key = `${lastSegment(className)}::${name}`;
    const prototypes = cls.methods.filter((method) => method.name === name);
    const candidates = [
      ...cls.methods.filter((method) => method.name === name && method.body),
      ...(this.methodIndex.get(key) ?? []),
    ].map((method) => this.inheritDefaults(method, prototypes));
    if (candidates.length === 0) return undefined;
    const exact = candidates.filter((method) => method.params.length === argCount);
    if (exact.length > 0) {
      if (typeof args === 'number') return exact[0];
      // 重载解析：按实参类型打分，分高者优先（否则 BigInt("123") 会误选 size_t 构造）
      let best = exact[0];
      let bestScore = this.scoreParams(best, args);
      for (const candidate of exact.slice(1)) {
        const score = this.scoreParams(candidate, args);
        if (score > bestScore) {
          best = candidate;
          bestScore = score;
        }
      }
      return best;
    }
    return candidates.find((method) => {
      const required = method.params.filter((param) => !param.defaultValue).length;
      return required <= argCount && argCount <= method.params.length;
    });
  }

  /** 构造一个类对象：先铺默认字段，再执行匹配的构造函数 */
  private constructObject(className: string, args: RValue[], line: number): StructValue {
    const value = this.createStructValue(className, undefined);
    const name = lastSegment(className);
    const ctor = this.findMethod(name, name, args);
    if (ctor) this.callFunction(ctor, args, line, value);
    return value;
  }

  /** 找真正的拷贝构造函数：单个参数且是同类对象的引用或指针 */
  private findCopyCtor(className: string): FuncDeclNode | undefined {
    const name = lastSegment(className);
    const key = `${name}::${name}`;
    const cls = this.classMap.get(name);
    const candidates = [
      ...(cls?.methods.filter((method) => method.name === name && method.body) ?? []),
      ...(this.methodIndex.get(key) ?? []),
    ];
    return candidates.find((method) => {
      if (method.params.length !== 1) return false;
      const param = method.params[0];
      const isTargetClass = lastSegment(baseTypeName(param.typeText)) === name;
      return isTargetClass && (param.isReference || param.isPointer || param.typeText.includes('&'));
    });
  }

  /** 拷贝一个类对象：有拷贝构造就调用它（深拷贝），否则共享同一份字段 */
  private copyObject(source: StructValue, line: number): StructValue {
    const name = lastSegment(source.typeName);
    const copyCtor = this.findCopyCtor(name);
    if (!copyCtor) return source;
    const copy = this.createStructValue(name, undefined);
    this.callFunction(copyCtor, [source], line, copy);
    return copy;
  }

  /** 作用域结束时销毁其中的类对象（调用析构函数，按声明逆序） */
  private destroyScope(scope: Scope): void {
    const slots = [...scope.vars.values()];
    for (let i = slots.length - 1; i >= 0; i--) {
      if (slots[i].name === 'this') continue;
      this.destroyValue(slots[i].value);
    }
  }

  private destroyValue(value: RValue): void {
    if (value.t === 'struct') {
      const dtor = this.findMethod(value.typeName, `~${lastSegment(value.typeName)}`, 0);
      if (dtor) this.callFunction(dtor, [], this.currentLine, value);
      return;
    }
    if (value.t === 'array') {
      for (const element of value.elems) this.destroyValue(element);
    }
  }

  /** 把一个由表达式产生的类对象登记为临时对象，语句结束时析构 */
  private registerTemp(value: StructValue): void {
    if (!this.findMethod(value.typeName, `~${lastSegment(value.typeName)}`, 0)) return;
    this.temps.push(value);
  }

  /** 临时对象被变量 / 字段接管：取消登记，交给作用域管理 */
  private adoptTemp(value: RValue): RValue {
    if (value.t !== 'struct') return value;
    const index = this.temps.lastIndexOf(value);
    if (index >= 0) this.temps.splice(index, 1);
    return value;
  }

  private isTemp(value: RValue): boolean {
    return value.t === 'struct' && this.temps.includes(value);
  }

  /** 语句结束：析构本语句产生的临时对象（先登记的先生效，和 C++ 顺序一致） */
  private releaseTemps(mark: number): void {
    while (this.temps.length > mark) {
      const value = this.temps.pop() as StructValue;
      this.destroyValue(value);
    }
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
      // 正在执行 operator<< 里的 os << x：os 是形参，求值为 void
      if (this.captureSink) {
        const leftValue = this.evalExpr(expr.left);
        if (leftValue.t === 'void') {
          const rightValue = this.evalExpr(expr.right);
          this.captureSink.push(this.toText(rightValue));
          return leftValue;
        }
        const rightValue = this.evalExpr(expr.right);
        return this.binaryOp(expr.op, leftValue, rightValue, expr.line);
      }
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
    const overloaded = this.tryOperatorOverload(op, left, right, line);
    if (overloaded !== undefined) return overloaded;
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
      // 类对象赋值优先走 operator=：否则只是把字段别名过去，
      // 右侧临时对象析构后左侧的堆缓冲就悬空了（BigInt 里必踩）。
      const current = ref.get();
      if (current.t === 'struct' && raw.t === 'struct' && raw !== current) {
        const assign = this.findMethod(current.typeName, 'operator =', [raw]);
        if (assign) {
          this.callFunction(assign, [raw], expr.line, current);
          return current;
        }
      }
      const value = this.coerceForRef(this.adoptTemp(raw), ref);
      ref.set(value);
      return value;
    }
    const current = ref.get();
    const right = this.evalExpr(expr.value);
    // a += b：优先调用成员 operator+=，避免退化成 operator+ 造成递归
    if (current.t === 'struct') {
      const member = this.findMethod(current.typeName, `operator ${expr.op}`, [right]);
      if (member) {
        const outcome = this.callFunction(member, [right], expr.line, current);
        if (outcome.t === 'struct' && outcome !== current) ref.set(outcome);
        return outcome;
      }
    }
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
    // char(x) / int(x) 这种函数式类型转换
    if (BUILTIN_CAST_NAMES.has(name) && expr.args.length === 1) {
      return coerceValue(this.evalExpr(expr.args[0]), name);
    }
    // Point(1, 2) 这种临时对象：类名当构造函数用
    if (this.classMap.has(lastSegment(name))) {
      const args = expr.args.map((arg) => this.evalExpr(arg));
      const temp = this.constructObject(lastSegment(name), args, expr.line);
      this.registerTemp(temp);
      return temp;
    }
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
      case 'memcpy':
      case 'memset':
      case 'memcmp':
        return this.builtinMem(name, expr);
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
      case 'malloc':
      case 'calloc':
        return this.evalMalloc(expr, name === 'calloc');
      case 'free':
        return this.evalFree(expr);
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
    // 成员函数内部直接调用另一个成员函数（如 alloc(...)）：沿用当前 this
    const implicitThis = fn.className ? this.currentFrame()?.thisValue : undefined;
    return this.callFunction(fn, args, expr.line, implicitThis);
  }

  /* ============================== 堆内存 ============================== */

  /** 分配一块堆内存并返回指向它的指针（new 与 malloc 共用） */
  private allocateBlock(
    elemType: string,
    length: number,
    line: number,
    isArray: boolean,
  ): { block: HeapBlock; pointer: PointerValue } {
    const alive = this.heapBlocks.filter((item) => !item.freed).length;
    if (alive >= MAX_HEAP_BLOCKS) {
      throw new SimError(`堆上同时存在的内存块超过 ${MAX_HEAP_BLOCKS} 个，教学解释器停止继续分配。`, line);
    }
    const safeLength = Math.max(1, length);
    const base = lastSegment(elemType);
    const cls = this.classMap.get(base);
    const makeDefault = (): RValue =>
      cls ? this.createStructValue(cls.name, undefined) : this.defaultScalar(base, elemType);
    const elems: RValue[] = [];
    for (let i = 0; i < safeLength; i++) elems.push(makeDefault());

    const typeText = isArray ? `${elemType}[${safeLength}]` : elemType;
    const array: ArrayValue = { t: 'array', elems, dims: [safeLength], elemType, typeText };
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
      line,
    };
    this.heapBlocks.push(block);
    this.heapIndex.set(array, block);
    this.heapPeak = Math.max(this.heapPeak, this.heapBlocks.filter((item) => !item.freed).length);

    return {
      block,
      pointer: {
        t: 'pointer',
        label: `${label}[0]`,
        target: block.ref,
        elemType,
        typeText: `${elemType}*`,
        array,
        offset: 0,
      },
    };
  }

  /** new T / new T(初值) / new T[n] */
  private evalNew(expr: ExprNode & { kind: 'new' }): RValue {
    const rawType = (expr.typeText || 'int').replace(/\s+/g, '');
    const elemType = baseTypeName(rawType);
    const isArray = Boolean(expr.arraySize);

    let length = 1;
    if (isArray) {
      length = expr.arraySize ? asInt(this.evalExpr(expr.arraySize)) : 0;
      if (length <= 0) throw new SimError('new[] 的长度必须大于 0。', expr.line);
    }

    const { block, pointer } = this.allocateBlock(elemType, length, expr.line, isArray);
    if (!isArray && expr.args.length > 0) {
      block.array.elems[0] = coerceValue(this.evalExpr(expr.args[0]), elemType);
    }

    this.emit({
      event: 'declare',
      description: `new ${block.array.typeText} → ${block.label}（${block.array.elems.length} 个 ${elemType}${
        isArray ? '' : '，值 ' + formatValue(block.array.elems[0])
      }）`,
      line: expr.line,
    });
    return pointer;
  }

  /**
   * 解析 malloc / calloc 的字节数，还原成「元素类型 + 个数」。
   * 只认最常见的两种写法：`malloc(n * sizeof(T))` 与 `calloc(n, sizeof(T))`；
   * 其它情况按 char 数组处理（1 字节 1 格），并在提示里说明。
   */
  private mallocSpec(expr: ExprNode & { kind: 'call' }, isCalloc: boolean): { elemType: string; length: number } {
    const sizeofTypeOf = (node: ExprNode | undefined): string | null => {
      if (!node || node.kind !== 'sizeof') return null;
      if (node.expr) return exprToText(node.expr);
      return node.typeText ?? null;
    };

    if (isCalloc) {
      const count = expr.args[0] ? asInt(this.evalExpr(expr.args[0])) : 0;
      const type = sizeofTypeOf(expr.args[1]);
      return { elemType: type ? baseTypeName(type) : 'char', length: count };
    }

    const arg = expr.args[0];
    if (arg && arg.kind === 'binary' && arg.op === '*') {
      const rightType = sizeofTypeOf(arg.right);
      if (rightType) {
        return { elemType: baseTypeName(rightType), length: asInt(this.evalExpr(arg.left)) };
      }
      const leftType = sizeofTypeOf(arg.left);
      if (leftType) {
        return { elemType: baseTypeName(leftType), length: asInt(this.evalExpr(arg.right)) };
      }
    }
    const bytes = arg ? asInt(this.evalExpr(arg)) : 0;
    return { elemType: 'char', length: bytes };
  }

  private evalMalloc(expr: ExprNode & { kind: 'call' }, isCalloc: boolean): RValue {
    const spec = this.mallocSpec(expr, isCalloc);
    if (spec.length <= 0) throw new SimError(`${isCalloc ? 'calloc' : 'malloc'} 申请的大小必须大于 0。`, expr.line);
    const { block, pointer } = this.allocateBlock(spec.elemType, spec.length, expr.line, true);
    this.emit({
      event: 'declare',
      description: `${isCalloc ? 'calloc' : 'malloc'} ${block.array.typeText} → ${block.label}（${
        block.array.elems.length
      } 个 ${spec.elemType}，需手动 free）`,
      line: expr.line,
    });
    return pointer;
  }

  /** free(p) 与 delete p 共用的释放逻辑 */
  private releaseBlock(value: RValue, line: number, viaFree: boolean): void {
    if (value.t === 'null') {
      this.emit({ event: 'assign', description: `${viaFree ? 'free' : 'delete'} 空指针：什么也不会发生`, line });
      return;
    }
    if (value.t !== 'pointer') {
      throw new SimError(`${viaFree ? 'free' : 'delete'} 需要指针，这个表达式不是指针。`, line);
    }
    const block = value.array ? this.heapIndex.get(value.array) : undefined;
    if (!block) {
      const kind = viaFree ? 'invalid-free' : 'invalid-free';
      this.heapIssues.push({
        kind,
        message: `第 ${line} 行 ${viaFree ? 'free' : 'delete'} 的地址不是堆上申请的`,
        line,
      });
      throw new SimError(`这个地址不是 ${viaFree ? 'malloc / calloc' : 'new'} 出来的，不能释放。`, line);
    }
    if (block.freed) {
      this.heapIssues.push({
        kind: 'double-free',
        message: `${block.label} 被重复释放（第 ${line} 行，最初在第 ${block.line} 行申请）`,
        line,
        blockId: block.id,
      });
      throw new SimError(
        `${block.label} 已经释放过了：重复释放是未定义行为，程序可能崩溃。`,
        line,
      );
    }
    // 释放前先析构里面的类对象（与 C++ 语义一致）
    for (const element of block.array.elems) this.destroyValue(element);
    block.freed = true;
  }

  /** delete p / delete[] p */
  private evalDelete(expr: ExprNode & { kind: 'delete' }): RValue {
    const value = this.evalExpr(expr.expr);
    if (value.t === 'pointer' && value.array) {
      const block = this.heapIndex.get(value.array);
      if (block && block.freed) {
        this.releaseBlock(value, expr.line, false);
        return voidValue();
      }
      if (block && expr.isArray !== block.isArray) {
        throw new SimError(
          block.isArray
            ? `${block.label} 是 new[] 申请的数组，必须用 delete[] 释放。`
            : `${block.label} 是单个对象，应该用 delete 而不是 delete[]。`,
          expr.line,
        );
      }
    }
    this.releaseBlock(value, expr.line, false);
    const block = value.t === 'pointer' && value.array ? this.heapIndex.get(value.array) : undefined;
    if (block) {
      this.emit({
        event: 'assign',
        description: `delete${block.isArray ? '[]' : ''} ${block.label}（释放 ${block.array.elems.length} 个 ${block.elemType}）`,
        line: expr.line,
      });
    }
    return voidValue();
  }

  /** free(p) */
  private evalFree(expr: ExprNode & { kind: 'call' }): RValue {
    const value = expr.args[0] ? this.evalExpr(expr.args[0]) : nullValue();
    const block = value.t === 'pointer' && value.array ? this.heapIndex.get(value.array) : undefined;
    this.releaseBlock(value, expr.line, true);
    if (block) {
      this.emit({
        event: 'assign',
        description: `free ${block.label}（释放 ${block.array.elems.length} 个 ${block.elemType}）`,
        line: expr.line,
      });
    }
    return voidValue();
  }

  /** 指针指向的堆块是否已经被释放 */
  private assertHeapAlive(array: ArrayValue | undefined, line: number): void {
    if (!array) return;
    const block = this.heapIndex.get(array);
    if (!block || !block.freed) return;
    this.heapIssues.push({
      kind: 'use-after-free',
      message: `第 ${line} 行使用了已释放的 ${block.label}（在第 ${block.line} 行申请，已释放）`,
      line,
      blockId: block.id,
    });
    throw new SimError(
      `${block.label} 已经释放了，再去读写它就是「释放后使用」，结果不可预期。`,
      line,
    );
  }

  /** 当前堆状态快照，供 UI 逐步展示 */
  private heapSnapshot(): HeapBlockSnapshot[] | undefined {
    if (this.heapBlocks.length === 0) {
      this.heapKey = '';
      this.heapCache = undefined;
      return undefined;
    }
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

    // 先算内容签名：堆没变化的连续步直接复用上一份快照（引用共享）。
    // 带类与动态内存的长程序会有几千步、绝大多数步堆是不动的，
    // 不做这件事单次执行的轨迹能到几十 MB。
    const previews: string[][] = [];
    const parts: string[] = [];
    for (const block of this.heapBlocks) {
      const all = arrayElementTexts(block.array);
      const values = all.slice(0, HEAP_PREVIEW).map(internText);
      previews.push(values);
      parts.push(
        `${block.id}|${block.freed ? 1 : 0}|${all.length}|${(owners.get(block.id) ?? []).join(',')}|${values.join('\u0001')}`,
      );
    }
    const key = parts.join('\u0002');
    if (key === this.heapKey && this.heapCache) return this.heapCache;

    const snapshots = this.heapBlocks.map((block, index) => {
      const values = previews[index];
      const length = block.array.elems.length;
      return {
        id: block.id,
        label: internText(block.label),
        elemType: internText(block.elemType),
        isArray: block.isArray,
        length,
        values,
        hidden: Math.max(0, length - values.length),
        freed: block.freed,
        line: block.line,
        owners: (owners.get(block.id) ?? []).map(internText),
      };
    });
    this.heapKey = key;
    this.heapCache = snapshots;
    return snapshots;
  }

  /** 结束时统计泄漏：申请了但没有释放的块 */
  private collectLeaks(): void {
    if (this.leaksCollected) return;
    this.leaksCollected = true;
    for (const block of this.heapBlocks) {
      if (block.freed) continue;
      this.heapIssues.push({
        kind: 'leak',
        message: `${block.label}（${block.isArray ? `${block.elemType}[${block.array.elems.length}]` : block.elemType}）在第 ${block.line} 行申请，程序结束前一直没有释放`,
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
    // 用户自定义类的成员函数：找到同名同参数个数的方法，把对象当作 this 传进去
    if (object.t === 'struct') {
      const args = expr.args.map((arg) => this.evalExpr(arg));
      const target = this.findMethod(object.typeName, method, args);
      if (target) {
        return this.callFunction(target, args, expr.line, object);
      }
      throw new SimError(`类 ${object.typeName} 没有可匹配的成员函数 ${method}()。`, expr.line);
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
      this.assertHeapAlive(object, line);
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
          this.assertHeapAlive(object, expr.line);
          return arrayElementRef(object, index, this.elementLabel(expr, index));
        }
        if (object.t === 'pointer' && object.array) {
          const absolute = object.offset + index;
          if (absolute < 0 || absolute >= object.array.elems.length) {
            throw new SimError(`指针下标 ${index} 越界。`, expr.line);
          }
          this.assertHeapAlive(object.array, expr.line);
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
      if (value.t === 'struct') {
        const text = this.runStreamOperator(value, expr.line);
        if (text !== null) {
          chunk += text;
          continue;
        }
      }
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

  /** memcpy / memset / memcmp：按字节处理，元素宽度大于 1 时按元素个数换算 */
  private builtinMem(name: string, expr: ExprNode & { kind: 'call' }): RValue {
    const target = expr.args[0] ? this.evalExpr(expr.args[0]) : nullValue();
    const second = expr.args[1] ? this.evalExpr(expr.args[1]) : intValue(0);
    const count = expr.args[2] ? asInt(this.evalExpr(expr.args[2])) : 0;

    const readByte = (value: RValue, index: number): number => {
      if (value.t === 'string') return index < value.v.length ? value.v.charCodeAt(index) : 0;
      if (value.t === 'pointer') {
        if (value.str !== undefined) {
          const pos = value.offset + index;
          return pos < value.str.length ? value.str.charCodeAt(pos) : 0;
        }
        if (value.array) {
          const pos = value.offset + index;
          const element = value.array.elems[pos];
          return element ? asInt(element) : 0;
        }
      }
      if (value.t === 'array') {
        const element = value.elems[index];
        return element ? asInt(element) : 0;
      }
      return asInt(value);
    };

    const writeByte = (value: RValue, index: number, byte: number): void => {
      const array = value.t === 'array' ? value : value.t === 'pointer' ? value.array : undefined;
      if (!array) return;
      const offset = value.t === 'pointer' ? value.offset : 0;
      const pos = offset + index;
      if (pos < 0 || pos >= array.elems.length) return;
      array.elems[pos] = intValue(byte, array.elemType);
    };

    if (name === 'memcpy') {
      for (let i = 0; i < count; i++) writeByte(target, i, readByte(second, i));
      return target;
    }
    if (name === 'memset') {
      const byte = asInt(second);
      for (let i = 0; i < count; i++) writeByte(target, i, byte);
      return target;
    }
    // memcmp
    for (let i = 0; i < count; i++) {
      const diff = readByte(target, i) - readByte(second, i);
      if (diff !== 0) return intValue(diff < 0 ? -1 : 1);
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

  private callFunction(
    fn: FuncDeclNode,
    args: RValue[],
    callLine: number,
    thisValue?: StructValue,
  ): RValue {
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
    if (thisValue) {
      frame.thisValue = thisValue;
      const selfRef: Ref = {
        get: () => thisValue,
        set: () => undefined,
        label: 'this',
        typeText: `${thisValue.typeName}*`,
      };
      frame.scopes[0].vars.set('this', {
        name: 'this',
        value: {
          t: 'pointer',
          label: 'this',
          target: selfRef,
          elemType: thisValue.typeName,
          typeText: `${thisValue.typeName}*`,
          offset: 0,
        },
        ref: selfRef,
        typeText: `${thisValue.typeName}*`,
        category: 'pointer',
        isConst: true,
      });
    }
    this.frames.push(frame);

    for (let i = 0; i < fn.params.length; i++) {
      const param = fn.params[i];
      if (!param.name || param.name === '...') continue;
      const provided = i < args.length ? args[i] : undefined;
      // 省略实参时要求默认值：`BigInt(size_t v = 0)` 里的 v 必须是 0 而不是 null
      const arg = provided !== undefined ? provided : this.evalDefaultParam(param);
      const value = this.coerceParam(arg, param);
      const slot = this.makeSlot(param.name, value, param.typeText);
      frame.scopes[0].vars.set(param.name, slot);
    }

    // 构造初始化列表：x(a), y(b) 在函数体之前执行
    if (thisValue && fn.ctorInit && fn.ctorInit.length > 0) {
      for (const entry of fn.ctorInit) {
        const fieldName = entry.name.replace(/^this->/, '');
        if (!thisValue.fields.has(fieldName)) continue;
        const fieldType = thisValue.fieldTypes.get(fieldName) ?? 'int';
        const arg = entry.args[0] ? this.evalExpr(entry.args[0]) : voidValue();
        thisValue.fields.set(fieldName, coerceValue(arg, fieldType));
      }
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
    // 按值返回的类对象是调用方的临时对象，到调用语句结束才析构
    if (result.t === 'struct' && !fn.returnType.includes('&')) {
      this.registerTemp(result);
    }
    return result;
  }

  private coerceParam(arg: RValue, param: ParamNode): RValue {
    // 引用参数不做拷贝，直接绑定到实参对象（写入会反映到调用方）
    if (param.isReference || (param.typeText.includes('&') && !param.isPointer)) return arg;
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
  const maxSteps = Math.min(Math.max(options.maxSteps ?? DEFAULT_MAX_STEPS, 10), MAX_TRACE_STEPS);
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
