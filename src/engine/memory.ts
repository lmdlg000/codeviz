/**
 * 内存布局模型（静态估算）
 * ------------------------------------------------------------------
 * - 全局变量 → globals（数据区）
 * - 每个函数 → 一个栈帧（参数 + 局部变量）
 * - new / malloc 的静态可识别分配 → heap
 * 所有地址与字节数都是教学示意，不是真实运行地址。
 */
import type { MemoryCell, MemoryModel, StackFrameModel } from './types';
import type { AnalysisModel } from './model';
import type { ExprNode } from './ast';
import { collectExprs } from './ast';
import { exprToText, formatNumber, scalarSize, truncateText, typeCategory } from './utils';

function lastSegment(name: string): string {
  const index = name.lastIndexOf('::');
  return index >= 0 ? name.slice(index + 2) : name;
}

function countDims(dims: number[]): number {
  let count = 1;
  for (const dim of dims) count *= dim > 0 ? dim : 1;
  return count;
}

function typeSizeOf(model: AnalysisModel, base: string, pointerDepth: number, dims: number[]): number {
  if (pointerDepth > 0) return 8 * countDims(dims);
  const structBytes = model.typeSizes.get(lastSegment(base));
  const element = structBytes ?? scalarSize(base, 0);
  return element * countDims(dims);
}

/** 字面量初始化值的展示文本（无法静态确定时返回 null） */
function literalValue(expr: ExprNode | undefined): string | null {
  if (!expr) return null;
  switch (expr.kind) {
    case 'number':
      return expr.raw;
    case 'string':
      return `"${truncateText(expr.value, 16)}"`;
    case 'char':
      return expr.raw;
    case 'bool':
      return expr.value ? 'true' : 'false';
    case 'null':
      return 'nullptr';
    case 'unary': {
      if (expr.op === '-' && expr.operand.kind === 'number') return `-${expr.operand.raw}`;
      if (expr.op === '+' && expr.operand.kind === 'number') return expr.operand.raw;
      return null;
    }
    case 'ident':
      return expr.name;
    default:
      return null;
  }
}

/** 从初始化表达式提取数组元素值 */
function arrayValuesFromInit(init: ExprNode | undefined, dims: number[]): string[] | null {
  if (!init) return null;
  if (init.kind === 'string') {
    const chars = Array.from(init.value).map((ch) => `'${ch}'`);
    const total = countDims(dims);
    if (total > chars.length) chars.push('\\0');
    return chars;
  }
  const flatten = (expr: ExprNode, out: string[], depth: number): void => {
    if (expr.kind !== 'initlist') {
      const value = literalValue(expr);
      if (value !== null) out.push(value);
      return;
    }
    if (depth >= dims.length && dims.length > 0) {
      for (const item of expr.items) {
        const value = literalValue(item);
        if (value !== null) out.push(value);
      }
      return;
    }
    for (const item of expr.items) flatten(item, out, depth + 1);
  };
  if (init.kind !== 'initlist') return null;
  const values: string[] = [];
  flatten(init, values, 0);
  return values.length > 0 ? values : null;
}

/** 指针初始化目标 */
function pointerTargetOf(init: ExprNode | undefined): string | undefined {
  if (!init) return undefined;
  if (init.kind === 'unary' && init.op === '&') return exprToText(init.operand);
  if (init.kind === 'ident') return init.name;
  if (init.kind === 'string') return '(字符串常量)';
  if (init.kind === 'null') return '空指针';
  if (init.kind === 'number' && init.value === 0) return '空指针';
  if (init.kind === 'new') return '(堆区)';
  if (init.kind === 'call' && (init.name === 'malloc' || init.name === 'calloc')) return '(堆区)';
  if (init.kind === 'cast') return pointerTargetOf(init.expr);
  return undefined;
}

function cellFromVariable(
  model: AnalysisModel,
  variableId: string,
  name: string,
  typeText: string,
  category: MemoryCell['category'],
  sizeBytes: number,
  line: number,
  isArray: boolean,
  isPointer: boolean,
  dims: number[] | undefined,
  init: ExprNode | undefined,
): MemoryCell {
  const cell: MemoryCell = {
    id: `cell_${variableId}`,
    name,
    typeText,
    category,
    bytes: sizeBytes,
    line,
  };
  if (isArray) {
    if (dims && dims.length > 0) cell.arrayDims = dims;
    const values = arrayValuesFromInit(init, dims ?? []);
    if (values) cell.arrayValues = values;
  } else {
    const value = literalValue(init);
    if (value !== null) cell.value = value;
    if (isPointer) {
      const target = pointerTargetOf(init);
      if (target) cell.pointerTarget = target;
    }
  }
  void model;
  return cell;
}

/** 常量表达式求值：用于 malloc(sizeof(int) * 10) 这类静态大小 */
function evalConstSize(model: AnalysisModel, expr: ExprNode | undefined): number {
  if (!expr) return 0;
  switch (expr.kind) {
    case 'number':
      return Math.max(0, Math.floor(expr.value));
    case 'sizeof': {
      const typeText = expr.typeText ?? '';
      const base = typeText.replace(/<.*$/, '').split('::').pop() ?? typeText;
      return typeSizeOf(model, base, 0, []);
    }
    case 'unary':
      return expr.op === '-' ? -evalConstSize(model, expr.operand) : evalConstSize(model, expr.operand);
    case 'binary': {
      const left = evalConstSize(model, expr.left);
      const right = evalConstSize(model, expr.right);
      switch (expr.op) {
        case '+':
          return left + right;
        case '-':
          return left - right;
        case '*':
          return left * right;
        case '/':
          return right === 0 ? 0 : Math.floor(left / right);
        default:
          return 0;
      }
    }
    default:
      return 0;
  }
}

function collectHeap(model: AnalysisModel): MemoryCell[] {
  const cells: MemoryCell[] = [];
  let index = 0;
  const add = (cell: Omit<MemoryCell, 'id' | 'name'>): void => {
    index++;
    cells.push({ ...cell, id: `heap_${index}`, name: `堆块 #${index}` });
  };

  for (const record of model.records) {
    if (!record.hasBody) continue;
    for (const expr of collectExprs(record.node.body)) {
      if (expr.kind === 'new') {
        const base = expr.typeText.replace(/<.*$/, '').split('::').pop() ?? expr.typeText;
        const dims = expr.arraySize && expr.arraySize.kind === 'number' ? [expr.arraySize.value] : [];
        add({
          typeText: `${expr.typeText}${expr.arraySize ? '[]' : ''}`,
          category: typeCategory(base, { isArray: expr.arraySize !== undefined }),
          bytes: typeSizeOf(model, base, 0, dims),
          line: expr.line,
          value: 'new 分配',
          arrayDims: expr.arraySize ? dims : undefined,
          pointerTarget: undefined,
        });
      } else if (expr.kind === 'call' && (expr.name === 'malloc' || expr.name === 'calloc')) {
        const bytes = expr.name === 'calloc'
          ? evalConstSize(model, expr.args[0]) * evalConstSize(model, expr.args[1])
          : evalConstSize(model, expr.args[0]);
        if (bytes > 0) {
          add({
            typeText: `malloc(${truncateText(exprToText(expr.args[0]), 24)})`,
            category: 'pointer',
            bytes,
            line: expr.line,
            value: 'malloc 分配',
          });
        }
      }
    }
  }
  return cells;
}

/** 构建内存布局模型 */
export function buildMemoryModel(model: AnalysisModel): MemoryModel {
  const globals: MemoryCell[] = model.globals.map((variable) =>
    cellFromVariable(
      model,
      variable.id,
      variable.name,
      variable.typeText,
      variable.category,
      variable.sizeBytes,
      variable.line,
      variable.isArray,
      variable.isPointer,
      variable.arrayDims,
      model.varInits.get(variable.id),
    ),
  );

  const stack: StackFrameModel[] = [];
  for (const record of model.records) {
    if (!record.hasBody) continue;
    const cells: MemoryCell[] = [];
    for (const param of record.params) {
      if (!param.name || param.name === '...') continue;
      const base = param.typeText.replace(/<.*$/, '').split('::').pop() ?? param.typeText;
      const bytes = param.isPointer || param.category === 'array'
        ? 8
        : typeSizeOf(model, base, 0, []);
      cells.push({
        id: `cell_${record.id}_param_${param.name}`,
        name: param.name,
        typeText: param.typeText,
        category: param.category,
        bytes,
        line: param.line,
        pointerTarget: undefined,
      });
    }
    for (const local of record.locals) {
      cells.push(
        cellFromVariable(
          model,
          local.id,
          local.name,
          local.typeText,
          local.category,
          local.sizeBytes,
          local.line,
          local.isArray,
          local.isPointer,
          local.arrayDims,
          model.varInits.get(local.id),
        ),
      );
    }
    stack.push({
      functionId: record.id,
      functionName: record.displayName,
      line: record.node.line,
      cells,
    });
  }

  const heap = collectHeap(model);

  let totalBytes = 0;
  for (const cell of globals) totalBytes += cell.bytes;
  for (const frame of stack) for (const cell of frame.cells) totalBytes += cell.bytes;
  for (const cell of heap) totalBytes += cell.bytes;

  const notes: string[] = [
    '地址与布局为教学示意，不是程序真实运行时的地址。',
    '字节数按 64 位常见模型估算：char / bool = 1、short = 2、int / float = 4、long long / double / 指针 = 8。',
  ];
  if (heap.length > 0) {
    notes.push('堆区只展示静态可识别的 new / malloc 分配，运行时动态大小可能不同。');
  }
  if (stack.length === 0) {
    notes.push('这段代码还没有函数栈帧。');
  }

  return { globals, stack, heap, notes, totalBytes };
}

/** 供其它模块使用：把数值格式化成短文本 */
export function formatCellValue(value: number): string {
  return formatNumber(value);
}
