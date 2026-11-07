/**
 * 解释器子集检查
 * ------------------------------------------------------------------
 * analyzeCode 用它对每个函数给出 interpreterSupported；
 * simulate 用它在执行前做一次静态体检，遇到明确不支持的语法/函数时
 * 直接返回 supported=false，避免执行到一半才报错。
 */
import type { ClassDeclNode, ExprNode, FuncDeclNode, ProgramNode, StmtNode } from './ast';
import { collectExprs, walkStmt } from './ast';
import { SUPPORTED_BUILTINS, UNSUPPORTED_FUNCTIONS } from './io';

export interface UnsupportedIssue {
  line: number;
  message: string;
}

/** 允许写成 f(x) 的内置类型名 */
const CAST_NAMES: ReadonlySet<string> = new Set([
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

export interface SupportRegistry {
  /** 源码内所有带函数体的函数：裸名 → 第一个定义 */
  functions: Map<string, FuncDeclNode[]>;
  structs: Set<string>;
  classes: Set<string>;
  methods: Set<string>;
}

/** 从 ProgramNode 建立支持度检查所需的注册表 */
export function buildSupportRegistry(program: ProgramNode, classDecls: ProgramNode['classes']): SupportRegistry {
  const functions = new Map<string, FuncDeclNode[]>();
  const structs = new Set<string>();
  const classes = new Set<string>();
  const methods = new Set<string>();

  const addFunction = (fn: FuncDeclNode): void => {
    if (!fn.body) return;
    const list = functions.get(fn.name) ?? [];
    list.push(fn);
    functions.set(fn.name, list);
    if (fn.className) methods.add(fn.name);
  };

  for (const fn of program.functions) addFunction(fn);
  for (const cls of classDecls) {
    if (cls.classKind === 'class') classes.add(cls.name);
    else structs.add(cls.name);
    for (const method of cls.methods) {
      addFunction(method);
      methods.add(method.name);
    }
  }
  return { functions, structs, classes, methods };
}

const UNSUPPORTED_TYPES = new Set([
  'unordered_map',
  'unordered_set',
  'multimap',
  'multiset',
  'list',
  'deque',
  'tuple',
  'ofstream',
  'ifstream',
  'stringstream',
  'unique_ptr',
  'shared_ptr',
]);

function classOfType(base: string): string {
  return base.replace(/<.*$/, '').split('::').pop() ?? base;
}

function checkExpression(
  expr: ExprNode,
  registry: SupportRegistry,
  visited: Set<FuncDeclNode>,
  depth: number,
): UnsupportedIssue | null {
  switch (expr.kind) {
    case 'new':
    case 'delete':
      // 堆内存已支持：解释器会分配真实堆块、跟踪 delete，并在结束时报告泄漏
      return null;
    case 'lambda':
      return { line: expr.line, message: 'lambda 表达式暂不支持单步执行。' };
    case 'unknown':
      return { line: expr.line, message: `表达式 "${expr.text}" 暂不支持单步执行。` };
    case 'ident':
      // this 由成员函数调用时注入，这里放行
      return null;
    case 'call': {
      const name = expr.name;
      if (!name) {
        return { line: expr.line, message: '这种函数调用形式暂不支持单步执行。' };
      }
      // 成员调用：类方法、字符串 / 数组方法都交给解释器判断，找不到时会给出明确报错
      if (expr.callee.kind === 'member' && expr.callee.op !== '::') return null;
      if (UNSUPPORTED_FUNCTIONS.has(name)) {
        return { line: expr.line, message: `函数 ${name}() 暂不支持单步执行（文件 / 内存 / STL 等高级用法）。` };
      }
      if (SUPPORTED_BUILTINS.has(name)) return null;
      const candidates = registry.functions.get(name);
      if (candidates && candidates.length > 0) {
        for (const candidate of candidates) {
          if (visited.has(candidate)) continue;
          visited.add(candidate);
          const issue = scanFunction(candidate, registry, visited, depth + 1);
          if (issue) return issue;
        }
        return null;
      }
      if (registry.methods.has(name)) return null; // 成员函数按对象分派，交给解释器
      // char(x) / int(x) 这类函数式类型转换
      if (CAST_NAMES.has(name) && expr.args.length === 1) return null;
      // std::string("abc") / string(3, 'a') 这类函数式构造
      if (/^(string|basic_string)$/.test(name)) return null;
      return { line: expr.line, message: `调用了源码中没有定义的函数 ${name}()，无法执行。` };
    }
    default:
      return null;
  }
}

function scanStatement(
  stmt: StmtNode,
  registry: SupportRegistry,
  visited: Set<FuncDeclNode>,
  depth: number,
): UnsupportedIssue | null {
  if (stmt.kind === 'goto') {
    return { line: stmt.line, message: 'goto 语句暂不支持单步执行。' };
  }
  if (stmt.kind === 'labeled') {
    return { line: stmt.line, message: '标签语句暂不支持单步执行。' };
  }
  if (stmt.kind === 'unknown') {
    return { line: stmt.line, message: `无法解析的语句暂不支持单步执行：${stmt.reason || stmt.text}` };
  }
  if (stmt.kind === 'decl') {
    const base = classOfType(stmt.decl.typeSpec.base);
    if (UNSUPPORTED_TYPES.has(base)) {
      return { line: stmt.line, message: `${stmt.decl.typeSpec.text} 暂不支持单步执行。` };
    }
    // 类对象现在支持：构造 / 析构 / 成员函数 / 运算符重载都由解释器处理
    for (const declarator of stmt.decl.declarators) {
      if (declarator.isFunctionPointer) {
        return { line: declarator.line, message: '函数指针暂不支持单步执行。' };
      }
      // 引用变量（int& r = a）由解释器绑定到目标对象
    }
  }
  if (stmt.kind === 'rangeFor') {
    // 支持，但要求被遍历对象是数组 / 初始化列表 / 字符串
  }
  return null;
}

function scanFunction(
  fn: FuncDeclNode,
  registry: SupportRegistry,
  visited: Set<FuncDeclNode>,
  depth: number,
): UnsupportedIssue | null {
  if (depth > 24) return null;
  if (!fn.body) return null;
  // 模板函数已支持：解释器按实参类型推导后展开一份具体函数再执行
  for (const param of fn.params) {
    // 引用参数按引用绑定实参，已支持
    const base = classOfType(param.base);
    if (UNSUPPORTED_TYPES.has(base)) {
      return { line: param.line, message: `${param.typeText} 参数暂不支持单步执行。` };
    }
    // 按值传类对象已支持：会按形参类型拷贝（传派生类给基类形参就是对象切片）
  }

  // 语句级检查
  let stmtIssue: UnsupportedIssue | null = null;
  walkStmt(fn.body, (stmt) => {
    if (stmtIssue) return;
    stmtIssue = scanStatement(stmt, registry, visited, depth);
  });
  if (stmtIssue) return stmtIssue;

  // 表达式级检查（按源码顺序）
  const expressions = collectExprs(fn.body);
  for (const expr of expressions) {
    const issue = checkExpression(expr, registry, visited, depth);
    if (issue) return issue;
  }
  return null;
}

/** 检查单个函数是否完全落在解释器子集内（含它调用的源码内函数） */
export function findUnsupportedFunction(
  fn: FuncDeclNode,
  registry: SupportRegistry,
): UnsupportedIssue | null {
  if (!fn.body) return { line: fn.line, message: '函数没有函数体，无法执行。' };
  return scanFunction(fn, registry, new Set<FuncDeclNode>([fn]), 0);
}

/**
 * 类层面的子集检查。
 * 单继承 / 多继承 / 虚函数 / 类模板都已支持，没有需要提前拦下的类特性了；
 * 兄弟基类同名字段的二义性在访问时单独报错（见解释器的 ambiguousField）。
 */
function findUnsupportedClass(classes: ClassDeclNode[]): UnsupportedIssue | null {
  void classes;
  return null;
}

/** 检查 main 函数（simulate 的入口） */
export function findUnsupportedProgram(
  program: ProgramNode,
  registry: SupportRegistry,
  mainFn: FuncDeclNode | undefined,
): UnsupportedIssue | null {
  if (!mainFn) {
    return { line: 1, message: '没有找到 main 函数，无法执行。' };
  }
  if (!mainFn.body) {
    return { line: mainFn.line, message: 'main 函数没有函数体，无法执行。' };
  }

  // 继承 / 虚函数 / 类模板超出教学子集：在开跑之前就说清楚，
  // 不要等跑到一半才抛「没有可匹配的成员函数」这种看不懂的运行时错误。
  const classIssue = findUnsupportedClass(program.classes);
  if (classIssue) return classIssue;

  const issue = findUnsupportedFunction(mainFn, registry);
  if (issue) return issue;

  // 全局变量初始化也要能静态求值
  for (const global of program.globals) {
    for (const declarator of global.declarators) {
      if (!declarator.init) continue;
      const exprIssue = checkGlobalInit(declarator.init, registry);
      if (exprIssue) return { ...exprIssue, line: declarator.line };
    }
  }
  return null;
}

function checkGlobalInit(expr: ExprNode, registry: SupportRegistry): UnsupportedIssue | null {
  let issue: UnsupportedIssue | null = null;
  const visit = (node: ExprNode): void => {
    if (issue) return;
    if (node.kind === 'new' || node.kind === 'delete' || node.kind === 'lambda' || node.kind === 'unknown') {
      issue = { line: node.line, message: '全局变量的这个初始化方式暂不支持单步执行。' };
      return;
    }
    if (node.kind === 'call') {
      if (!SUPPORTED_BUILTINS.has(node.name) && !registry.functions.has(node.name)) {
        issue = { line: node.line, message: `全局变量初始化调用了不支持的函数 ${node.name}()。` };
        return;
      }
    }
    forEachChild(node, visit);
  };
  visit(expr);
  return issue;
}

/** 遍历直接子表达式 */
function forEachChild(expr: ExprNode, visit: (child: ExprNode) => void): void {
  switch (expr.kind) {
    case 'unary':
      visit(expr.operand);
      break;
    case 'postfix':
      visit(expr.operand);
      break;
    case 'binary':
      visit(expr.left);
      visit(expr.right);
      break;
    case 'assign':
      visit(expr.target);
      visit(expr.value);
      break;
    case 'ternary':
      visit(expr.cond);
      visit(expr.whenTrue);
      visit(expr.whenFalse);
      break;
    case 'call':
      visit(expr.callee);
      for (const arg of expr.args) visit(arg);
      break;
    case 'index':
      visit(expr.object);
      visit(expr.index);
      break;
    case 'member':
      visit(expr.object);
      break;
    case 'cast':
      visit(expr.expr);
      break;
    case 'sizeof':
      if (expr.expr) visit(expr.expr);
      break;
    case 'new':
      for (const arg of expr.args) visit(arg);
      if (expr.arraySize) visit(expr.arraySize);
      break;
    case 'delete':
      visit(expr.expr);
      break;
    case 'initlist':
      for (const item of expr.items) visit(item);
      break;
    case 'comma':
      for (const item of expr.items) visit(item);
      break;
    default:
      break;
  }
}
