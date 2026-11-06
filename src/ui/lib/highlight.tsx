/**
 * 自研轻量 C/C++ 高亮器。
 * - 纯函数、逐行处理，跨行块注释状态由调用方在行间传递；
 * - 只产生 token 数据，由 React 渲染成 span，全程不使用 innerHTML；
 * - 供课程代码块、首页代码卡与实验室之外的静态代码展示复用。
 */
import type { ReactNode } from 'react';

export type TokenKind =
  | 'plain'
  | 'comment'
  | 'string'
  | 'char'
  | 'number'
  | 'keyword'
  | 'type'
  | 'function'
  | 'punct'
  | 'preprocessor';

export interface CodeToken {
  text: string;
  kind: TokenKind;
}

export interface HighlightState {
  inBlockComment: boolean;
}

const KEYWORDS = new Set([
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break',
  'continue', 'return', 'goto', 'struct', 'class', 'union', 'enum', 'typedef',
  'sizeof', 'static', 'const', 'volatile', 'extern', 'inline', 'virtual',
  'override', 'final', 'public', 'private', 'protected', 'template', 'typename',
  'namespace', 'using', 'new', 'delete', 'this', 'operator', 'friend', 'try',
  'catch', 'throw', 'constexpr', 'auto', 'true', 'false', 'nullptr', 'NULL',
  'noexcept', 'explicit', 'mutable', 'static_cast', 'dynamic_cast',
  'const_cast', 'reinterpret_cast', 'virtual', 'register', 'asm', 'decltype',
  'co_return', 'co_await', 'co_yield', 'concept', 'requires', 'export',
]);

const TYPES = new Set([
  'int', 'char', 'float', 'double', 'void', 'long', 'short', 'unsigned',
  'signed', 'bool', 'size_t', 'ssize_t', 'wchar_t', 'char16_t', 'char32_t',
  'int8_t', 'int16_t', 'int32_t', 'int64_t', 'uint8_t', 'uint16_t', 'uint32_t',
  'uint64_t', 'string', 'vector', 'map', 'set', 'pair', 'list', 'deque',
  'shared_ptr', 'unique_ptr', 'FILE', 'ostream', 'istream', 'string_view',
]);

const OPERATOR_CHARS = new Set(
  '+-*/%=<>!&|^~?:;,.()[]{}'.split(''),
);

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}

function isIdentPart(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}

function isSpace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\r';
}

/**
 * 高亮单行。返回的 state 需要传给下一行（块注释可能跨行）。
 */
export function highlightLine(
  line: string,
  incoming: HighlightState,
): { tokens: CodeToken[]; state: HighlightState } {
  const tokens: CodeToken[] = [];
  const push = (text: string, kind: TokenKind): void => {
    if (text.length > 0) tokens.push({ text, kind });
  };

  let i = 0;
  let inBlockComment = incoming.inBlockComment;

  if (inBlockComment) {
    const end = line.indexOf('*/');
    if (end === -1) {
      push(line, 'comment');
      return { tokens, state: { inBlockComment: true } };
    }
    push(line.slice(0, end + 2), 'comment');
    i = end + 2;
    inBlockComment = false;
  }

  // 预处理指令：整行着紫色（行首可以有空白）
  if (i === 0 && /^\s*#/.test(line)) {
    push(line, 'preprocessor');
    return { tokens, state: { inBlockComment } };
  }

  while (i < line.length) {
    const ch = line[i];
    const next = line[i + 1] ?? '';

    if (isSpace(ch)) {
      let j = i + 1;
      while (j < line.length && isSpace(line[j])) j += 1;
      push(line.slice(i, j), 'plain');
      i = j;
      continue;
    }

    if (ch === '/' && next === '/') {
      push(line.slice(i), 'comment');
      break;
    }

    if (ch === '/' && next === '*') {
      const end = line.indexOf('*/', i + 2);
      if (end === -1) {
        push(line.slice(i), 'comment');
        inBlockComment = true;
        break;
      }
      push(line.slice(i, end + 2), 'comment');
      i = end + 2;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      let closed = false;
      while (j < line.length) {
        if (line[j] === '\\') {
          j += 2;
          continue;
        }
        if (line[j] === quote) {
          j += 1;
          closed = true;
          break;
        }
        j += 1;
      }
      const text = line.slice(i, Math.min(j, line.length));
      push(text, quote === '"' ? 'string' : 'char');
      i = closed ? j : line.length;
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(next))) {
      const numberMatch = /^(?:0[xX][0-9a-fA-F]+|0[bB][01]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)(?:[uUlLfF]|ll|LL)*/.exec(
        line.slice(i),
      );
      if (numberMatch) {
        push(numberMatch[0], 'number');
        i += numberMatch[0].length;
        continue;
      }
    }

    if (isIdentStart(ch)) {
      let j = i + 1;
      while (j < line.length && isIdentPart(line[j])) j += 1;
      const word = line.slice(i, j);
      let kind: TokenKind = 'plain';
      if (TYPES.has(word)) {
        kind = 'type';
      } else if (KEYWORDS.has(word)) {
        kind = 'keyword';
      } else {
        // 后跟 ( 的标识符视为函数调用 / 函数名
        let k = j;
        while (k < line.length && isSpace(line[k])) k += 1;
        if (line[k] === '(') kind = 'function';
      }
      push(word, kind);
      i = j;
      continue;
    }

    if (OPERATOR_CHARS.has(ch)) {
      let j = i + 1;
      while (j < line.length && OPERATOR_CHARS.has(line[j])) {
        // 避免把 `a[i]` 的括号和后面的运算符粘成一块
        if ('()[]{}'.includes(line[j])) break;
        j += 1;
      }
      push(line.slice(i, j), 'punct');
      i = j;
      continue;
    }

    push(ch, 'plain');
    i += 1;
  }

  return { tokens, state: { inBlockComment } };
}

/** 整段代码按行高亮。 */
export function highlightCode(code: string): CodeToken[][] {
  const lines = code.replace(/\r\n?/g, '\n').split('\n');
  let state: HighlightState = { inBlockComment: false };
  return lines.map((line) => {
    const result = highlightLine(line, state);
    state = result.state;
    return result.tokens;
  });
}

/** 把 token 数组渲染为 React 节点。 */
export function renderTokens(tokens: CodeToken[]): ReactNode[] {
  return tokens.map((token, index) =>
    token.kind === 'plain' ? (
      token.text
    ) : (
      <span key={index} className={`code-token code-token--${token.kind}`}>
        {token.text}
      </span>
    ),
  );
}

export function tokenClass(kind: TokenKind): string {
  return `code-token code-token--${kind}`;
}
