/**
 * 引擎内部工具函数
 * ------------------------------------------------------------------
 * 类型分类 / 字节估算 / 表达式还原为源码文本 / 稳定 id 等。
 * 这些函数不依赖引擎其它模块，方便被 analyzer、flowchart、interpreter 共用。
 */
import type { DataCategory } from './types';
import type { ExprNode, StmtNode, TypeSpec } from './ast';

/* ============================== 类型 ============================== */

const INT_TYPES = new Set([
  'int',
  'long',
  'short',
  'unsigned',
  'signed',
  'size_t',
  'long long',
  'short int',
  'long int',
  'unsigned int',
  'unsigned long',
  'unsigned short',
  'unsigned long long',
]);
const FLOAT_TYPES = new Set(['float']);
const DOUBLE_TYPES = new Set(['double', 'long double']);

/** 把类型名归类为可视化大类 */
export function typeCategory(
  base: string,
  options: { isPointer?: boolean; isArray?: boolean; isReference?: boolean } = {},
): DataCategory {
  const lower = base.trim().toLowerCase();
  if (options.isArray) return 'array';
  if (options.isPointer) return 'pointer';
  if (options.isReference) {
    if (lower.includes('string')) return 'string';
    return 'unknown';
  }
  if (lower.includes('std::string') || lower === 'string' || lower.includes('basic_string')) return 'string';
  if (lower === 'void') return 'void';
  if (lower === 'char' || lower === 'wchar_t' || lower === 'char16_t' || lower === 'char32_t') return 'char';
  if (lower === 'bool') return 'bool';
  if (FLOAT_TYPES.has(lower)) return 'float';
  if (DOUBLE_TYPES.has(lower)) return 'double';
  if (INT_TYPES.has(lower) || lower.startsWith('unsigned ') || lower.startsWith('signed ')) return 'int';
  if (lower === 'class') return 'class';
  return 'unknown';
}

/** 单个元素 / 基础类型的字节数（按 64 位 Windows 常见模型估算） */
export function scalarSize(base: string, pointerDepth = 0): number {
  if (pointerDepth > 0) return 8;
  const lower = base.trim().toLowerCase();
  if (lower.includes('string') || lower.includes('vector')) return 32;
  if (lower === 'void') return 1;
  if (lower === 'bool' || lower === 'char' || lower === 'wchar_t' || lower.endsWith('char_t')) return 1;
  if (lower === 'short' || lower === 'short int' || lower.startsWith('unsigned short')) return 2;
  if (
    lower === 'float' ||
    lower === 'int' ||
    lower === 'unsigned' ||
    lower === 'unsigned int' ||
    lower === 'long' ||
    lower === 'unsigned long' ||
    lower === 'long int'
  ) {
    return 4;
  }
  if (lower === 'double') return 8;
  if (lower === 'long long' || lower === 'unsigned long long' || lower === 'long double') return 8;
  if (lower === 'size_t') return 8;
  return 4;
}

/** 数组总字节数；维度未知时按 1 估 */
export function arraySize(base: string, dims: (number | null)[], pointerDepth = 0): number {
  const elem = scalarSize(base, pointerDepth);
  let count = 1;
  for (const d of dims) count *= d === null || !Number.isFinite(d) || d <= 0 ? 1 : d;
  return elem * count;
}

/** 结构体字节数：按字段顺序累加（粗略，不考虑对齐填充） */
export function structSize(fieldBytes: number[]): number {
  const sum = fieldBytes.reduce((a, b) => a + b, 0);
  return Math.max(1, sum);
}

/* ============================== 文本 ============================== */

/** 按字符（而非 UTF-16 code unit）截断，用于中文标签 */
export function truncateText(text: string, max: number, ellipsis = '…'): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return chars.slice(0, Math.max(1, max - 1)).join('') + ellipsis;
}

/** 单行化：把换行和连续空白压成单个空格 */
export function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** 生成稳定、可读的 id：中文与特殊字符会被替换成下划线 */
export function safeId(text: string): string {
  const cleaned = text
    .replace(/::/g, '_')
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned.length > 0 ? cleaned : 'anon';
}

/** 去掉类型文本里的 struct/class 前缀，便于展示 */
export function shortType(typeText: string): string {
  return typeText.replace(/\b(struct|class|union|enum)\s+/g, '').trim();
}

/** 判断是否是内建类型关键字 */
export function isBuiltinTypeName(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    INT_TYPES.has(lower) ||
    FLOAT_TYPES.has(lower) ||
    DOUBLE_TYPES.has(lower) ||
    lower === 'char' ||
    lower === 'bool' ||
    lower === 'void' ||
    lower === 'auto' ||
    lower === 'wchar_t' ||
    lower.startsWith('unsigned') ||
    lower.startsWith('signed') ||
    lower.startsWith('long ') ||
    lower.startsWith('short ')
  );
}

/* ============================== 表达式还原 ============================== */

export const BINARY_PRECEDENCE: Record<string, number> = {
  '||': 3,
  '&&': 4,
  '|': 5,
  '^': 6,
  '&': 7,
  '==': 8,
  '!=': 8,
  '<': 9,
  '<=': 9,
  '>': 9,
  '>=': 9,
  '<<': 10,
  '>>': 10,
  '+': 11,
  '-': 11,
  '*': 12,
  '/': 12,
  '%': 12,
};

const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=']);

export function isAssignOp(op: string): boolean {
  return ASSIGN_OPS.has(op);
}

function exprPrec(expr: ExprNode | undefined): number {
  if (!expr) return 99;
  switch (expr.kind) {
    case 'assign':
      return 1;
    case 'ternary':
      return 2;
    case 'binary':
      return BINARY_PRECEDENCE[expr.op] ?? 12;
    case 'comma':
      return 0;
    default:
      return 99;
  }
}

function wrap(expr: ExprNode | undefined, minPrec: number): string {
  if (!expr) return '';
  const text = exprToText(expr);
  return exprPrec(expr) < minPrec ? `(${text})` : text;
}

/** 把 AST 表达式还原成便于阅读的 C 源码文本 */
export function exprToText(expr: ExprNode | undefined): string {
  if (!expr) return '';
  switch (expr.kind) {
    case 'number':
      return expr.raw;
    case 'string':
      return expr.raw;
    case 'char':
      return expr.raw;
    case 'bool':
      return expr.value ? 'true' : 'false';
    case 'null':
      return 'nullptr';
    case 'ident':
      return expr.name;
    case 'unary':
      if (expr.op.length === 1 && /[!~&*+\-]/.test(expr.op)) {
        return `${expr.op}${wrap(expr.operand, 13)}`;
      }
      return `${expr.op}${exprToText(expr.operand)}`;
    case 'postfix':
      return `${exprToText(expr.operand)}${expr.op}`;
    case 'binary': {
      const prec = BINARY_PRECEDENCE[expr.op] ?? 12;
      return `${wrap(expr.left, prec)} ${expr.op} ${wrap(expr.right, prec + 1)}`;
    }
    case 'assign':
      return `${exprToText(expr.target)} ${expr.op} ${exprToText(expr.value)}`;
    case 'ternary':
      return `${wrap(expr.cond, 3)} ? ${exprToText(expr.whenTrue)} : ${exprToText(expr.whenFalse)}`;
    case 'call':
      return `${exprToText(expr.callee)}(${expr.args.map((a) => exprToText(a)).join(', ')})`;
    case 'index':
      return `${exprToText(expr.object)}[${exprToText(expr.index)}]`;
    case 'member':
      return `${exprToText(expr.object)}${expr.op}${expr.name}`;
    case 'cast':
      return `(${expr.typeText})${wrap(expr.expr, 13)}`;
    case 'sizeof':
      return expr.typeText ? `sizeof(${expr.typeText})` : `sizeof(${wrap(expr.expr, 13)})`;
    case 'new': {
      const args = expr.args.length > 0 ? `(${expr.args.map((a) => exprToText(a)).join(', ')})` : '';
      const arr = expr.arraySize ? `[${exprToText(expr.arraySize)}]` : '';
      return `new ${expr.typeText}${arr}${args}`;
    }
    case 'delete':
      return expr.isArray ? `delete[] ${exprToText(expr.expr)}` : `delete ${exprToText(expr.expr)}`;
    case 'initlist':
      return `{${expr.items.map((a) => exprToText(a)).join(', ')}}`;
    case 'comma':
      return expr.items.map((a) => exprToText(a)).join(', ');
    case 'lambda':
      return '[lambda]';
    case 'unknown':
      return expr.text;
    default:
      return '';
  }
}

/** 语句的简短源码文本（用于流程图 code 字段） */
export function stmtToText(stmt: StmtNode): string {
  switch (stmt.kind) {
    case 'decl':
      return `${stmt.decl.typeSpec.text} ${stmt.decl.declarators
        .map((d) => `${d.name}${d.init ? ` = ${exprToText(d.init)}` : ''}`)
        .join(', ')};`;
    case 'expr':
      return `${exprToText(stmt.expr)};`;
    case 'return':
      return stmt.expr ? `return ${exprToText(stmt.expr)};` : 'return;';
    case 'break':
      return 'break;';
    case 'continue':
      return 'continue;';
    case 'empty':
      return ';';
    case 'if':
      return `if (${exprToText(stmt.cond)})`;
    case 'while':
      return `while (${exprToText(stmt.cond)})`;
    case 'doWhile':
      return `do { ... } while (${exprToText(stmt.cond)});`;
    case 'for':
      return `for (${stmt.cond ? exprToText(stmt.cond) : ''}; ...)`;
    case 'rangeFor':
      return `for (${stmt.declText} : ${exprToText(stmt.iterable)})`;
    case 'switch':
      return `switch (${exprToText(stmt.expr)})`;
    case 'goto':
      return `goto ${stmt.label};`;
    case 'labeled':
      return `${stmt.label}:`;
    case 'block':
      return '{ ... }';
    case 'unknown':
      return stmt.text;
    default:
      return '';
  }
}

/** 把 TypeSpec 转成展示文本 */
export function typeSpecText(spec: TypeSpec): string {
  return shortType(spec.text);
}

/** 中文里的“第 x 行”格式化 */
export function lineText(line: number): string {
  return `第 ${line} 行`;
}

/* ============================== 杂项 ============================== */

/** 稳定去重：保留顺序 */
export function unique<T>(items: T[]): T[] {
  const seen = new Set<T>();
  const result: T[] = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }
  return result;
}

/** 数值格式化为学生友好的短文本（去掉浮点尾零） */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    if (Number.isNaN(value)) return 'NaN';
    return value > 0 ? 'inf' : '-inf';
  }
  if (Number.isInteger(value)) return String(value);
  const text = value.toPrecision(10).replace(/0+$/, '').replace(/\.$/, '');
  const num = Number(text);
  return Number.isFinite(num) ? String(num) : String(value);
}

/** 用于按行号排序诊断 */
export function byLine(a: { line: number }, b: { line: number }): number {
  return a.line - b.line;
}
