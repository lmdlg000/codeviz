/**
 * 容错词法分析器
 * ------------------------------------------------------------------
 * 特点：
 * - 永不抛异常：未闭合的字符串 / 注释只记一条 issue 后继续；
 * - 预处理行整体作为一个 token（`#include`、`#define` …），后续由 parser 处理；
 * - 同时给出按行统计（代码行 / 注释行 / 空行），供"代码画像"使用；
 * - 记录注释区间与 #include，供结构大纲和诊断使用。
 */

export type TokenKind =
  | 'ident'
  | 'keyword'
  | 'number'
  | 'string'
  | 'char'
  | 'punct'
  | 'preproc'
  | 'eof';

export interface Token {
  kind: TokenKind;
  /** 原始文本 */
  text: string;
  /** 字符串 / 字符字面量解码后的值 */
  value?: string;
  /** 数字字面量的数值 */
  num?: number;
  isFloat?: boolean;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

export interface CommentInfo {
  line: number;
  endLine: number;
  block: boolean;
  text: string;
}

export interface LexIssue {
  line: number;
  column: number;
  message: string;
  rule: string;
}

export interface LineStats {
  totalLines: number;
  codeLines: number;
  commentLines: number;
  blankLines: number;
}

export interface TokenizeResult {
  tokens: Token[];
  comments: CommentInfo[];
  issues: LexIssue[];
  lineStats: LineStats;
  characters: number;
}

/** C / C++ 关键字（true/false/nullptr 也作为关键字，parser 会按字面量处理） */
export const KEYWORDS: ReadonlySet<string> = new Set([
  // 流程
  'if',
  'else',
  'while',
  'do',
  'for',
  'switch',
  'case',
  'default',
  'break',
  'continue',
  'return',
  'goto',
  'try',
  'catch',
  'throw',
  // 类型
  'void',
  'bool',
  'char',
  'short',
  'int',
  'long',
  'float',
  'double',
  'signed',
  'unsigned',
  'wchar_t',
  'char8_t',
  'char16_t',
  'char32_t',
  'auto',
  'size_t',
  'decltype',
  'struct',
  'class',
  'union',
  'enum',
  'typedef',
  'typename',
  // 限定符
  'const',
  'volatile',
  'static',
  'extern',
  'register',
  'inline',
  'constexpr',
  'consteval',
  'mutable',
  'thread_local',
  'virtual',
  'override',
  'final',
  'explicit',
  'friend',
  'noexcept',
  // 名字空间与模板
  'namespace',
  'using',
  'template',
  'operator',
  'new',
  'delete',
  'this',
  'nullptr',
  'true',
  'false',
  'sizeof',
  'alignof',
  'alignas',
  'static_assert',
  'decltype',
  // 访问控制
  'public',
  'private',
  'protected',
]);

const MULTI_PUNCT = [
  '>>=',
  '<<=',
  '...',
  '->*',
  '::',
  '->',
  '++',
  '--',
  '<<',
  '>>',
  '<=',
  '>=',
  '==',
  '!=',
  '&&',
  '||',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '&=',
  '|=',
  '^=',
  '.*',
  '##',
];

const SINGLE_PUNCT = '+-*/%<>=!&|^~?:;,.(){}[]';

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function isHexDigit(ch: string): boolean {
  return isDigit(ch) || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F');
}

function isIdStart(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_' || ch === '$';
}

function isIdPart(ch: string): boolean {
  return isIdStart(ch) || isDigit(ch);
}

function isSpace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\f' || ch === '\v';
}

/**
 * 统计代码行 / 注释行 / 空行。
 * 规则：含代码的行算代码行（即使行尾有注释）；纯注释行算注释行；
 * 其余空白行算空行。多行注释内部各行按注释行计。
 */
export function computeLineStats(code: string): LineStats {
  const lines = code.split(/\r\n|\r|\n/);
  let codeLines = 0;
  let commentLines = 0;
  let blankLines = 0;

  let inBlockComment = false;
  let inString = false;
  let inChar = false;
  let inPreproc = false;

  for (const rawLine of lines) {
    let i = 0;
    let hasCode = false;
    let hasComment = false;
    let lineOnlyPreproc = false;

    if (inPreproc) {
      hasCode = true;
      lineOnlyPreproc = true;
      const trimmed = rawLine.trimEnd();
      inPreproc = trimmed.endsWith('\\');
      if (!inPreproc) {
        // 预处理结束后本行剩余的空白不影响统计
      }
      codeLines++;
      continue;
    }

    while (i < rawLine.length) {
      const ch = rawLine[i];

      if (inBlockComment) {
        hasComment = true;
        const close = rawLine.indexOf('*/', i);
        if (close === -1) {
          i = rawLine.length;
          break;
        }
        inBlockComment = false;
        i = close + 2;
        continue;
      }

      if (inString) {
        hasCode = true;
        if (ch === '\\') {
          i += 2;
          continue;
        }
        if (ch === '"') {
          inString = false;
        }
        i++;
        continue;
      }

      if (inChar) {
        hasCode = true;
        if (ch === '\\') {
          i += 2;
          continue;
        }
        if (ch === "'") {
          inChar = false;
        }
        i++;
        continue;
      }

      if (ch === '/' && rawLine[i + 1] === '/') {
        hasComment = true;
        break;
      }
      if (ch === '/' && rawLine[i + 1] === '*') {
        hasComment = true;
        inBlockComment = true;
        i += 2;
        continue;
      }
      if (ch === '"') {
        hasCode = true;
        inString = true;
        i++;
        continue;
      }
      if (ch === "'") {
        hasCode = true;
        inChar = true;
        i++;
        continue;
      }
      if (ch === '#' && rawLine.slice(0, i).trim().length === 0) {
        hasCode = true;
        lineOnlyPreproc = true;
        const trimmed = rawLine.trimEnd();
        inPreproc = trimmed.endsWith('\\');
        break;
      }
      if (!isSpace(ch) && ch !== '\r') {
        hasCode = true;
      }
      i++;
    }

    if (hasCode) codeLines++;
    else if (hasComment) commentLines++;
    else blankLines++;

    void lineOnlyPreproc;
  }

  return { totalLines: lines.length, codeLines, commentLines, blankLines };
}

/** 词法分析：返回 token 流、注释、词法问题与行统计 */
export function tokenize(code: string): TokenizeResult {
  const tokens: Token[] = [];
  const comments: CommentInfo[] = [];
  const issues: LexIssue[] = [];
  const lineStats = computeLineStats(code);

  let i = 0;
  let line = 1;
  let column = 1;
  let atLineStart = true;

  const len = code.length;

  const advance = (count = 1): void => {
    for (let k = 0; k < count; k++) {
      if (i >= len) return;
      const ch = code[i];
      if (ch === '\n') {
        line++;
        column = 1;
        atLineStart = true;
      } else {
        column++;
        if (!isSpace(ch) && ch !== '\r') atLineStart = false;
      }
      i++;
    }
  };

  /** 解码一个转义序列，返回文本与消耗的字符数 */
  const decodeEscape = (pos: number): { text: string; length: number } => {
    const esc = code[pos + 1] ?? '';
    switch (esc) {
      case 'n':
        return { text: '\n', length: 2 };
      case 't':
        return { text: '\t', length: 2 };
      case 'r':
        return { text: '\r', length: 2 };
      case '0':
        return { text: '\0', length: 2 };
      case 'a':
        return { text: '\x07', length: 2 };
      case 'b':
        return { text: '\b', length: 2 };
      case 'f':
        return { text: '\f', length: 2 };
      case 'v':
        return { text: '\v', length: 2 };
      case '\\':
        return { text: '\\', length: 2 };
      case '"':
        return { text: '"', length: 2 };
      case "'":
        return { text: "'", length: 2 };
      case '?':
        return { text: '?', length: 2 };
      case 'x': {
        let j = pos + 2;
        let hex = '';
        while (j < len && isHexDigit(code[j]) && hex.length < 2) {
          hex += code[j];
          j++;
        }
        if (!hex) return { text: 'x', length: 2 };
        return { text: String.fromCharCode(parseInt(hex, 16)), length: j - pos };
      }
      case 'u': {
        let j = pos + 2;
        let hex = '';
        while (j < len && isHexDigit(code[j]) && hex.length < 4) {
          hex += code[j];
          j++;
        }
        if (!hex) return { text: 'u', length: 2 };
        return { text: String.fromCharCode(parseInt(hex, 16)), length: j - pos };
      }
      default: {
        if (esc >= '0' && esc <= '7') {
          let j = pos + 1;
          let oct = '';
          while (j < len && code[j] >= '0' && code[j] <= '7' && oct.length < 3) {
            oct += code[j];
            j++;
          }
          return { text: String.fromCharCode(parseInt(oct, 8)), length: j - pos };
        }
        if (esc === '') return { text: '', length: 1 };
        return { text: esc, length: 2 };
      }
    }
  };

  while (i < len) {
    const ch = code[i];

    if (ch === '\r' || ch === '\n' || isSpace(ch)) {
      advance();
      continue;
    }

    const startLine = line;
    const startColumn = column;
    const startIndex = i;

    // ---------- 注释 ----------
    if (ch === '/' && code[i + 1] === '/') {
      while (i < len && code[i] !== '\n') advance();
      comments.push({
        line: startLine,
        endLine: line,
        block: false,
        text: code.slice(startIndex + 2, i),
      });
      continue;
    }

    if (ch === '/' && code[i + 1] === '*') {
      advance(2);
      const bodyStart = i;
      while (i < len && !(code[i] === '*' && code[i + 1] === '/')) advance();
      const text = code.slice(bodyStart, i);
      if (i >= len) {
        issues.push({
          line: startLine,
          column: startColumn,
          message: '块注释没有闭合的 */，后续代码可能被误当成注释。',
          rule: 'unterminated-comment',
        });
      } else {
        advance(2);
      }
      comments.push({ line: startLine, endLine: line, block: true, text });
      continue;
    }

    // ---------- 预处理行 ----------
    if (ch === '#' && atLineStart) {
      advance();
      while (i < len) {
        if (code[i] === '\\' && (code[i + 1] === '\n' || (code[i + 1] === '\r' && code[i + 2] === '\n'))) {
          advance(code[i + 1] === '\r' ? 3 : 2);
          continue;
        }
        if (code[i] === '\n') break;
        advance();
      }
      tokens.push({
        kind: 'preproc',
        text: code.slice(startIndex, i),
        line: startLine,
        column: startColumn,
        endLine: line,
        endColumn: column,
      });
      continue;
    }

    // ---------- 字符串字面量（含 L/u8 等前缀） ----------
    if (ch === '"') {
      advance();
      let value = '';
      let terminated = false;
      while (i < len) {
        const c = code[i];
        if (c === '\\') {
          const esc = decodeEscape(i);
          value += esc.text;
          advance(esc.length);
          continue;
        }
        if (c === '"') {
          advance();
          terminated = true;
          break;
        }
        if (c === '\n') break;
        value += c;
        advance();
      }
      if (!terminated) {
        issues.push({
          line: startLine,
          column: startColumn,
          message: '字符串缺少结束的双引号。',
          rule: 'unterminated-string',
        });
      }
      tokens.push({
        kind: 'string',
        text: code.slice(startIndex, i),
        value,
        line: startLine,
        column: startColumn,
        endLine: line,
        endColumn: column,
      });
      continue;
    }

    // ---------- 字符字面量 ----------
    if (ch === "'") {
      advance();
      let value = '';
      let terminated = false;
      while (i < len) {
        const c = code[i];
        if (c === '\\') {
          const esc = decodeEscape(i);
          value += esc.text;
          advance(esc.length);
          continue;
        }
        if (c === "'") {
          advance();
          terminated = true;
          break;
        }
        if (c === '\n') break;
        value += c;
        advance();
      }
      if (!terminated) {
        issues.push({
          line: startLine,
          column: startColumn,
          message: '字符常量缺少结束的单引号。',
          rule: 'unterminated-char',
        });
      }
      tokens.push({
        kind: 'char',
        text: code.slice(startIndex, i),
        value,
        line: startLine,
        column: startColumn,
        endLine: line,
        endColumn: column,
      });
      continue;
    }

    // ---------- 数字 ----------
    if (isDigit(ch) || (ch === '.' && isDigit(code[i + 1] ?? ''))) {
      let raw = '';
      let isFloat = false;
      if (ch === '0' && (code[i + 1] === 'x' || code[i + 1] === 'X')) {
        raw += code[i];
        advance();
        raw += code[i];
        advance();
        while (i < len && isHexDigit(code[i])) {
          raw += code[i];
          advance();
        }
      } else if (ch === '0' && (code[i + 1] === 'b' || code[i + 1] === 'B')) {
        raw += code[i];
        advance();
        raw += code[i];
        advance();
        while (i < len && (code[i] === '0' || code[i] === '1')) {
          raw += code[i];
          advance();
        }
      } else {
        while (i < len && isDigit(code[i])) {
          raw += code[i];
          advance();
        }
        if (i < len && code[i] === '.' && isDigit(code[i + 1] ?? '')) {
          isFloat = true;
          raw += code[i];
          advance();
          while (i < len && isDigit(code[i])) {
            raw += code[i];
            advance();
          }
        }
        if (i < len && (code[i] === 'e' || code[i] === 'E')) {
          const next = code[i + 1] ?? '';
          if (isDigit(next) || ((next === '+' || next === '-') && isDigit(code[i + 2] ?? ''))) {
            isFloat = true;
            raw += code[i];
            advance();
            raw += code[i];
            advance();
            while (i < len && isDigit(code[i])) {
              raw += code[i];
              advance();
            }
          }
        }
      }
      // 后缀 u/U/l/L/f/F
      while (i < len && /[uUlLfF]/.test(code[i])) {
        if (code[i] === 'f' || code[i] === 'F') isFloat = true;
        raw += code[i];
        advance();
      }
      let num = 0;
      const clean = raw.replace(/[uUlL]+$/, '');
      if (raw.startsWith('0x') || raw.startsWith('0X')) {
        num = parseInt(clean.slice(2), 16);
      } else if (raw.startsWith('0b') || raw.startsWith('0B')) {
        num = parseInt(clean.slice(2), 2);
      } else if (isFloat) {
        num = Number(clean.replace(/[fF]$/, ''));
      } else {
        num = parseInt(clean, 10);
      }
      if (!Number.isFinite(num)) num = 0;
      tokens.push({
        kind: 'number',
        text: raw,
        num,
        isFloat,
        line: startLine,
        column: startColumn,
        endLine: line,
        endColumn: column,
      });
      continue;
    }

    // ---------- 标识符 / 关键字 ----------
    if (isIdStart(ch)) {
      while (i < len && isIdPart(code[i])) advance();
      const text = code.slice(startIndex, i);
      // 字符串前缀：L"..." / u"..." / U"..." / u8"..."
      if ((text === 'L' || text === 'u' || text === 'U' || text === 'u8') && code[i] === '"') {
        const prefixStart = startIndex;
        advance();
        let value = '';
        let terminated = false;
        while (i < len) {
          const c = code[i];
          if (c === '\\') {
            const esc = decodeEscape(i);
            value += esc.text;
            advance(esc.length);
            continue;
          }
          if (c === '"') {
            advance();
            terminated = true;
            break;
          }
          if (c === '\n') break;
          value += c;
          advance();
        }
        if (!terminated) {
          issues.push({
            line: startLine,
            column: startColumn,
            message: '字符串缺少结束的双引号。',
            rule: 'unterminated-string',
          });
        }
        tokens.push({
          kind: 'string',
          text: code.slice(prefixStart, i),
          value,
          line: startLine,
          column: startColumn,
          endLine: line,
          endColumn: column,
        });
        continue;
      }
      tokens.push({
        kind: KEYWORDS.has(text) ? 'keyword' : 'ident',
        text,
        line: startLine,
        column: startColumn,
        endLine: line,
        endColumn: column,
      });
      continue;
    }

    // ---------- 运算符与标点 ----------
    let punct = '';
    for (const p of MULTI_PUNCT) {
      if (code.startsWith(p, i)) {
        punct = p;
        break;
      }
    }
    if (!punct && SINGLE_PUNCT.includes(ch)) punct = ch;
    if (punct) {
      advance(punct.length);
      tokens.push({
        kind: 'punct',
        text: punct,
        line: startLine,
        column: startColumn,
        endLine: line,
        endColumn: column,
      });
      continue;
    }

    // 无法识别的字符：跳过，保持容错（不报错，避免噪音）
    advance();
  }

  tokens.push({
    kind: 'eof',
    text: '',
    line,
    column,
    endLine: line,
    endColumn: column,
  });

  return {
    tokens,
    comments,
    issues,
    lineStats,
    characters: code.length,
  };
}
