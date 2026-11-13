/**
 * 断点条件求值
 * ------------------------------------------------------------------
 * 轨迹每一步都带变量快照（vars: name / valueText / typeText），
 * 所以条件断点不需要重新执行代码，只要在当前步的快照上求值：
 *
 *   i == 10
 *   len > 3 && n != 0
 *   c == 'x' || flag
 *   a.len >= 20          // 结构体 / 类对象取字段
 *
 * 支持：数字、字符串（单双引号）、变量、字段（. / ->）、
 *       == != < <= > >= && || ! 与括号。
 * 不支持函数调用、算术运算、指针解引用 —— 教学场景够用，且完全不执行任意代码。
 */
import type { TraceStep } from '../../engine/types';

type TokenKind = 'num' | 'str' | 'ident' | 'op';

interface Token {
  kind: TokenKind;
  text: string;
}

interface Value {
  kind: 'num' | 'str' | 'bool' | 'undef';
  num?: number;
  str?: string;
  bool?: boolean;
}

type Node =
  | { kind: 'value'; value: Value }
  | { kind: 'var'; path: string[] }
  | { kind: 'not'; operand: Node }
  | { kind: 'neg'; operand: Node }
  | { kind: 'arith'; op: string; left: Node; right: Node }
  | { kind: 'and' | 'or'; left: Node; right: Node }
  | { kind: 'compare'; op: string; left: Node; right: Node };

export interface ConditionResult {
  ok: boolean;
  /** 解析失败时的说明，可直接展示给用户 */
  error?: string;
}

const OPERATORS = ['==', '!=', '<=', '>=', '&&', '||', '<', '>', '!', '(', ')', '+', '-', '*', '/', '%'];

function tokenize(source: string): Token[] | { error: string } {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/\d/.test(ch) || (ch === '.' && /\d/.test(source[i + 1] ?? ''))) {
      let text = '';
      while (i < source.length && /[\d.]/.test(source[i])) text += source[i++];
      const value = Number(text);
      if (!Number.isFinite(value)) return { error: `无法识别的数字 "${text}"` };
      tokens.push({ kind: 'num', text });
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      let text = '';
      let closed = false;
      while (i < source.length) {
        if (source[i] === '\\' && i + 1 < source.length) {
          text += source[i + 1];
          i += 2;
          continue;
        }
        if (source[i] === quote) {
          closed = true;
          i++;
          break;
        }
        text += source[i++];
      }
      if (!closed) return { error: '字符串缺少结束引号' };
      tokens.push({ kind: 'str', text });
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let text = '';
      while (i < source.length && /[A-Za-z0-9_]/.test(source[i])) text += source[i++];
      tokens.push({ kind: 'ident', text });
      continue;
    }
    if (ch === '-' && source[i + 1] === '>') {
      tokens.push({ kind: 'op', text: '->' });
      i += 2;
      continue;
    }
    if (ch === '.') {
      tokens.push({ kind: 'op', text: '.' });
      i++;
      continue;
    }
    const two = source.slice(i, i + 2);
    if (OPERATORS.includes(two)) {
      tokens.push({ kind: 'op', text: two });
      i += 2;
      continue;
    }
    if (OPERATORS.includes(ch)) {
      tokens.push({ kind: 'op', text: ch });
      i++;
      continue;
    }
    return { error: `不支持的字符 "${ch}"` };
  }
  return tokens;
}

function parse(tokens: Token[]): Node | { error: string } {
  let position = 0;

  const peek = (): Token | undefined => tokens[position];
  const eat = (text: string): boolean => {
    const token = peek();
    if (token && token.kind === 'op' && token.text === text) {
      position++;
      return true;
    }
    return false;
  };

  function parseOr(): Node | { error: string } {
    let left = parseAnd();
    if ('error' in left) return left;
    while (eat('||')) {
      const right = parseAnd();
      if ('error' in right) return right;
      left = { kind: 'or', left, right };
    }
    return left;
  }

  function parseAnd(): Node | { error: string } {
    let left = parseComparison();
    if ('error' in left) return left;
    while (eat('&&')) {
      const right = parseComparison();
      if ('error' in right) return right;
      left = { kind: 'and', left, right };
    }
    return left;
  }

  /** 比较：两侧先算完算术 */
  function parseComparison(): Node | { error: string } {
    const left = parseAdditive();
    if ('error' in left) return left;
    const token = peek();
    if (token && token.kind === 'op' && ['==', '!=', '<', '<=', '>', '>='].includes(token.text)) {
      position++;
      const right = parseAdditive();
      if ('error' in right) return right;
      return { kind: 'compare', op: token.text, left, right };
    }
    return left;
  }

  /** 加减（左结合） */
  function parseAdditive(): Node | { error: string } {
    let left = parseMultiplicative();
    if ('error' in left) return left;
    while (peek()?.kind === 'op' && ['+', '-'].includes(peek()!.text)) {
      const op = peek()!.text;
      position++;
      const right = parseMultiplicative();
      if ('error' in right) return right;
      left = { kind: 'arith', op, left, right };
    }
    return left;
  }

  /** 乘除取余（左结合） */
  function parseMultiplicative(): Node | { error: string } {
    let left = parseUnary();
    if ('error' in left) return left;
    while (peek()?.kind === 'op' && ['*', '/', '%'].includes(peek()!.text)) {
      const op = peek()!.text;
      position++;
      const right = parseUnary();
      if ('error' in right) return right;
      left = { kind: 'arith', op, left, right };
    }
    return left;
  }

  /** 一元：! 与负号 */
  function parseUnary(): Node | { error: string } {
    if (eat('!')) {
      const operand = parseUnary();
      if ('error' in operand) return operand;
      return { kind: 'not', operand };
    }
    if (eat('-')) {
      const operand = parseUnary();
      if ('error' in operand) return operand;
      return { kind: 'neg', operand };
    }
    return parsePrimary();
  }

  function parsePrimary(): Node | { error: string } {
    const token = peek();
    if (!token) return { error: '条件不完整' };
    if (eat('(')) {
      const inner = parseOr();
      if ('error' in inner) return inner;
      if (!eat(')')) return { error: '括号没有闭合' };
      return inner;
    }
    if (token.kind === 'num') {
      position++;
      return { kind: 'value', value: { kind: 'num', num: Number(token.text) } };
    }
    if (token.kind === 'str') {
      position++;
      return { kind: 'value', value: { kind: 'str', str: token.text } };
    }
    if (token.kind === 'ident') {
      position++;
      if (token.text === 'true' || token.text === 'false') {
        return { kind: 'value', value: { kind: 'bool', bool: token.text === 'true' } };
      }
      const path = [token.text];
      while (peek() && peek()!.kind === 'op' && ['.', '->'].includes(peek()!.text)) {
        position++;
        const next = peek();
        if (!next || next.kind !== 'ident') return { error: '字段名缺失' };
        path.push(next.text);
        position++;
      }
      return { kind: 'var', path };
    }
    return { error: `无法解析 "${token.text}"` };
  }

  const node = parseOr();
  if ('error' in node) return node;
  if (position < tokens.length) return { error: `多余的内容 "${tokens[position].text}"` };
  return node;
}

/** 把快照里的 valueText 转成可比较的值 */
function parseValueText(text: string): Value {
  const trimmed = text.trim();
  if (trimmed === 'true' || trimmed === 'false') return { kind: 'bool', bool: trimmed === 'true' };
  if (/^-?\d+$/.test(trimmed)) return { kind: 'num', num: Number(trimmed) };
  if (/^-?\d*\.\d+$/.test(trimmed)) return { kind: 'num', num: Number(trimmed) };
  if (/^'.*'$/.test(trimmed) || /^".*"$/.test(trimmed)) {
    return { kind: 'str', str: trimmed.slice(1, -1) };
  }
  return { kind: 'str', str: trimmed };
}

function readVar(step: TraceStep, path: string[]): Value | undefined {
  const vars = step.vars ?? [];
  // 成员函数里的字段在快照中记作 `this->len`
  if (path[0] === 'this' && path.length === 2) {
    const direct = vars.find((variable) => variable.name === `this->${path[1]}`);
    return direct ? parseValueText(direct.valueText) : undefined;
  }
  const root = vars.find((variable) => variable.name === path[0]);
  if (!root) {
    if (path.length === 1) {
      const field = vars.find((variable) => variable.name === `this->${path[0]}`);
      if (field) return parseValueText(field.valueText);
    }
    return undefined;
  }
  if (path.length === 1) return parseValueText(root.valueText);
  // 结构体 / 类对象：从 `BigInt { sign: 1, len: 20, ... }` 里取字段
  let current = root.valueText;
  for (const field of path.slice(1)) {
    const match = new RegExp(`\\b${field}\\s*:\\s*([^,}]+)`).exec(current);
    if (!match) return undefined;
    current = match[1];
  }
  return parseValueText(current);
}

function toNumber(value: Value): number | undefined {
  if (value.kind === 'num') return value.num;
  if (value.kind === 'bool') return value.bool ? 1 : 0;
  if (value.kind === 'str') {
    const text = value.str ?? '';
    const parsed = Number(text);
    return Number.isFinite(parsed) && text.trim() !== '' ? parsed : undefined;
  }
  return undefined;
}

function truthy(value: Value): boolean {
  if (value.kind === 'undef') return false;
  if (value.kind === 'num') return (value.num ?? 0) !== 0;
  if (value.kind === 'bool') return value.bool === true;
  return (value.str ?? '').length > 0;
}

function compare(op: string, left: Value, right: Value): boolean {
  // 变量不存在 / 结构体里没有这个字段：任何比较都不成立，
  // 避免打成 `i == 10` 但写错变量名时“处处命中”
  if (left.kind === 'undef' || right.kind === 'undef') return false;
  const a = toNumber(left);
  const b = toNumber(right);
  if (a !== undefined && b !== undefined) {
    switch (op) {
      case '==':
        return a === b;
      case '!=':
        return a !== b;
      case '<':
        return a < b;
      case '<=':
        return a <= b;
      case '>':
        return a > b;
      case '>=':
        return a >= b;
      default:
        return false;
    }
  }
  const textA = left.kind === 'str' ? (left.str ?? '') : String(left.num ?? left.bool ?? '');
  const textB = right.kind === 'str' ? (right.str ?? '') : String(right.num ?? right.bool ?? '');
  switch (op) {
    case '==':
      return textA === textB;
    case '!=':
      return textA !== textB;
    case '<':
      return textA < textB;
    case '<=':
      return textA <= textB;
    case '>':
      return textA > textB;
    case '>=':
      return textA >= textB;
    default:
      return false;
  }
}

function evaluate(node: Node, step: TraceStep): Value {
  switch (node.kind) {
    case 'value':
      return node.value;
    case 'var':
      return readVar(step, node.path) ?? { kind: 'undef' };
    case 'not':
      return { kind: 'bool', bool: !truthy(evaluate(node.operand, step)) };
    case 'neg':
      return { kind: 'num', num: -(toNumber(evaluate(node.operand, step)) ?? Number.NaN) };
    case 'arith': {
      const a = toNumber(evaluate(node.left, step));
      const b = toNumber(evaluate(node.right, step));
      if (a === undefined || b === undefined) return { kind: 'num', num: Number.NaN };
      switch (node.op) {
        case '+':
          return { kind: 'num', num: a + b };
        case '-':
          return { kind: 'num', num: a - b };
        case '*':
          return { kind: 'num', num: a * b };
        case '/':
          return { kind: 'num', num: b === 0 ? Number.NaN : a / b };
        case '%':
          return { kind: 'num', num: b === 0 ? Number.NaN : a % b };
        default:
          return { kind: 'num', num: Number.NaN };
      }
    }
    case 'and':
      return {
        kind: 'bool',
        bool: truthy(evaluate(node.left, step)) && truthy(evaluate(node.right, step)),
      };
    case 'or':
      return {
        kind: 'bool',
        bool: truthy(evaluate(node.left, step)) || truthy(evaluate(node.right, step)),
      };
    case 'compare':
      return { kind: 'bool', bool: compare(node.op, evaluate(node.left, step), evaluate(node.right, step)) };
    default:
      return { kind: 'bool', bool: false };
  }
}

interface CachedCondition {
  node?: Node;
  error?: string;
}

const cache = new Map<string, CachedCondition>();

function compile(condition: string): CachedCondition {
  const cached = cache.get(condition);
  if (cached) return cached;
  let result: CachedCondition;
  const tokens = tokenize(condition);
  if ('error' in tokens) {
    result = { error: tokens.error };
  } else {
    const node = parse(tokens);
    result = 'error' in node ? { error: node.error } : { node };
  }
  if (cache.size > 200) cache.clear();
  cache.set(condition, result);
  return result;
}

/** 条件语法检查：返回 null 表示可用；返回字符串是可展示的错误 */
export function validateCondition(condition: string): string | null {
  if (condition.trim() === '') return null;
  const compiled = compile(condition);
  return compiled.error ?? null;
}

/**
 * 断点条件是否成立。
 * 空条件恒为真（普通断点）；条件写错时按「不命中」处理，由 validateCondition 负责提示。
 */
export function conditionMatches(condition: string | undefined, step: TraceStep): boolean {
  if (!condition || condition.trim() === '') return true;
  const compiled = compile(condition);
  if (!compiled.node) return false;
  try {
    return truthy(evaluate(compiled.node, step));
  } catch {
    return false;
  }
}
