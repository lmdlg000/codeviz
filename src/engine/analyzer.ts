/**
 * 分析器：把 AST 变成契约中的 AnalysisResult 各字段
 * ------------------------------------------------------------------
 * 职责：
 * 1. 合并类内声明与类外定义，建立函数记录；
 * 2. 统计代码画像（行数 / 圈复杂度 / 嵌套 / 难度）；
 * 3. 生成 FunctionInfo、CallGraph、ClassInfo、globals；
 * 4. 调用 memory / outline / diagnostics / flowchart 子模块。
 */
import type {
  AnalysisResult,
  CallGraph,
  CallGraphEdge,
  CallGraphNode,
  ClassInfo,
  ClassMemberInfo,
  CodeStats,
  Diagnostic,
  DifficultyLevel,
  FunctionInfo,
  FunctionKind,
  MethodInfo,
  ParameterInfo,
  SourceLanguage,
  VariableInfo,
} from './types';
import type {
  ClassDeclNode,
  DeclStmt,
  ExprNode,
  FuncDeclNode,
  ProgramNode,
  StmtNode,
  VarDeclNode,
} from './ast';
import { collectExprs, walkStmt } from './ast';
import type { LexIssue, LineStats, Token } from './tokenizer';
import type { FunctionRecord, AnalysisModel } from './model';
import { buildFlowcharts } from './flowchart';
import { buildMemoryModel } from './memory';
import { buildOutline } from './outline';
import { buildDiagnostics } from './diagnostics';
import { buildSupportRegistry, findUnsupportedFunction, findUnsupportedProgram } from './support';
import type { SupportRegistry } from './support';
import {
  arraySize,
  byLine,
  safeId,
  scalarSize,
  shortType,
  structSize,
  truncateText,
  typeCategory,
} from './utils';

export interface AnalyzeBuildInput {
  code: string;
  language: SourceLanguage;
  program: ProgramNode;
  tokens: Token[];
  lexIssues: LexIssue[];
  lineStats: LineStats;
  parserDiagnostics: Diagnostic[];
  options: { filename?: string; maxLines?: number };
}

/* ============================== 小工具 ============================== */

function lastSegment(name: string): string {
  const index = name.lastIndexOf('::');
  return index >= 0 ? name.slice(index + 2) : name;
}

function methodKey(node: FuncDeclNode): string {
  return `${node.name}|${node.params.map((p) => `${p.typeText}`).join(',')}|${node.isConst ? 'c' : ''}`;
}

function isVoidType(returnType: string): boolean {
  return /^\s*(void)\s*$/.test(returnType);
}

function inferArrayDims(
  dims: (number | null)[],
  init: ExprNode | undefined,
): number[] {
  const result = dims.map((d) => (d === null ? 0 : d));
  if (result.length > 0 && (result[0] === 0 || result[0] === null)) {
    if (init && init.kind === 'initlist') result[0] = init.items.length;
    else if (init && init.kind === 'string') result[0] = Array.from(init.value).length + 1;
  }
  return result;
}

function countArrayElements(dims: number[]): number {
  let count = 1;
  for (const d of dims) count *= d > 0 ? d : 1;
  return count;
}

function buildVariableInfo(
  options: {
    id: string;
    name: string;
    base: string;
    typeText: string;
    pointerDepth: number;
    isReference: boolean;
    isConst: boolean;
    arrayDims: number[];
    line: number;
    init?: ExprNode;
    initText?: string;
    used: boolean;
    scope: 'global' | 'local' | 'param' | 'field';
    scopeName?: string;
    storage: 'stack' | 'heap' | 'data' | 'text';
    structSizes?: Map<string, number>;
  },
): VariableInfo {
  const { base, pointerDepth, isReference, arrayDims } = options;
  const isArray = arrayDims.length > 0;
  const isPointer = pointerDepth > 0;
  const category = typeCategory(base, { isArray, isPointer, isReference });
  let typeText = options.typeText;
  if (isPointer) typeText = `${typeText}${'*'.repeat(pointerDepth)}`;
  if (isReference) typeText = `${typeText}&`;
  const lastBase = base.split('::').pop() ?? base;
  const structBytes = options.structSizes?.get(lastBase);
  const elementBytes = isPointer ? 8 : structBytes ?? scalarSize(base, pointerDepth);
  const sizeBytes = isArray ? elementBytes * countArrayElements(arrayDims) : elementBytes;
  return {
    id: options.id,
    name: options.name,
    typeText,
    category,
    line: options.line,
    scope: options.scope,
    scopeName: options.scopeName,
    isArray,
    arrayDims: isArray ? options.arrayDims : undefined,
    isPointer,
    pointeeType: isPointer ? base : undefined,
    isReference,
    isConst: options.isConst,
    sizeBytes,
    init: options.initText ? truncateText(options.initText, 60) : undefined,
    used: options.used,
    storage: options.storage,
  };
}

/* ============================== 主体构建 ============================== */

export function analyzeProgram(input: AnalyzeBuildInput): AnalysisResult {
  const model = buildModel(input);
  const callGraph = buildCallGraph(model);

  // 递归标记回填（调用图里已经标记好）
  const recursiveIds = new Set(callGraph.nodes.filter((n) => n.recursive).map((n) => n.id));
  for (const record of model.records) record.recursive = recursiveIds.has(record.id);

  // 解释器支持度
  const supportRegistry = model.supportRegistry;
  for (const record of model.records) {
    if (!record.hasBody) {
      record.supportIssue = { line: record.node.line, message: '函数只有声明没有实现，无法执行。' };
      continue;
    }
    record.supportIssue = findUnsupportedFunction(record.node, supportRegistry);
  }
  const mainRecord = model.records.find((r) => r.displayName === 'main' && !r.className) ??
    model.records.find((r) => r.node.name === 'main');
  const programSupportIssue = findUnsupportedProgram(input.program, supportRegistry, mainRecord?.node);

  const stats = computeStats(model, input);
  const functions = model.records.map((r) => toFunctionInfo(model, r));
  const classes = buildClassInfos(model);
  const flowcharts = buildFlowcharts(
    model.records.filter((r) => r.hasBody).map((r) => ({ id: r.id, displayName: r.displayName, node: r.node })),
  );
  const outline = buildOutline(model);
  const memory = buildMemoryModel(model);
  const diagnostics = buildDiagnostics({
    model,
    parserDiagnostics: input.parserDiagnostics,
    lexIssues: input.lexIssues,
    maxLines: input.options.maxLines,
  });

  const interpreterSupported = programSupportIssue === null;
  const interpreterHint = programSupportIssue
    ? `单步执行不可用：${programSupportIssue.message}`
    : '这段代码落在教学解释器子集内，可以单步执行。';

  return {
    ok: true,
    language: input.language,
    stats,
    diagnostics,
    includes: input.program.includes.map((i) => i.path),
    functions,
    globals: model.globals,
    classes,
    flowcharts,
    callGraph,
    outline,
    memory,
    interpreterSupported,
    interpreterHint,
    parseErrors: input.program.parseErrors,
  };
}

/* ============================== 模型构建 ============================== */

function buildModel(input: AnalyzeBuildInput): AnalysisModel {
  const program = input.program;

  // 1. 类 / 结构体（含嵌套）
  const classByName = new Map<string, ClassDeclNode>();
  const classes: ClassDeclNode[] = [];
  const addClass = (cls: ClassDeclNode): void => {
    if (!classByName.has(cls.name)) {
      classByName.set(cls.name, cls);
      classes.push(cls);
    }
    for (const nested of cls.nested) addClass(nested);
  };
  for (const cls of program.classes) addClass(cls);

  // 2. 类外定义并入类方法
  for (const fn of program.functions) {
    if (!fn.className) continue;
    const cls = classByName.get(lastSegment(fn.className));
    if (!cls) continue;
    const key = methodKey(fn);
    const existingIndex = cls.methods.findIndex((m) => methodKey(m) === key);
    if (existingIndex < 0) {
      const access = cls.classKind === 'class' ? 'private' : 'public';
      fn.access = fn.access ?? (access as 'public' | 'private');
      cls.methods.push(fn);
    } else {
      const existing = cls.methods[existingIndex];
      if (!existing.body && fn.body) {
        fn.access = fn.access ?? existing.access;
        fn.isVirtual = fn.isVirtual || existing.isVirtual;
        cls.methods[existingIndex] = fn;
        // 保持类方法在列表中的位置稳定
        cls.methods[existingIndex] = fn;
      }
    }
  }

  // 3. 类型字节数（粗略）
  const typeSizes = new Map<string, number>();
  const computing = new Set<string>();
  const computeTypeSize = (base: string, pointerDepth: number, dims: number[]): number => {
    if (pointerDepth > 0) return 8;
    let elementSize = scalarSize(base, pointerDepth);
    const cls = classByName.get(lastSegment(base));
    if (cls && !computing.has(cls.name)) {
      computing.add(cls.name);
      let total = 0;
      for (const field of cls.fields) {
        if (field.isStatic) continue;
        const fieldDims = field.arrayDims.map((d) => (d === null ? 0 : d));
        total += computeTypeSize(field.base, field.pointerDepth, fieldDims);
      }
      computing.delete(cls.name);
      elementSize = structSize([total]);
      typeSizes.set(cls.name, elementSize);
    }
    return elementSize * countArrayElements(dims);
  };
  for (const cls of classes) {
    if (!typeSizes.has(cls.name)) computeTypeSize(cls.name, 0, []);
  }

  // 4. 全局变量
  const globalUsedNames = collectGlobalUsage(program);
  const globals: VariableInfo[] = [];
  const varInits = new Map<string, ExprNode>();
  const globalIdCount = new Map<string, number>();
  const nextGlobalId = (name: string): string => {
    const count = globalIdCount.get(name) ?? 0;
    globalIdCount.set(name, count + 1);
    return count === 0 ? `g_${safeId(name)}` : `g_${safeId(name)}_${count + 1}`;
  };
  for (const decl of program.globals) {
    for (const declarator of decl.declarators) {
      if (!declarator.name) continue;
      const dims = inferArrayDims(declarator.arrayDims, declarator.init);
      const variable = buildVariableInfo({
        id: nextGlobalId(declarator.name),
        name: declarator.name,
        base: decl.typeSpec.base,
        typeText: decl.typeSpec.text,
        pointerDepth: declarator.pointerDepth,
        isReference: declarator.isReference,
        isConst: decl.typeSpec.isConst,
        arrayDims: dims,
        line: declarator.line,
        init: declarator.init,
        initText: declarator.init ? declarator.initText : undefined,
        used: globalUsedNames.has(declarator.name),
        scope: 'global',
        storage: 'data',
        structSizes: typeSizes,
      });
      globals.push(variable);
      if (declarator.init) varInits.set(variable.id, declarator.init);
    }
  }
  // 类的静态成员也进全局区
  for (const cls of classes) {
    for (const field of cls.fields) {
      if (!field.isStatic) continue;
      globals.push(
        buildVariableInfo({
          id: nextGlobalId(field.name),
          name: field.name,
          base: field.base,
          typeText: field.typeText,
          pointerDepth: field.pointerDepth,
          isReference: field.isReference,
          isConst: field.isConst,
          arrayDims: field.arrayDims.map((d) => (d === null ? 0 : d)),
          line: field.line,
          initText: field.initText,
          used: true,
          scope: 'global',
          scopeName: cls.name,
          storage: 'data',
          structSizes: typeSizes,
        }),
      );
    }
  }

  // 5. 函数记录
  const candidates: { node: FuncDeclNode; className?: string }[] = [];
  for (const fn of program.functions) candidates.push({ node: fn, className: fn.className });
  for (const cls of classes) {
    for (const method of cls.methods) candidates.push({ node: method, className: cls.name });
  }
  const byKey = new Map<string, { node: FuncDeclNode; className?: string }>();
  for (const candidate of candidates) {
    const key = `${candidate.className ?? ''}|${methodKey(candidate.node)}`;
    const existing = byKey.get(key);
    if (!existing) byKey.set(key, candidate);
    else if (!existing.node.body && candidate.node.body) byKey.set(key, candidate);
  }
  const uniqueCandidates = Array.from(byKey.values()).sort((a, b) => a.node.line - b.node.line);

  const usedIds = new Set<string>();
  const makeFunctionId = (displayName: string): string => {
    const base = `fn_${safeId(displayName)}`;
    let id = base;
    let counter = 2;
    while (usedIds.has(id)) {
      id = `${base}_${counter}`;
      counter++;
    }
    usedIds.add(id);
    return id;
  };

  const records: FunctionRecord[] = uniqueCandidates.map((candidate) => {
    const node = candidate.node;
    const displayName = candidate.className ? `${candidate.className}::${node.name}` : node.name;
    const id = makeFunctionId(displayName);
    const body = node.body;
    const usedNames = new Set<string>();
    for (const expr of collectExprs(body)) {
      if (expr.kind === 'ident') usedNames.add(expr.name);
    }
    const locals = collectLocals(node, id, usedNames, varInits, typeSizes);
    const calls = collectCalls(body);
    const complexity = computeComplexity(body);
    const maxNesting = computeMaxNesting(body);
    const hasReturnOnAllPaths =
      isVoidType(node.returnType) || node.name === 'main' || !body
        ? true
        : blockAlwaysReturns(body);
    return {
      node,
      id,
      displayName,
      className: candidate.className,
      hasBody: body !== undefined,
      params: node.params.map((param) => toParameterInfo(param)),
      locals,
      calls,
      complexity,
      maxNesting,
      hasReturnOnAllPaths,
      supportIssue: null,
      recursive: false,
    };
  });

  const supportRegistry: SupportRegistry = buildSupportRegistry(program, classes);

  return {
    code: input.code,
    language: input.language,
    program,
    classes,
    classByName,
    records,
    globals,
    typeSizes,
    varInits,
    supportRegistry,
  };
}

function collectGlobalUsage(program: ProgramNode): Set<string> {
  const used = new Set<string>();
  for (const fn of program.functions) {
    for (const expr of collectExprs(fn.body)) {
      if (expr.kind === 'ident') used.add(expr.name);
    }
  }
  for (const cls of program.classes) {
    for (const method of cls.methods) {
      for (const expr of collectExprs(method.body)) {
        if (expr.kind === 'ident') used.add(expr.name);
      }
    }
  }
  for (const decl of program.globals) {
    for (const declarator of decl.declarators) {
      for (const expr of collectExprsFromExpr(declarator.init)) {
        if (expr.kind === 'ident') used.add(expr.name);
      }
    }
  }
  return used;
}

function collectExprsFromExpr(expr: ExprNode | undefined): ExprNode[] {
  if (!expr) return [];
  const result: ExprNode[] = [];
  // walkExpr 在 ast 中导出
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const stack: ExprNode[] = [expr];
  while (stack.length > 0) {
    const node = stack.pop() as ExprNode;
    result.push(node);
    switch (node.kind) {
      case 'unary':
      case 'postfix':
        stack.push(node.operand);
        break;
      case 'binary':
        stack.push(node.left, node.right);
        break;
      case 'assign':
        stack.push(node.target, node.value);
        break;
      case 'ternary':
        stack.push(node.cond, node.whenTrue, node.whenFalse);
        break;
      case 'call':
        stack.push(node.callee, ...node.args);
        break;
      case 'index':
        stack.push(node.object, node.index);
        break;
      case 'member':
        stack.push(node.object);
        break;
      case 'cast':
        stack.push(node.expr);
        break;
      case 'sizeof':
        if (node.expr) stack.push(node.expr);
        break;
      case 'new':
        stack.push(...node.args);
        if (node.arraySize) stack.push(node.arraySize);
        break;
      case 'delete':
        stack.push(node.expr);
        break;
      case 'initlist':
      case 'comma':
        stack.push(...node.items);
        break;
      default:
        break;
    }
  }
  return result;
}

function collectLocals(
  node: FuncDeclNode,
  fnId: string,
  usedNames: Set<string>,
  varInits: Map<string, ExprNode>,
  structSizes: Map<string, number>,
): VariableInfo[] {
  const result: VariableInfo[] = [];
  if (!node.body) return result;
  const idCounters = new Map<string, number>();
  const nextId = (name: string): string => {
    const count = idCounters.get(name) ?? 0;
    idCounters.set(name, count + 1);
    return count === 0 ? `var_${fnId}_${safeId(name)}` : `var_${fnId}_${safeId(name)}_${count + 1}`;
  };

  walkStmt(node.body, (stmt) => {
    if (stmt.kind === 'decl') {
      const decl: DeclStmt = stmt;
      for (const declarator of decl.decl.declarators) {
        if (!declarator.name) continue;
        const dims = inferArrayDims(declarator.arrayDims, declarator.init);
        const variable = buildVariableInfo({
          id: nextId(declarator.name),
          name: declarator.name,
          base: decl.decl.typeSpec.base,
          typeText: decl.decl.typeSpec.text,
          pointerDepth: declarator.pointerDepth,
          isReference: declarator.isReference,
          isConst: decl.decl.typeSpec.isConst,
          arrayDims: dims,
          line: declarator.line,
          init: declarator.init,
          initText: declarator.initText,
          used: usedNames.has(declarator.name),
          scope: 'local',
          scopeName: node.name,
          storage: 'stack',
          structSizes,
        });
        result.push(variable);
        if (declarator.init) varInits.set(variable.id, declarator.init);
      }
    } else if (stmt.kind === 'rangeFor') {
      const varName = stmt.varName;
      if (!varName) return;
      const typeText = stmt.declText.slice(0, Math.max(0, stmt.declText.length - varName.length)).trim() || 'auto';
      result.push(
        buildVariableInfo({
          id: nextId(varName),
          name: varName,
          base: typeText,
          typeText,
          pointerDepth: 0,
          isReference: false,
          isConst: false,
          arrayDims: [],
          line: stmt.line,
          used: usedNames.has(varName),
          scope: 'local',
          scopeName: node.name,
          storage: 'stack',
          structSizes,
        }),
      );
    }
  });
  return result;
}

function collectCalls(body: StmtNode | undefined): FunctionRecord['calls'] {
  const calls: FunctionRecord['calls'] = [];
  for (const expr of collectExprs(body)) {
    if (expr.kind === 'call' && expr.name) {
      calls.push({ callee: expr.name, line: expr.line, argumentCount: expr.args.length });
    }
  }
  return calls;
}

function toParameterInfo(param: FuncDeclNode['params'][number]): ParameterInfo {
  return {
    name: param.name,
    typeText: param.typeText,
    category: typeCategory(param.base, {
      isPointer: param.isPointer,
      isArray: param.isArray,
      isReference: param.isReference,
    }),
    isPointer: param.isPointer,
    isReference: param.isReference,
    defaultValue: param.defaultValue,
    line: param.line,
  };
}

/* ============================== 圈复杂度 / 嵌套 / 返回值 ============================== */

function computeComplexity(body: StmtNode | undefined): number {
  if (!body) return 1;
  let complexity = 1;
  walkStmt(body, (stmt) => {
    if (stmt.kind === 'if') complexity++;
    else if (stmt.kind === 'while' || stmt.kind === 'for' || stmt.kind === 'doWhile' || stmt.kind === 'rangeFor') {
      complexity++;
    } else if (stmt.kind === 'switch') {
      for (const caseNode of stmt.cases) {
        if (!caseNode.isDefault) complexity++;
      }
    }
  });
  for (const expr of collectExprs(body)) {
    if (expr.kind === 'binary' && (expr.op === '&&' || expr.op === '||')) complexity++;
    else if (expr.kind === 'ternary') complexity++;
  }
  return complexity;
}

function computeMaxNesting(body: StmtNode | undefined): number {
  if (!body) return 0;
  const visit = (stmt: StmtNode, depth: number): number => {
    switch (stmt.kind) {
      case 'block': {
        let max = depth;
        for (const inner of stmt.statements) max = Math.max(max, visit(inner, depth));
        return max;
      }
      case 'if': {
        const next = depth + 1;
        let max = next;
        max = Math.max(max, visit(stmt.then, next));
        if (stmt.else) {
          // else-if 链属于同一层的连续判断，不额外加深嵌套；
          // 只有 else { if (...) } 这种真正嵌套在块里的情况才继续累加。
          max = Math.max(max, visit(stmt.else, stmt.else.kind === 'if' ? depth : next));
        }
        return max;
      }
      case 'while':
      case 'doWhile':
      case 'rangeFor':
        return Math.max(depth + 1, visit(stmt.body, depth + 1));
      case 'for': {
        const next = depth + 1;
        let max = next;
        max = Math.max(max, visit(stmt.body, next));
        return max;
      }
      case 'switch': {
        const next = depth + 1;
        let max = next;
        for (const caseNode of stmt.cases) {
          for (const inner of caseNode.statements) max = Math.max(max, visit(inner, next));
        }
        return max;
      }
      case 'labeled':
        return visit(stmt.statement, depth);
      default:
        return depth;
    }
  };
  return visit(body, 0);
}

function stmtAlwaysReturns(stmt: StmtNode): boolean {
  switch (stmt.kind) {
    case 'return':
      return true;
    case 'block':
      return blockAlwaysReturns(stmt);
    case 'if':
      return stmt.else ? stmtAlwaysReturns(stmt.then) && stmtAlwaysReturns(stmt.else) : false;
    case 'switch': {
      if (stmt.cases.length === 0) return false;
      if (!stmt.cases.some((c) => c.isDefault)) return false;
      return stmt.cases.every((caseNode) => {
        if (caseNode.statements.length === 0) return true;
        return caseNode.statements.some((inner) => stmtAlwaysReturns(inner));
      });
    }
    case 'while': {
      const cond = stmt.cond;
      const infinite = cond.kind === 'number' && cond.value !== 0;
      return infinite && !containsBreak(stmt.body);
    }
    case 'for':
      return stmt.cond === null && !containsBreak(stmt.body);
    case 'expr': {
      if (stmt.expr.kind === 'call') {
        return ['exit', 'abort'].includes(stmt.expr.name);
      }
      return false;
    }
    case 'labeled':
      return stmtAlwaysReturns(stmt.statement);
    default:
      return false;
  }
}

function blockAlwaysReturns(block: StmtNode | undefined): boolean {
  if (!block || block.kind !== 'block') return false;
  for (const stmt of block.statements) {
    if (stmtAlwaysReturns(stmt)) return true;
  }
  return false;
}

function containsBreak(stmt: StmtNode): boolean {
  let found = false;
  walkStmt(stmt, (inner) => {
    if (inner.kind === 'break') found = true;
    // break 只属于最近一层循环，但这里用于"是否存在出口"的保守判断
  });
  return found;
}

/* ============================== 统计 ============================== */

function computeStats(model: AnalysisModel, input: AnalyzeBuildInput): CodeStats {
  let loops = 0;
  let branches = 0;
  let maxNesting = 0;
  let cyclomatic = 0;
  for (const record of model.records) {
    if (!record.hasBody) continue;
    cyclomatic += record.complexity;
    maxNesting = Math.max(maxNesting, record.maxNesting);
    walkStmt(record.node.body, (stmt) => {
      if (stmt.kind === 'while' || stmt.kind === 'for' || stmt.kind === 'doWhile' || stmt.kind === 'rangeFor') loops++;
      else if (stmt.kind === 'if') branches++;
      else if (stmt.kind === 'switch') branches += stmt.cases.length;
    });
  }
  const functionCount = model.records.filter((r) => r.hasBody).length;
  const declarations = model.globals.length + model.records.reduce((sum, r) => sum + r.locals.length, 0);
  const pointers =
    model.globals.filter((g) => g.isPointer).length +
    model.records.reduce((sum, r) => sum + r.locals.filter((l) => l.isPointer).length + r.params.filter((p) => p.isPointer).length, 0);
  const arrays =
    model.globals.filter((g) => g.isArray).length +
    model.records.reduce((sum, r) => sum + r.locals.filter((l) => l.isArray).length, 0);
  if (cyclomatic === 0) cyclomatic = 1;

  const structCount = model.classes.filter((c) => c.classKind !== 'class').length;
  const classCount = model.classes.filter((c) => c.classKind === 'class').length;
  const hasRecursion = model.records.some((r) => r.recursive);

  /**
   * 难度按"用到了哪些能力 + 规模"综合评分，而不是只看嵌套深度：
   * - 入门：顺序结构为主，没有分支 / 循环；
   * - 基础：有 if 或单个循环（含 else-if 链，它不算深层嵌套）；
   * - 进阶：嵌套控制结构、多函数、指针、数组/结构体、递归等；
   * - 挑战：多函数 + 类 / 复杂指针 / 递归 / 大复杂度组合。
   */
  let score = 0;
  if (loops > 0 || branches > 0) score += 1;
  if (maxNesting >= 2) score += 1;
  if (maxNesting >= 4) score += 1;
  if (functionCount >= 2) score += 1;
  if (functionCount >= 4) score += 1;
  if (pointers > 0) score += 1;
  if (structCount + classCount > 0) score += 1;
  if (hasRecursion) score += 1;
  if (input.lineStats.codeLines >= 80) score += 1;
  if (cyclomatic >= 20) score += 1;
  if (cyclomatic >= 40) score += 1;

  let difficulty: DifficultyLevel;
  if (score === 0) difficulty = '入门';
  else if (score === 1) difficulty = '基础';
  else if (score <= 4) difficulty = '进阶';
  else difficulty = '挑战';

  return {
    totalLines: input.lineStats.totalLines,
    codeLines: input.lineStats.codeLines,
    commentLines: input.lineStats.commentLines,
    blankLines: input.lineStats.blankLines,
    characters: input.tokens.length > 0 ? input.code.length : 0,
    tokenCount: Math.max(0, input.tokens.length - 1),
    functions: functionCount,
    loops,
    branches,
    declarations,
    pointers,
    arrays,
    structs: model.classes.filter((c) => c.classKind !== 'class').length,
    classes: model.classes.filter((c) => c.classKind === 'class').length,
    maxNesting,
    cyclomaticComplexity: cyclomatic,
    difficulty,
  };
}

/* ============================== 函数信息 ============================== */

function toFunctionInfo(model: AnalysisModel, record: FunctionRecord): FunctionInfo {
  const node = record.node;
  let kind: FunctionKind = 'function';
  if (node.isConstructor) kind = 'constructor';
  else if (node.isDestructor) kind = 'destructor';
  else if (node.isOperator) kind = 'operator';
  else if (node.className) kind = 'method';
  else if (node.name === 'main') kind = 'main';

  const access = node.access;
  return {
    id: record.id,
    name: node.name,
    signature: node.signature,
    returnType: node.returnType,
    params: record.params,
    kind,
    className: record.className,
    span: {
      startLine: node.line,
      startColumn: node.column,
      endLine: node.endLine,
      endColumn: node.endColumn,
    },
    lineCount: Math.max(1, node.endLine - node.line + 1),
    locals: record.locals,
    calls: record.calls,
    complexity: record.complexity,
    maxNesting: record.maxNesting,
    isRecursive: record.recursive,
    isVirtual: node.isVirtual || undefined,
    isStatic: node.isStatic || undefined,
    access,
    hasReturnOnAllPaths: record.hasReturnOnAllPaths,
    interpreterSupported: record.supportIssue === null,
  };
  void model;
}

/* ============================== 调用图 ============================== */

function buildCallGraph(model: AnalysisModel): CallGraph {
  const withBody = model.records.filter((r) => r.hasBody);
  const recordById = new Map(withBody.map((r) => [r.id, r]));
  const byName = new Map<string, FunctionRecord[]>();
  for (const record of withBody) {
    const list = byName.get(record.node.name) ?? [];
    list.push(record);
    byName.set(record.node.name, list);
  }

  const edges: CallGraphEdge[] = [];
  const edgeIndex = new Map<string, CallGraphEdge>();
  const external = new Set<string>();

  const resolve = (name: string, caller: FunctionRecord): FunctionRecord | undefined => {
    if (!name) return undefined;
    // 同类的成员函数优先
    if (caller.className) {
      const sameClass = withBody.find(
        (r) => r.className === caller.className && r.node.name === name,
      );
      if (sameClass) return sameClass;
    }
    // 构造函数：类名与函数名相同
    if (model.classByName.has(name)) {
      const ctor = withBody.find((r) => r.className === name && r.node.name === name);
      if (ctor) return ctor;
    }
    const matches = byName.get(name);
    if (!matches || matches.length === 0) return undefined;
    return matches[0];
  };

  const adjacency = new Map<string, Set<string>>();
  for (const record of withBody) adjacency.set(record.id, new Set());
  for (const caller of withBody) {
    for (const call of caller.calls) {
      const target = resolve(call.callee, caller);
      if (!target) {
        external.add(call.callee);
        continue;
      }
      const key = `${caller.id}->${target.id}`;
      const existing = edgeIndex.get(key);
      if (existing) {
        existing.count++;
      } else {
        const edge: CallGraphEdge = {
          from: caller.id,
          to: target.id,
          line: call.line,
          count: 1,
        };
        edgeIndex.set(key, edge);
        edges.push(edge);
      }
      adjacency.get(caller.id)?.add(target.id);
    }
  }

  // 环检测：能从自己出发回到自己 = 递归（含间接递归）
  const recursiveIds = new Set<string>();
  for (const record of withBody) {
    const visited = new Set<string>();
    const stack = Array.from(adjacency.get(record.id) ?? []);
    let found = false;
    while (stack.length > 0) {
      const current = stack.pop() as string;
      if (current === record.id) {
        found = true;
        break;
      }
      if (visited.has(current)) continue;
      visited.add(current);
      for (const next of adjacency.get(current) ?? []) stack.push(next);
    }
    if (found) {
      recursiveIds.add(record.id);
      record.recursive = true;
    }
  }

  // 根节点：main 优先，其次无入边的函数，再次第一个函数
  const incoming = new Set(edges.map((e) => e.to));
  const mainRecord = withBody.find((r) => r.node.name === 'main' && !r.className) ?? withBody.find((r) => r.node.name === 'main');
  let roots: string[] = [];
  if (mainRecord) roots = [mainRecord.id];
  else {
    const untargeted = withBody.filter((r) => !incoming.has(r.id) && !recursiveIds.has(r.id));
    roots = untargeted.length > 0 ? untargeted.map((r) => r.id) : withBody.slice(0, 1).map((r) => r.id);
  }

  // 深度：从根出发的最长路径（遇环截断）
  const depthMap = new Map<string, number>();
  for (const root of roots) {
    const walk = (id: string, depth: number, path: Set<string>): void => {
      const previous = depthMap.get(id);
      if (previous !== undefined && previous >= depth) return;
      depthMap.set(id, depth);
      for (const next of adjacency.get(id) ?? []) {
        if (path.has(next)) continue;
        path.add(next);
        walk(next, depth + 1, path);
        path.delete(next);
      }
    };
    walk(root, 0, new Set([root]));
  }

  const nodes: CallGraphNode[] = withBody.map((record) => ({
    id: record.id,
    name: record.displayName,
    kind: functionKindOf(record.node),
    className: record.className,
    line: record.node.line,
    recursive: recursiveIds.has(record.id),
    external: false,
    complexity: record.complexity,
    depth: depthMap.get(record.id) ?? 0,
  }));

  let maxDepth = 0;
  for (const node of nodes) maxDepth = Math.max(maxDepth, node.depth);

  void recordById;
  return {
    nodes,
    edges,
    roots,
    hasRecursion: recursiveIds.size > 0,
    externalCalls: Array.from(external).sort((a, b) => a.localeCompare(b)),
    maxDepth,
  };
}

function functionKindOf(node: FuncDeclNode): FunctionKind {
  if (node.isConstructor) return 'constructor';
  if (node.isDestructor) return 'destructor';
  if (node.isOperator) return 'operator';
  if (node.className) return 'method';
  if (node.name === 'main') return 'main';
  return 'function';
}

/* ============================== 类信息 ============================== */

function buildClassInfos(model: AnalysisModel): ClassInfo[] {
  const result: ClassInfo[] = [];
  const usedIds = new Set<string>();
  const makeId = (name: string): string => {
    const base = `class_${safeId(name)}`;
    let id = base;
    let counter = 2;
    while (usedIds.has(id)) {
      id = `${base}_${counter++}`;
    }
    usedIds.add(id);
    return id;
  };

  for (const cls of model.classes) {
    const defaultAccess: 'public' | 'private' = cls.classKind === 'class' ? 'private' : 'public';
    const fields: ClassMemberInfo[] = cls.fields.map((field) => ({
      name: field.name,
      typeText: field.pointerDepth > 0
        ? `${field.typeText}${'*'.repeat(field.pointerDepth)}`
        : field.typeText,
      category: typeCategory(field.base, {
        isArray: field.arrayDims.length > 0,
        isPointer: field.pointerDepth > 0,
        isReference: field.isReference,
      }),
      access: field.access === 'default' ? defaultAccess : field.access,
      line: field.line,
      isStatic: field.isStatic || undefined,
      isConst: field.isConst || undefined,
    }));

    const methods: MethodInfo[] = cls.methods.map((method) => {
      let methodKind: MethodInfo['kind'] = 'method';
      if (method.isConstructor) methodKind = 'constructor';
      else if (method.isDestructor) methodKind = 'destructor';
      else if (method.isOperator) methodKind = 'operator';
      return {
        name: method.name,
        signature: method.signature,
        returnType: method.returnType,
        access: method.access && method.access !== 'default'
          ? method.access
          : defaultAccess,
        line: method.line,
        kind: methodKind,
        isStatic: method.isStatic || undefined,
        isVirtual: method.isVirtual || undefined,
        isPureVirtual: method.isPureVirtual || undefined,
        isConst: method.isConst || undefined,
        params: method.params.map((param) => toParameterInfo(param)),
      };
    });

    const isAbstract = cls.methods.some((m) => m.isPureVirtual);
    result.push({
      id: makeId(cls.name),
      name: cls.name,
      kind: cls.classKind === 'class' ? 'class' : 'struct',
      bases: cls.bases.map((b) => b.name),
      fields,
      methods,
      line: cls.line,
      span: {
        startLine: cls.line,
        startColumn: cls.column,
        endLine: cls.endLine,
        endColumn: cls.endColumn,
      },
      isAbstract,
    });
  }
  return result;
}

/* ============================== 视图辅助（供其它模块复用） ============================== */

export function variableDims(variable: VariableInfo): number[] {
  return variable.arrayDims ?? [];
}

export function typeDisplayName(variable: VariableInfo): string {
  return shortType(variable.typeText);
}

export function sortDiagnostics(list: Diagnostic[]): Diagnostic[] {
  return list.sort(byLine);
}
