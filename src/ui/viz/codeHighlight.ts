/**
 * 自研轻量 C/C++ 语法高亮
 * ------------------------------------------------------------------
 * 只做词法级着色：注释、字符串、数字、预处理、关键字、类型、函数名、标点。
 * 输出 token 数组，由 React 逐段渲染为 <span>，绝不使用 innerHTML。
 * 支持跨行块注释；逐行处理以保留代码的原始空白与缩进。
 */

export type TokenKind =
  | 'plain'
  | 'keyword'
  | 'type'
  | 'function'
  | 'string'
  | 'number'
  | 'comment'
  | 'preprocessor'
  | 'punct'
  | 'ident';

export interface CodeToken {
  text: string;
  kind: TokenKind;
}

export interface HighlightedLine {
  tokens: CodeToken[];
}

const C_KEYWORDS = new Set([
  'auto',
  'break',
  'case',
  'const',
  'continue',
  'default',
  'do',
  'else',
  'enum',
  'extern',
  'for',
  'goto',
  'if',
  'inline',
  'register',
  'restrict',
  'return',
  'sizeof',
  'static',
  'struct',
  'switch',
  'typedef',
  'union',
  'volatile',
  'while',
  '_Bool',
]);

const CPP_KEYWORDS = new Set([
  ...C_KEYWORDS,
  'and',
  'and_eq',
  'asm',
  'bitand',
  'bitor',
  'catch',
  'class',
  'compl',
  'constexpr',
  'const_cast',
  'decltype',
  'delete',
  'dynamic_cast',
  'explicit',
  'export',
  'friend',
  'mutable',
  'namespace',
  'new',
  'noexcept',
  'not',
  'not_eq',
  'operator',
  'or',
  'or_eq',
  'override',
  'private',
  'protected',
  'public',
  'reinterpret_cast',
  'static_assert',
  'static_cast',
  'template',
  'this',
  'throw',
  'try',
  'typeid',
  'typename',
  'using',
  'virtual',
  'xor',
  'xor_eq',
  'final',
  'nullptr',
  'true',
  'false',
]);

const TYPE_WORDS = new Set([
  'bool',
  'char',
  'double',
  'float',
  'int',
  'long',
  'short',
  'signed',
  'unsigned',
  'void',
  'wchar_t',
  'char16_t',
  'char32_t',
  'size_t',
  'ssize_t',
  'int8_t',
  'int16_t',
  'int32_t',
  'int64_t',
  'uint8_t',
  'uint16_t',
  'uint32_t',
  'uint64_t',
  'string',
  'vector',
  'pair',
  'map',
  'set',
  'unique_ptr',
  'shared_ptr',
  'iostream',
  'ostream',
  'istream',
  'std',
  'cout',
  'cin',
  'cerr',
  'endl',
  'NULL',
]);

const PUNCTUATION = new Set('+-*/%=<>!&|^~?:;,.()[]{}#@$\\'.split(''));

const NUMBER_RE = /^(?:0[xX][0-9a-fA-F]+|\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)(?:[uUlLfF]+)?/;
const IDENT_START = /[A-Za-z_$]/;
const IDENT_PART = /[A-Za-z0-9_$]/;

function push(tokens: CodeToken[], text: string, kind: TokenKind): void {
  if (text.length === 0) return;
  tokens.push({ text, kind });
}

/** 把整段代码高亮为「行 → token」结构 */
export function highlightCode(source: string, language: 'c' | 'cpp'): HighlightedLine[] {
  const normalized = (source ?? '').replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const keywords = language === 'cpp' ? CPP_KEYWORDS : C_KEYWORDS;
  const result: HighlightedLine[] = [];
  let blockComment = false;

  for (const line of lines) {
    const tokens: CodeToken[] = [];
    let index = 0;

    if (blockComment) {
      const end = line.indexOf('*/');
      if (end < 0) {
        push(tokens, line, 'comment');
        result.push({ tokens });
        continue;
      }
      push(tokens, line.slice(0, end + 2), 'comment');
      index = end + 2;
      blockComment = false;
    }

    // 预处理指令：整行着色（含 #include <...>）
    let probe = index;
    while (probe < line.length && (line[probe] === ' ' || line[probe] === '\t')) probe += 1;
    if (line[probe] === '#') {
      push(tokens, line.slice(index), 'preprocessor');
      result.push({ tokens });
      continue;
    }

    while (index < line.length) {
      const ch = line[index];

      if (ch === ' ' || ch === '\t') {
        let end = index;
        while (end < line.length && (line[end] === ' ' || line[end] === '\t')) end += 1;
        push(tokens, line.slice(index, end), 'plain');
        index = end;
        continue;
      }

      if (ch === '/' && line[index + 1] === '/') {
        push(tokens, line.slice(index), 'comment');
        index = line.length;
        break;
      }

      if (ch === '/' && line[index + 1] === '*') {
        const end = line.indexOf('*/', index + 2);
        if (end < 0) {
          push(tokens, line.slice(index), 'comment');
          blockComment = true;
          index = line.length;
          break;
        }
        push(tokens, line.slice(index, end + 2), 'comment');
        index = end + 2;
        continue;
      }

      if (ch === '"' || ch === "'") {
        let end = index + 1;
        while (end < line.length) {
          if (line[end] === '\\') {
            end += 2;
            continue;
          }
          if (line[end] === ch) {
            end += 1;
            break;
          }
          end += 1;
        }
        const stop = Math.min(end, line.length);
        push(tokens, line.slice(index, stop), 'string');
        index = stop;
        continue;
      }

      if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(line[index + 1] ?? ''))) {
        const match = NUMBER_RE.exec(line.slice(index));
        if (match) {
          push(tokens, match[0], 'number');
          index += match[0].length;
          continue;
        }
      }

      if (IDENT_START.test(ch)) {
        let end = index + 1;
        while (end < line.length && IDENT_PART.test(line[end])) end += 1;
        const word = line.slice(index, end);
        let kind: TokenKind = 'ident';
        if (TYPE_WORDS.has(word)) {
          kind = 'type';
        } else if (keywords.has(word)) {
          kind = 'keyword';
        } else {
          let lookahead = end;
          while (lookahead < line.length && (line[lookahead] === ' ' || line[lookahead] === '\t')) {
            lookahead += 1;
          }
          kind = line[lookahead] === '(' ? 'function' : 'ident';
        }
        push(tokens, word, kind);
        index = end;
        continue;
      }

      if (PUNCTUATION.has(ch)) {
        let end = index + 1;
        while (end < line.length) {
          const next = line[end];
          if (!PUNCTUATION.has(next)) break;
          if (next === '/' && (line[end + 1] === '/' || line[end + 1] === '*')) break;
          end += 1;
        }
        push(tokens, line.slice(index, end), 'punct');
        index = end;
        continue;
      }

      push(tokens, ch, 'plain');
      index += 1;
    }

    result.push({ tokens });
  }

  return result;
}

/** 判断代码更像 C 还是 C++（轻量启发式，仅供高亮选择词表） */
export function guessLanguage(code: string): 'c' | 'cpp' {
  return /(?:^|\s)(?:class|namespace|template|using\s+namespace|std::|cout|cin)\b|#include\s*<(?:iostream|string|vector|map|algorithm)>/m.test(
    code,
  )
    ? 'cpp'
    : 'c';
}
