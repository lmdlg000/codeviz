/**
 * 解释器运行时值模型与格式化
 * ------------------------------------------------------------------
 * 教学解释器只区分：整数（含 char / bool）、浮点、字符串、数组、
 * 指针、struct、空指针与 void。所有值都是普通对象，便于栈/全局作用域
 * 共享同一份可变数组与结构体。
 */
import type { DataCategory } from './types';
import { formatNumber } from './utils';

export interface Ref {
  get(): RValue;
  set(value: RValue): void;
  label: string;
  typeText?: string;
}

export interface IntValue {
  t: 'int';
  v: number;
  typeText: string;
}

export interface FloatValue {
  t: 'float';
  v: number;
  typeText: string;
}

export interface StringValue {
  t: 'string';
  v: string;
  typeText: string;
}

export interface ArrayValue {
  t: 'array';
  elems: RValue[];
  dims: number[];
  elemType: string;
  typeText: string;
}

export interface PointerValue {
  t: 'pointer';
  label: string;
  target: Ref | null;
  elemType: string;
  typeText: string;
  array?: ArrayValue;
  offset: number;
  /** 指向字符串常量时的内容 */
  str?: string;
}

export interface StructValue {
  t: 'struct';
  typeName: string;
  fields: Map<string, RValue>;
  fieldTypes: Map<string, string>;
  typeText: string;
}

export interface NullValue {
  t: 'null';
  typeText: string;
}

export interface VoidValue {
  t: 'void';
}

export type RValue =
  | IntValue
  | FloatValue
  | StringValue
  | ArrayValue
  | PointerValue
  | StructValue
  | NullValue
  | VoidValue;

/* ============================== 类型判断 ============================== */

export function isPointerType(typeText: string): boolean {
  return typeText.includes('*');
}

export function isStringType(typeText: string): boolean {
  return /string/i.test(typeText);
}

export function isFloatType(typeText: string): boolean {
  return /\b(float|double)\b/i.test(typeText);
}

export function isCharType(typeText: string): boolean {
  return /\bchar\b/i.test(typeText) && !isPointerType(typeText);
}

export function isBoolType(typeText: string): boolean {
  return /\bbool\b/i.test(typeText);
}

export function typeBase(typeText: string): string {
  const text = typeText
    .replace(/\b(const|volatile|static|extern|register|inline|constexpr|mutable|struct|class|union|enum)\b/g, '')
    .replace(/[*&]/g, ' ')
    .trim();
  return text.replace(/\s+/g, ' ');
}

/** 类型文本 → 基础类型名（用于注册表查找） */
export function baseTypeName(typeText: string): string {
  const base = typeBase(typeText);
  const parts = base.split('::');
  return parts[parts.length - 1].trim();
}

export function categoryOfValue(value: RValue): DataCategory {
  switch (value.t) {
    case 'int':
      if (isCharType(value.typeText)) return 'char';
      if (isBoolType(value.typeText)) return 'bool';
      return 'int';
    case 'float':
      return /\bfloat\b/i.test(value.typeText) && !/double/i.test(value.typeText) ? 'float' : 'double';
    case 'string':
      return 'string';
    case 'array':
      return 'array';
    case 'pointer':
      return 'pointer';
    case 'struct':
      return 'struct';
    case 'null':
      return 'pointer';
    case 'void':
      return 'void';
    default:
      return 'unknown';
  }
}

/* ============================== 数值转换 ============================== */

export function intValue(value: number, typeText = 'int'): IntValue {
  return { t: 'int', v: Number.isFinite(value) ? Math.trunc(value) : 0, typeText };
}

export function floatValue(value: number, typeText = 'double'): FloatValue {
  return { t: 'float', v: Number.isFinite(value) ? value : 0, typeText };
}

export function boolValue(value: boolean): IntValue {
  return { t: 'int', v: value ? 1 : 0, typeText: 'bool' };
}

export function stringValue(value: string, typeText = 'std::string'): StringValue {
  return { t: 'string', v: value, typeText };
}

export function nullValue(): NullValue {
  return { t: 'null', typeText: 'nullptr' };
}

export function voidValue(): VoidValue {
  return { t: 'void' };
}

export function isNumeric(value: RValue): value is IntValue | FloatValue {
  return value.t === 'int' || value.t === 'float';
}

export function asNumber(value: RValue): number {
  switch (value.t) {
    case 'int':
      return value.v;
    case 'float':
      return value.v;
    case 'string': {
      const parsed = Number(value.v);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    case 'null':
      return 0;
    default:
      return 0;
  }
}

export function asInt(value: RValue): number {
  return Math.trunc(asNumber(value));
}

export function truthy(value: RValue): boolean {
  switch (value.t) {
    case 'int':
      return value.v !== 0;
    case 'float':
      return value.v !== 0;
    case 'string':
      return value.v.length > 0;
    case 'array':
      return value.elems.length > 0;
    case 'pointer':
      return value.target !== null || value.str !== undefined;
    case 'null':
      return false;
    case 'struct':
      return true;
    case 'void':
      return false;
    default:
      return false;
  }
}

/* ============================== 显示格式化 ============================== */

export function charDisplay(code: number): string {
  switch (code) {
    case 10:
      return "'\\n'";
    case 9:
      return "'\\t'";
    case 13:
      return "'\\r'";
    case 0:
      return "'\\0'";
    case 39:
      return "'\\''";
    case 92:
      return "'\\\\'";
    default:
      if (code >= 32 && code < 127) return `'${String.fromCharCode(code)}'`;
      return `'\\x${code.toString(16)}'`;
  }
}

/** 把字符串转义成适合单行描述的样子 */
export function escapeText(text: string, max = 60): string {
  const escaped = text
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/\r/g, '\\r');
  const chars = Array.from(escaped);
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : escaped;
}

/** 数组 / 字符串的字符序列 */
export function charsOf(value: RValue): string | null {
  if (value.t === 'string') return value.v;
  if (value.t === 'array') {
    const chars: string[] = [];
    for (const element of value.elems) {
      if (element.t !== 'int') return null;
      if (element.v === 0) break;
      chars.push(String.fromCharCode(element.v));
    }
    return chars.join('');
  }
  if (value.t === 'pointer' && value.str !== undefined) return value.str;
  return null;
}

/** 格式化值为学生可读的文本 */
export function formatValue(value: RValue, depth = 0): string {
  switch (value.t) {
    case 'int':
      if (isCharType(value.typeText)) return charDisplay(value.v);
      if (isBoolType(value.typeText)) return value.v !== 0 ? 'true' : 'false';
      return String(value.v);
    case 'float':
      return formatNumber(value.v);
    case 'string':
      return `"${escapeText(value.v, 40)}"`;
    case 'array':
      return formatArray(value, depth);
    case 'pointer':
      if (value.str !== undefined) return `-> "${escapeText(value.str, 20)}"`;
      if (value.target === null && value.array === undefined) return 'nullptr';
      return `-> ${value.label}`;
    case 'struct': {
      if (depth > 2) return `${value.typeName} { ... }`;
      const parts: string[] = [];
      for (const [name, fieldValue] of value.fields) {
        parts.push(`${name}: ${formatValue(fieldValue, depth + 1)}`);
      }
      return `${value.typeName} { ${parts.join(', ')} }`;
    }
    case 'null':
      return 'nullptr';
    case 'void':
      return 'void';
    default:
      return '?';
  }
}

function formatArray(value: ArrayValue, depth: number): string {
  if (depth > 2) return '{ ... }';
  if (isCharType(value.elemType)) {
    const text = charsOf(value);
    if (text !== null && text.length > 0 && /^[\x20-\x7e]*$/.test(text)) {
      return `"${escapeText(text, 30)}"`;
    }
  }
  if (value.dims.length > 1) {
    if (value.elems.every((element) => element.t === 'array')) {
      return `{${value.elems.map((row) => formatValue(row, depth + 1)).join(', ')}}`;
    }
    const columns = value.dims[value.dims.length - 1];
    const rows: string[] = [];
    for (let i = 0; i < value.elems.length; i += columns) {
      rows.push(`{${value.elems.slice(i, i + columns).map((v) => formatValue(v, depth + 1)).join(', ')}}`);
    }
    return `{${rows.join(', ')}}`;
  }
  return `{${value.elems.map((v) => formatValue(v, depth + 1)).join(', ')}}`;
}

/** 数组元素逐项显示（供 RuntimeVar / MemoryCell 使用） */
export function arrayElementTexts(value: ArrayValue): string[] {
  return value.elems.map((element) => formatValue(element, 1));
}

/** 根据类型文本做一次简单转换（赋值 / 参数传递时使用） */
export function coerceValue(value: RValue, typeText: string): RValue {
  if (isPointerType(typeText)) {
    if (value.t === 'array') {
      return arrayToPointer(value, 'p');
    }
    if (value.t === 'pointer' || value.t === 'null') return value;
    return value;
  }
  if (isStringType(typeText)) {
    if (value.t === 'string') return value;
    if (value.t === 'null') return stringValue('');
    const chars = charsOf(value);
    if (chars !== null) return stringValue(chars);
    return stringValue(formatValue(value));
  }
  if (isCharType(typeText)) {
    if (value.t === 'string') return intValue(value.v.charCodeAt(0), typeText);
    return intValue(asInt(value), typeText);
  }
  if (isBoolType(typeText)) {
    return boolValue(truthy(value));
  }
  if (isFloatType(typeText)) {
    return floatValue(asNumber(value), typeText);
  }
  if (value.t === 'int' || value.t === 'float' || value.t === 'null') {
    return intValue(asNumber(value), typeText || 'int');
  }
  return value;
}

/** 数组退化成指向首元素的指针 */
export function arrayToPointer(array: ArrayValue, name: string): PointerValue {
  const first: RValue = array.elems[0] ?? intValue(0, array.elemType);
  const target: Ref = {
    get: () => array.elems[0] ?? first,
    set: (value) => {
      if (array.elems.length > 0) array.elems[0] = value;
    },
    label: `${name}[0]`,
    typeText: array.elemType,
  };
  return {
    t: 'pointer',
    label: `${name}[0]`,
    target,
    elemType: array.elemType,
    typeText: `${array.elemType}*`,
    array,
    offset: 0,
  };
}

export function arrayElementRef(array: ArrayValue, index: number, label: string): Ref {
  return {
    get: () => array.elems[index] ?? intValue(0, array.elemType),
    set: (value) => {
      array.elems[index] = value;
    },
    label,
    typeText: array.elemType,
  };
}

export function countElements(dims: number[]): number {
  let count = 1;
  for (const dim of dims) count *= dim > 0 ? dim : 1;
  return count;
}
