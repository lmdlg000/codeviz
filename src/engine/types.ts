/**
 * CodeViz 引擎公共类型（契约文件）
 * ------------------------------------------------------------------
 * 这是 UI、内容与引擎之间唯一的数据协议。
 * engine-dev 可以在不破坏已有字段语义的前提下补充字段，但不得重命名/删除已有字段。
 * 所有坐标系都是 1-based 行号（与编辑器一致）。
 */

export type SourceLanguage = 'c' | 'cpp';

export type DifficultyLevel = '入门' | '基础' | '进阶' | '挑战';

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  severity: DiagnosticSeverity;
  /** 面向初学者的中文说明 */
  message: string;
  /** 可选的修复建议 */
  hint?: string;
  line: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  /** 规则标识，如 "missing-semicolon" */
  rule: string;
}

export interface SourceSpan {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

/** 变量所属的数据大类，决定可视化颜色与图标 */
export type DataCategory =
  | 'int'
  | 'float'
  | 'double'
  | 'char'
  | 'bool'
  | 'void'
  | 'string'
  | 'pointer'
  | 'array'
  | 'struct'
  | 'class'
  | 'unknown';

export interface CodeStats {
  totalLines: number;
  codeLines: number;
  commentLines: number;
  blankLines: number;
  characters: number;
  tokenCount: number;
  functions: number;
  loops: number;
  branches: number;
  declarations: number;
  pointers: number;
  arrays: number;
  structs: number;
  classes: number;
  /** 最深层级的语句嵌套（函数体本身不算） */
  maxNesting: number;
  /** 所有函数圈复杂度的总和（从 1 起算） */
  cyclomaticComplexity: number;
  difficulty: DifficultyLevel;
}

export interface VariableInfo {
  id: string;
  name: string;
  /** 原样类型文本，如 "unsigned int"、"char *" */
  typeText: string;
  category: DataCategory;
  line: number;
  scope: 'global' | 'local' | 'param' | 'field';
  /** 所属函数 / 类名 */
  scopeName?: string;
  isArray: boolean;
  arrayDims?: number[];
  isPointer: boolean;
  pointeeType?: string;
  isReference?: boolean;
  isConst?: boolean;
  /** 估算占用字节数 */
  sizeBytes: number;
  /** 初始化表达式原文（短） */
  init?: string;
  used: boolean;
  storage: 'stack' | 'heap' | 'data' | 'text';
}

export interface ParameterInfo {
  name: string;
  typeText: string;
  category: DataCategory;
  isPointer: boolean;
  isReference: boolean;
  defaultValue?: string;
  line: number;
}

export type FunctionKind =
  | 'function'
  | 'main'
  | 'method'
  | 'constructor'
  | 'destructor'
  | 'operator';

export interface CallSite {
  callee: string;
  line: number;
  argumentCount: number;
}

export type FlowNodeKind =
  | 'start'
  | 'end'
  | 'process'
  | 'decision'
  | 'loop'
  | 'return'
  | 'break'
  | 'continue'
  | 'call'
  | 'input'
  | 'output'
  | 'switch'
  | 'block';

export interface SwitchCaseFlow {
  label: string;
  line: number;
  isDefault?: boolean;
  body: FlowchartNode;
}

/**
 * 结构化流程图节点。
 * 渲染约定：
 * - block: children 自上而下顺序排布
 * - decision: yes / no 两个分支
 * - loop: body 为循环体；while/for 先判断后执行，do 在 body 之后判断（testAfter=true）
 * - switch: cases 依次渲染，每个 case 后默认落到下一 case（不自动画 break 连线）
 * - return / break / continue: 终止当前路径
 */
export interface FlowchartNode {
  id: string;
  kind: FlowNodeKind;
  line: number;
  endLine?: number;
  /** 节点上的简短中文标签（10~22 字） */
  label: string;
  /** 源代码片段（点击节点时展示） */
  code?: string;
  condition?: string;
  children?: FlowchartNode[];
  yes?: FlowchartNode;
  no?: FlowchartNode;
  body?: FlowchartNode;
  cases?: SwitchCaseFlow[];
  loopKind?: 'while' | 'for' | 'do';
  testAfter?: boolean;
  callName?: string;
  calls?: string[];
  /** 可选：该节点由哪些语句行合并而来 */
  lines?: number[];
}

export interface FlowchartData {
  functionId: string;
  functionName: string;
  /** 入口 block，children 的第一个通常是 start，最后一个是 end */
  entry: FlowchartNode;
  nodeCount: number;
}

export interface FunctionInfo {
  id: string;
  name: string;
  /** 完整签名，如 "int add(int a, int b)" */
  signature: string;
  returnType: string;
  params: ParameterInfo[];
  kind: FunctionKind;
  className?: string;
  span: SourceSpan;
  lineCount: number;
  locals: VariableInfo[];
  calls: CallSite[];
  /** 圈复杂度，最小 1 */
  complexity: number;
  maxNesting: number;
  isRecursive: boolean;
  isVirtual?: boolean;
  isStatic?: boolean;
  access?: 'public' | 'private' | 'protected' | 'default';
  /** 是否所有控制路径都有返回值（无返回值的函数为 true） */
  hasReturnOnAllPaths: boolean;
  /** 是否可被内置解释器执行 */
  interpreterSupported: boolean;
}

export interface CallGraphNode {
  id: string;
  name: string;
  kind: FunctionKind;
  className?: string;
  line: number;
  recursive: boolean;
  external: boolean;
  complexity: number;
  /** 从入口函数出发的最长调用深度（0 = 入口） */
  depth: number;
}

export interface CallGraphEdge {
  from: string;
  to: string;
  line: number;
  /** 调用次数 */
  count: number;
}

export interface CallGraph {
  nodes: CallGraphNode[];
  edges: CallGraphEdge[];
  /** 入口函数 id（main 优先；没有 main 时取最前函数） */
  roots: string[];
  hasRecursion: boolean;
  /** 调用了但源码中未定义的函数名，如 printf、sqrt */
  externalCalls: string[];
  maxDepth: number;
}

export type OutlineKind =
  | 'program'
  | 'include'
  | 'global'
  | 'function'
  | 'class'
  | 'struct'
  | 'block'
  | 'declaration'
  | 'if'
  | 'loop'
  | 'switch'
  | 'return'
  | 'call'
  | 'assignment'
  | 'other';

export interface OutlineNode {
  id: string;
  kind: OutlineKind;
  label: string;
  detail?: string;
  line: number;
  endLine?: number;
  children?: OutlineNode[];
}

export interface MethodInfo {
  name: string;
  signature: string;
  returnType: string;
  access: 'public' | 'private' | 'protected' | 'default';
  line: number;
  kind: 'method' | 'constructor' | 'destructor' | 'operator';
  isStatic?: boolean;
  isVirtual?: boolean;
  isPureVirtual?: boolean;
  isConst?: boolean;
  params: ParameterInfo[];
}

export interface ClassMemberInfo {
  name: string;
  typeText: string;
  category: DataCategory;
  access: 'public' | 'private' | 'protected' | 'default';
  line: number;
  isStatic?: boolean;
  isConst?: boolean;
}

export interface ClassInfo {
  id: string;
  name: string;
  kind: 'class' | 'struct';
  bases: string[];
  fields: ClassMemberInfo[];
  methods: MethodInfo[];
  line: number;
  span: SourceSpan;
  isAbstract: boolean;
}

export interface MemoryCell {
  id: string;
  name: string;
  typeText: string;
  category: DataCategory;
  bytes: number;
  value?: string;
  arrayValues?: string[];
  arrayDims?: number[];
  /** 指针指向的变量名或 "a[2]" 之类 */
  pointerTarget?: string;
  line: number;
}

export interface StackFrameModel {
  functionId: string;
  functionName: string;
  line: number;
  cells: MemoryCell[];
}

export interface MemoryModel {
  globals: MemoryCell[];
  stack: StackFrameModel[];
  heap: MemoryCell[];
  notes: string[];
  totalBytes: number;
}

export interface AnalyzeOptions {
  filename?: string;
  /** 默认 1000（MAX_CODE_LINES）；超过时返回错误诊断，仍尽量给出可分析结果 */
  maxLines?: number;
}

export interface AnalysisResult {
  ok: boolean;
  language: SourceLanguage;
  stats: CodeStats;
  diagnostics: Diagnostic[];
  includes: string[];
  functions: FunctionInfo[];
  globals: VariableInfo[];
  classes: ClassInfo[];
  flowcharts: FlowchartData[];
  callGraph: CallGraph;
  outline: OutlineNode;
  memory: MemoryModel;
  interpreterSupported: boolean;
  interpreterHint?: string;
  /** 无法解析的语句数 */
  parseErrors: number;
}

/* ============================== 执行追踪 ============================== */

export type TraceEvent =
  | 'start'
  | 'step'
  | 'declare'
  | 'assign'
  | 'branch'
  | 'loop'
  | 'call'
  | 'return'
  | 'output'
  | 'break'
  | 'continue'
  | 'end'
  | 'error';

export interface RuntimeVar {
  name: string;
  typeText: string;
  /** 已格式化、可直接展示的值 */
  valueText: string;
  category: DataCategory;
  changed: boolean;
  arrayValues?: string[];
  pointerTarget?: string;
  scopeDepth?: number;
}

export interface TraceStep {
  index: number;
  line: number;
  functionName: string;
  depth: number;
  event: TraceEvent;
  description: string;
  /** 当前作用域内可见变量（含全局变量） */
  vars: RuntimeVar[];
  callStack: { functionName: string; line: number }[];
  /** 截至该步的累计输出 */
  stdout: string;
  /** 该步新增的输出片段 */
  outputChunk?: string;
  /** 可选：对应流程图节点 id，用于联动高亮 */
  flowNodeId?: string;
  conditionResult?: boolean;
}

export interface TraceError {
  message: string;
  line?: number;
  kind: 'syntax' | 'unsupported' | 'runtime' | 'limit';
}

export interface TraceResult {
  ok: boolean;
  supported: boolean;
  error?: TraceError;
  steps: TraceStep[];
  output: string;
  /** 达到步数上限被截断 */
  truncated: boolean;
  maxSteps: number;
  interpreterNote?: string;
  /** 执行过程中从 stdin 消费掉的输入 */
  stdinConsumed?: string;
}

export interface SimulateOptions {
  maxSteps?: number;
  stdin?: string;
}

export interface EngineInfo {
  name: string;
  version: string;
  schemaVersion: number;
  supportedPatterns: string[];
}

/* ============================== 公共函数 ============================== */

export interface EngineApi {
  analyzeCode(code: string, options?: AnalyzeOptions): AnalysisResult;
  simulate(code: string, options?: SimulateOptions): TraceResult;
  detectLanguage(code: string, filename?: string): SourceLanguage;
  getEngineInfo(): EngineInfo;
}

/** 行数上限（含空行），与产品需求一致 */
export const MAX_CODE_LINES = 1000;
