/**
 * 输入输出与格式串工具
 * ------------------------------------------------------------------
 * 流程图需要判断"输出 / 输入"节点，分析器需要检查 printf/scanf 的
 * 格式串与参数，解释器需要真正格式化输出与解析输入 —— 三者共用本文件。
 */
import type { ExprNode } from './ast';
import { exprToText, oneLine, truncateText } from './utils';
import { STDLIB_TRACE_NAMES } from './stdlib';

/** 标准输出函数 */
export const OUTPUT_CALLS: ReadonlySet<string> = new Set(['printf', 'puts', 'putchar', 'fprintf', 'fputs']);
/** 标准输入函数 */
export const INPUT_CALLS: ReadonlySet<string> = new Set(['scanf', 'gets', 'fgets', 'fscanf']);

/** 解释器支持的外部函数：由标准库覆盖表统一生成（见 stdlib.ts） */
export const SUPPORTED_BUILTINS: ReadonlySet<string> = STDLIB_TRACE_NAMES;

/** 明确不支持的外部函数（文件、动态内存、随机数、STL 等） */
const UNSUPPORTED_FUNCTION_NAMES = [
  'fopen',
  'fclose',
  'fprintf',
  'fscanf',
  'fgets',
  'fputs',
  'fread',
  'fwrite',
  'fflush',
  'fseek',
  'ftell',
  'malloc',
  'calloc',
  'realloc',
  'free',
  'srand',
  'rand',
  'time',
  'exit',
  'abort',
  'system',
  'sort',
  'stable_sort',
  'vector',
  'map',
  'set',
  'ofstream',
  'ifstream',
  'getline',
  'strcpy',
  'strcat',
  'strcmp',
  'memset',
  'memcpy',
];

/** 去掉已被解释器接管的函数，避免"既支持又不支持"的矛盾 */
export const UNSUPPORTED_FUNCTIONS: ReadonlySet<string> = new Set(
  UNSUPPORTED_FUNCTION_NAMES.filter((name) => !SUPPORTED_BUILTINS.has(name)),
);

export interface IOInfo {
  kind: 'input' | 'output';
  name: string;
  label: string;
}

/** 把 a << b << c 拆成 base + 右操作数列表 */
export function flattenBinaryChain(expr: ExprNode, op: string): { base: ExprNode; items: ExprNode[] } {
  const items: ExprNode[] = [];
  let current = expr;
  while (current.kind === 'binary' && current.op === op) {
    items.unshift(current.right);
    current = current.left;
  }
  return { base: current, items };
}

/** 取表达式的"根名字"，例如 std::cout → std::cout */
export function rootName(expr: ExprNode): string {
  if (expr.kind === 'ident') return expr.name;
  if (expr.kind === 'member') {
    const left = rootName(expr.object);
    return left ? `${left}${expr.op}${expr.name}` : expr.name;
  }
  return '';
}

function stripAddress(expr: ExprNode): ExprNode {
  if (expr.kind === 'unary' && expr.op === '&') return expr.operand;
  return expr;
}

function itemsDescription(items: ExprNode[], maxPerItem = 12): string {
  const parts = items.slice(0, 3).map((item) => {
    if (item.kind === 'ident' && item.name === 'endl') return '换行';
    return truncateText(oneLine(exprToText(stripAddress(item))), maxPerItem);
  });
  if (items.length > 3) parts.push('…');
  return parts.join('、');
}

function firstStringArg(expr: ExprNode): string | null {
  if (expr.kind !== 'call') return null;
  const first = expr.args[0];
  if (first && first.kind === 'string') return first.value;
  return null;
}

function outputCallLabel(expr: ExprNode & { kind: 'call' }): string {
  const text = firstStringArg(expr);
  if (expr.name === 'putchar') return '输出一个字符';
  if (text !== null) {
    const clean = text.replace(/\n/g, '\\n').replace(/\t/g, '\\t');
    return `输出 "${truncateText(clean, 14)}"`;
  }
  return '输出到屏幕';
}

function inputCallLabel(expr: ExprNode & { kind: 'call' }): string {
  const targets = expr.args
    .slice(1)
    .filter((a) => a.kind !== 'string')
    .map((a) => truncateText(exprToText(stripAddress(a)), 12));
  if (targets.length > 0) return `读取输入 ${targets.slice(0, 3).join('、')}`;
  return '读取输入';
}

/** 识别一条表达式语句是输入还是输出 */
export function detectIOExpression(expr: ExprNode): IOInfo | null {
  if (expr.kind === 'call') {
    if (OUTPUT_CALLS.has(expr.name)) {
      return { kind: 'output', name: expr.name, label: outputCallLabel(expr) };
    }
    if (INPUT_CALLS.has(expr.name)) {
      return { kind: 'input', name: expr.name, label: inputCallLabel(expr) };
    }
    return null;
  }
  if (expr.kind === 'binary' && expr.op === '<<') {
    const { base, items } = flattenBinaryChain(expr, '<<');
    const name = rootName(base);
    if (/(^|::)cout$/.test(name)) {
      return { kind: 'output', name: 'cout', label: `输出 ${itemsDescription(items)}` };
    }
    return null;
  }
  if (expr.kind === 'binary' && expr.op === '>>') {
    const { base, items } = flattenBinaryChain(expr, '>>');
    const name = rootName(base);
    if (/(^|::)cin$/.test(name)) {
      return { kind: 'input', name: 'cin', label: `输入 ${itemsDescription(items)}` };
    }
    return null;
  }
  if (expr.kind === 'assign' && expr.op === '=') {
    return detectIOExpression(expr.value);
  }
  if (expr.kind === 'comma' && expr.items.length > 0) {
    return detectIOExpression(expr.items[expr.items.length - 1]);
  }
  return null;
}

/** 取表达式里"最外层"的函数调用（用于流程图 call 节点） */
export function detectCallExpression(expr: ExprNode): { name: string; label: string } | null {
  if (expr.kind === 'call') {
    return { name: expr.name, label: `调用 ${expr.name || '函数'}()` };
  }
  if (expr.kind === 'assign' && expr.op === '=' && expr.value.kind === 'call') {
    return {
      name: expr.value.name,
      label: `${exprToText(expr.target)} = ${expr.value.name || '函数'}()`,
    };
  }
  if (expr.kind === 'comma' && expr.items.length > 0) {
    return detectCallExpression(expr.items[expr.items.length - 1]);
  }
  return null;
}

/* ============================== printf / scanf 格式串 ============================== */

export interface FormatSpec {
  raw: string;
  flags: string;
  width: number | null;
  precision: number | null;
  length: string;
  conv: string;
  /** scanf 的 %* 抑制赋值 */
  suppressed: boolean;
  /** 宽度为 * 时为 true（暂不支持动态宽度） */
  dynamicWidth: boolean;
  /** 在格式串中的起止下标（解释器用于拼接字面量） */
  start: number;
  end: number;
}

/** 解析 printf / scanf 格式串为格式符列表 */
export function parseFormat(format: string): FormatSpec[] {
  const specs: FormatSpec[] = [];
  let i = 0;
  while (i < format.length) {
    if (format[i] !== '%') {
      i++;
      continue;
    }
    const start = i;
    i++;
    if (i >= format.length) break;
    let suppressed = false;
    if (format[i] === '%') {
      specs.push({
        raw: '%%',
        flags: '',
        width: null,
        precision: null,
        length: '',
        conv: '%',
        suppressed: false,
        dynamicWidth: false,
        start,
        end: i + 1,
      });
      i++;
      continue;
    }
    let flags = '';
    while (i < format.length && '-+0 #'.includes(format[i])) {
      flags += format[i];
      i++;
    }
    let dynamicWidth = false;
    if (format[i] === '*') {
      // printf 中表示动态宽度；scanf 中表示跳过该输入
      suppressed = true;
      dynamicWidth = true;
      i++;
    }
    let width: number | null = null;
    if (format[i] === '*') {
      dynamicWidth = true;
      i++;
    } else {
      let widthText = '';
      while (i < format.length && format[i] >= '0' && format[i] <= '9') {
        widthText += format[i];
        i++;
      }
      if (widthText) width = parseInt(widthText, 10);
    }
    let precision: number | null = null;
    if (format[i] === '.') {
      i++;
      let precisionText = '';
      while (i < format.length && format[i] >= '0' && format[i] <= '9') {
        precisionText += format[i];
        i++;
      }
      precision = precisionText ? parseInt(precisionText, 10) : 0;
    }
    let length = '';
    if (format.startsWith('hh', i) || format.startsWith('ll', i)) {
      length = format.slice(i, i + 2);
      i += 2;
    } else if (i < format.length && 'hlLztj'.includes(format[i])) {
      length = format[i];
      i++;
    }
    if (i >= format.length) break;
    const conv = format[i];
    i++;
    specs.push({
      raw: format.slice(start, i),
      flags,
      width,
      precision,
      length,
      conv,
      suppressed,
      dynamicWidth,
      start,
      end: i,
    });
  }
  return specs;
}

/** printf 中需要消费参数的格式符（不含 %%） */
export function printfArgCount(specs: FormatSpec[]): number {
  return specs.filter((s) => s.conv !== '%').length;
}

/** scanf 中真正写入参数的格式符数量（%* 不占参数） */
export function scanfArgCount(specs: FormatSpec[]): number {
  return specs.filter((s) => s.conv !== '%' && !s.suppressed).length;
}

/** scanf 需要显式取地址的转换符（%s / %[ 传字符数组名即可） */
export function scanfNeedsAddress(spec: FormatSpec): boolean {
  return spec.conv !== 's' && spec.conv !== '[';
}
