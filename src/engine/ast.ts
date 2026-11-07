/**
 * CodeViz 引擎内部 AST
 * ------------------------------------------------------------------
 * 这是一套"教学用"的轻量 AST：只保留图谱与解释器需要的信息，
 * 不追求 C/C++ 标准完整语义。所有节点都带 1-based 行号，供图表与
 * 编辑器联动定位。
 */

export type AccessKind = 'public' | 'private' | 'protected' | 'default';

/** 所有节点共享的位置信息（1-based，列号同样 1-based） */
export interface NodePos {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

/* ============================== 类型与声明 ============================== */

export interface TypeSpec {
  /** 原样类型文本，如 "const unsigned long"、"std::string" */
  text: string;
  /** 基础类型名（去掉限定符），如 "int"、"char"、"Rectangle" */
  base: string;
  isConst: boolean;
  isStatic: boolean;
  isUnsigned: boolean;
  isLong: boolean;
  /** 是否使用模板实参（如 vector<int>） */
  isTemplate: boolean;
}

export interface ParamNode extends NodePos {
  name: string;
  typeText: string;
  base: string;
  isPointer: boolean;
  isReference: boolean;
  isArray: boolean;
  arrayDims?: (number | null)[];
  defaultValue?: string;
}

export interface DeclaratorNode extends NodePos {
  name: string;
  pointerDepth: number;
  isReference: boolean;
  arrayDims: (number | null)[];
  /** 维度的源码文本（`int a[N]` 里的 N），数字维度为 null */
  arrayDimTexts?: string[];
  init?: ExprNode;
  /** 初始化表达式原文（截断后） */
  initText?: string;
  /** 形如 int (*fp)(int) 的函数指针声明 */
  isFunctionPointer?: boolean;
}

/* ============================== 表达式 ============================== */

export type ExprNode =
  | NumberLitExpr
  | StringLitExpr
  | CharLitExpr
  | BoolLitExpr
  | NullLitExpr
  | IdentExpr
  | UnaryExpr
  | PostfixExpr
  | BinaryExpr
  | AssignExpr
  | TernaryExpr
  | CallExpr
  | IndexExpr
  | MemberExpr
  | CastExpr
  | SizeofExpr
  | NewExpr
  | DeleteExpr
  | InitListExpr
  | CommaExpr
  | LambdaExpr
  | UnknownExpr;

export interface NumberLitExpr extends NodePos {
  kind: 'number';
  value: number;
  raw: string;
  isFloat: boolean;
}

export interface StringLitExpr extends NodePos {
  kind: 'string';
  value: string;
  raw: string;
}

export interface CharLitExpr extends NodePos {
  kind: 'char';
  value: string;
  raw: string;
}

export interface BoolLitExpr extends NodePos {
  kind: 'bool';
  value: boolean;
}

export interface NullLitExpr extends NodePos {
  kind: 'null';
}

export interface IdentExpr extends NodePos {
  kind: 'ident';
  name: string;
}

export interface UnaryExpr extends NodePos {
  kind: 'unary';
  op: string;
  operand: ExprNode;
}

export interface PostfixExpr extends NodePos {
  kind: 'postfix';
  op: '++' | '--';
  operand: ExprNode;
}

export interface BinaryExpr extends NodePos {
  kind: 'binary';
  op: string;
  left: ExprNode;
  right: ExprNode;
}

export interface AssignExpr extends NodePos {
  kind: 'assign';
  op: string;
  target: ExprNode;
  value: ExprNode;
}

export interface TernaryExpr extends NodePos {
  kind: 'ternary';
  cond: ExprNode;
  whenTrue: ExprNode;
  whenFalse: ExprNode;
}

export interface CallExpr extends NodePos {
  kind: 'call';
  callee: ExprNode;
  args: ExprNode[];
  /** 裸函数名（方法取方法名，std::sort 取 sort），没有则为空串 */
  name: string;
}

export interface IndexExpr extends NodePos {
  kind: 'index';
  object: ExprNode;
  index: ExprNode;
}

export interface MemberExpr extends NodePos {
  kind: 'member';
  object: ExprNode;
  name: string;
  op: '.' | '->' | '::';
}

export interface CastExpr extends NodePos {
  kind: 'cast';
  typeText: string;
  expr: ExprNode;
}

export interface SizeofExpr extends NodePos {
  kind: 'sizeof';
  typeText?: string;
  expr?: ExprNode;
}

export interface NewExpr extends NodePos {
  kind: 'new';
  typeText: string;
  args: ExprNode[];
  arraySize?: ExprNode;
}

export interface DeleteExpr extends NodePos {
  kind: 'delete';
  expr: ExprNode;
  isArray: boolean;
}

export interface InitListExpr extends NodePos {
  kind: 'initlist';
  items: ExprNode[];
}

export interface CommaExpr extends NodePos {
  kind: 'comma';
  items: ExprNode[];
}

export interface LambdaExpr extends NodePos {
  kind: 'lambda';
  text: string;
}

export interface UnknownExpr extends NodePos {
  kind: 'unknown';
  text: string;
}

/* ============================== 语句 ============================== */

export type StmtNode =
  | BlockStmt
  | DeclStmt
  | ExprStmt
  | IfStmt
  | WhileStmt
  | DoWhileStmt
  | ForStmt
  | RangeForStmt
  | SwitchStmt
  | ReturnStmt
  | BreakStmt
  | ContinueStmt
  | EmptyStmt
  | GotoStmt
  | LabeledStmt
  | UnknownStmt;

export interface BlockStmt extends NodePos {
  kind: 'block';
  statements: StmtNode[];
}

export interface VarDeclNode extends NodePos {
  kind: 'vardecl';
  typeSpec: TypeSpec;
  declarators: DeclaratorNode[];
}

export interface DeclStmt extends NodePos {
  kind: 'decl';
  decl: VarDeclNode;
}

export interface ExprStmt extends NodePos {
  kind: 'expr';
  expr: ExprNode;
}

export interface IfStmt extends NodePos {
  kind: 'if';
  cond: ExprNode;
  then: StmtNode;
  else?: StmtNode;
}

export interface WhileStmt extends NodePos {
  kind: 'while';
  cond: ExprNode;
  body: StmtNode;
}

export interface DoWhileStmt extends NodePos {
  kind: 'doWhile';
  body: StmtNode;
  cond: ExprNode;
}

export interface ForStmt extends NodePos {
  kind: 'for';
  init: DeclStmt | null;
  initExprs: ExprNode[];
  cond: ExprNode | null;
  update: ExprNode[];
  body: StmtNode;
}

export interface RangeForStmt extends NodePos {
  kind: 'rangeFor';
  declText: string;
  varName: string;
  /** `for (int& x : v)` 里的 & —— 按引用遍历时改的是容器里的元素 */
  byReference?: boolean;
  iterable: ExprNode;
  body: StmtNode;
}

export interface SwitchCaseNode extends NodePos {
  label: string;
  isDefault: boolean;
  valueExpr?: ExprNode;
  statements: StmtNode[];
}

export interface SwitchStmt extends NodePos {
  kind: 'switch';
  expr: ExprNode;
  cases: SwitchCaseNode[];
}

export interface ReturnStmt extends NodePos {
  kind: 'return';
  expr?: ExprNode;
}

export interface BreakStmt extends NodePos {
  kind: 'break';
  label?: string;
}

export interface ContinueStmt extends NodePos {
  kind: 'continue';
}

export interface EmptyStmt extends NodePos {
  kind: 'empty';
}

export interface GotoStmt extends NodePos {
  kind: 'goto';
  label: string;
}

export interface LabeledStmt extends NodePos {
  kind: 'labeled';
  label: string;
  statement: StmtNode;
}

export interface UnknownStmt extends NodePos {
  kind: 'unknown';
  text: string;
  reason: string;
}

/* ============================== 函数与类型定义 ============================== */

export interface FuncDeclNode extends NodePos {
  kind: 'function';
  name: string;
  /** 类外定义 / 成员函数所属类名（可能带命名空间，如 "std::vector"） */
  className?: string;
  returnType: string;
  baseType: string;
  params: ParamNode[];
  body?: BlockStmt;
  isPrototype: boolean;
  isVirtual: boolean;
  isStatic: boolean;
  isConst: boolean;
  isPureVirtual: boolean;
  isInline: boolean;
  isExplicit: boolean;
  isTemplate: boolean;
  /** `template <typename T>` 里的参数名；类模板的成员拿不到（它们继承类的绑定） */
  templateParams?: string[];
  isOperator: boolean;
  isConstructor: boolean;
  isDestructor: boolean;
  specifiers: string[];
  ctorInitText?: string;
  /** 构造初始化列表：x(a), y(b) */
  ctorInit?: { name: string; args: ExprNode[] }[];
  access?: AccessKind;
  signature: string;
}

export interface BaseSpec {
  name: string;
  access: AccessKind;
}

export interface FieldDeclNode extends NodePos {
  name: string;
  typeText: string;
  base: string;
  access: AccessKind;
  isStatic: boolean;
  isConst: boolean;
  pointerDepth: number;
  isReference: boolean;
  arrayDims: (number | null)[];
  /** 维度的源码文本（`T items_[kCapacity]` 里的 kCapacity） */
  arrayDimTexts?: string[];
  initText?: string;
}

export interface ClassDeclNode extends NodePos {
  kind: 'class';
  name: string;
  classKind: 'class' | 'struct' | 'union';
  bases: BaseSpec[];
  fields: FieldDeclNode[];
  methods: FuncDeclNode[];
  nested: ClassDeclNode[];
  isTemplate: boolean;
  /** `template <typename T, int N>` 里的参数名：['T', 'N'] */
  templateParams?: string[];
}

export interface EnumDeclNode extends NodePos {
  kind: 'enum';
  name: string;
  enumerators: { name: string; valueText?: string; line: number }[];
  isEnumClass: boolean;
}

export interface TypedefNode extends NodePos {
  kind: 'typedef';
  name: string;
  target: string;
}

export interface IncludeNode {
  path: string;
  system: boolean;
  line: number;
}

export type TopLevelNode = FuncDeclNode | ClassDeclNode | VarDeclNode | EnumDeclNode | TypedefNode;

export interface ProgramNode {
  includes: IncludeNode[];
  items: TopLevelNode[];
  /** 顶层函数（不含类内方法；类外定义也在这里） */
  functions: FuncDeclNode[];
  classes: ClassDeclNode[];
  enums: EnumDeclNode[];
  globals: VarDeclNode[];
  typedefs: Record<string, string>;
  namespaces: string[];
  parseErrors: number;
}

export function createEmptyProgram(): ProgramNode {
  return {
    includes: [],
    items: [],
    functions: [],
    classes: [],
    enums: [],
    globals: [],
    typedefs: {},
    namespaces: [],
    parseErrors: 0,
  };
}

/* ============================== 遍历工具 ============================== */

/** 先序遍历表达式 */
export function walkExpr(expr: ExprNode | undefined, visit: (e: ExprNode) => void): void {
  if (!expr) return;
  visit(expr);
  switch (expr.kind) {
    case 'unary':
      walkExpr(expr.operand, visit);
      break;
    case 'postfix':
      walkExpr(expr.operand, visit);
      break;
    case 'binary':
      walkExpr(expr.left, visit);
      walkExpr(expr.right, visit);
      break;
    case 'assign':
      walkExpr(expr.target, visit);
      walkExpr(expr.value, visit);
      break;
    case 'ternary':
      walkExpr(expr.cond, visit);
      walkExpr(expr.whenTrue, visit);
      walkExpr(expr.whenFalse, visit);
      break;
    case 'call':
      walkExpr(expr.callee, visit);
      for (const arg of expr.args) walkExpr(arg, visit);
      break;
    case 'index':
      walkExpr(expr.object, visit);
      walkExpr(expr.index, visit);
      break;
    case 'member':
      walkExpr(expr.object, visit);
      break;
    case 'cast':
      walkExpr(expr.expr, visit);
      break;
    case 'sizeof':
      walkExpr(expr.expr, visit);
      break;
    case 'new':
      for (const arg of expr.args) walkExpr(arg, visit);
      walkExpr(expr.arraySize, visit);
      break;
    case 'delete':
      walkExpr(expr.expr, visit);
      break;
    case 'initlist':
      for (const item of expr.items) walkExpr(item, visit);
      break;
    case 'comma':
      for (const item of expr.items) walkExpr(item, visit);
      break;
    case 'number':
    case 'string':
    case 'char':
    case 'bool':
    case 'null':
    case 'ident':
    case 'lambda':
    case 'unknown':
      break;
    default:
      break;
  }
}

/** 先序遍历语句（含声明初始化表达式） */
export function walkStmt(stmt: StmtNode | undefined, visit: (s: StmtNode) => void): void {
  if (!stmt) return;
  visit(stmt);
  switch (stmt.kind) {
    case 'block':
      for (const item of stmt.statements) walkStmt(item, visit);
      break;
    case 'decl':
      for (const d of stmt.decl.declarators) walkExpr(d.init, () => undefined);
      break;
    case 'expr':
      break;
    case 'if':
      walkStmt(stmt.then, visit);
      walkStmt(stmt.else, visit);
      break;
    case 'while':
      walkStmt(stmt.body, visit);
      break;
    case 'doWhile':
      walkStmt(stmt.body, visit);
      break;
    case 'for':
      if (stmt.init) walkStmt(stmt.init, visit);
      walkStmt(stmt.body, visit);
      break;
    case 'rangeFor':
      walkStmt(stmt.body, visit);
      break;
    case 'switch':
      for (const c of stmt.cases) for (const item of c.statements) walkStmt(item, visit);
      break;
    case 'labeled':
      walkStmt(stmt.statement, visit);
      break;
    case 'return':
    case 'break':
    case 'continue':
    case 'empty':
    case 'goto':
    case 'unknown':
      break;
    default:
      break;
  }
}

/** 遍历语句自身（不含子语句），用于收集语句级特征 */
export function ownExprsOfStmt(stmt: StmtNode): ExprNode[] {
  switch (stmt.kind) {
    case 'decl': {
      const result: ExprNode[] = [];
      for (const d of stmt.decl.declarators) if (d.init) result.push(d.init);
      return result;
    }
    case 'expr':
      return [stmt.expr];
    case 'if':
      return [stmt.cond];
    case 'while':
      return [stmt.cond];
    case 'doWhile':
      return [stmt.cond];
    case 'for': {
      const result: ExprNode[] = [];
      if (stmt.cond) result.push(stmt.cond);
      result.push(...stmt.initExprs, ...stmt.update);
      if (stmt.init) result.push(...ownExprsOfStmt(stmt.init));
      return result;
    }
    case 'rangeFor':
      return [stmt.iterable];
    case 'switch':
      return [stmt.expr];
    case 'return':
      return stmt.expr ? [stmt.expr] : [];
    default:
      return [];
  }
}

/** 收集一段语句（含嵌套）内出现的全部表达式 */
export function collectExprs(stmt: StmtNode | undefined): ExprNode[] {
  const result: ExprNode[] = [];
  walkStmt(stmt, (s) => {
    for (const e of ownExprsOfStmt(s)) walkExpr(e, (x) => result.push(x));
  });
  return result;
}
