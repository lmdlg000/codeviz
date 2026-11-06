/**
 * 内存布局计算（纯函数）
 * ------------------------------------------------------------------
 * 把 MemoryModel 排成三段式 SVG 坐标：全局 / 栈帧 / 堆，数组拆成连续格子，
 * 指针目标解析成跨区箭头。视图组件只负责绘制，便于单独校验布局。
 */
import type { DataCategory, MemoryCell, MemoryModel } from '../../engine/types';

export interface Metrics {
  compact: boolean;
  canvasW: number;
  pad: number;
  gapX: number;
  gapY: number;
  cellW: number;
  cellH: number;
  elemW: number;
  elemH: number;
  nameFont: number;
  typeFont: number;
  valueFont: number;
  smallFont: number;
  frameHeaderH: number;
}

export interface ArrayElemBox {
  index: number;
  value: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CellBox {
  cell: MemoryCell;
  x: number;
  y: number;
  w: number;
  h: number;
  isArray: boolean;
  elems: ArrayElemBox[];
  moreCount: number;
}

export interface FrameLayout {
  frame: MemoryModel['stack'][number];
  x: number;
  y: number;
  w: number;
  h: number;
  cells: CellBox[];
  bytes: number;
  emptyText?: string;
}

export interface SectionLayout {
  kind: 'global' | 'stack' | 'heap';
  title: string;
  hint: string;
  tone: string;
  x: number;
  y: number;
  w: number;
  h: number;
  bytes: number;
  cells: CellBox[];
  frames: FrameLayout[];
  emptyText: string;
}

export interface ArrowLayout {
  path: string;
  from: string;
  to: string;
}

export interface MemoryLayout {
  width: number;
  height: number;
  sections: SectionLayout[];
  arrows: ArrowLayout[];
  cellCount: number;
}

export const CATEGORY_TONE: Record<DataCategory, string> = {
  int: 'indigo',
  float: 'sky',
  double: 'sky',
  char: 'amber',
  bool: 'rose',
  void: 'slate',
  string: 'teal',
  pointer: 'violet',
  array: 'teal',
  struct: 'violet',
  class: 'violet',
  unknown: 'slate',
};

const MAX_ARRAY_SHOWN = 16;

export function memoryMetricsFor(compact: boolean): Metrics {
  return compact
    ? {
        compact: true,
        canvasW: 640,
        pad: 14,
        gapX: 8,
        gapY: 8,
        cellW: 118,
        cellH: 50,
        elemW: 30,
        elemH: 20,
        nameFont: 10,
        typeFont: 8.5,
        valueFont: 9.5,
        smallFont: 8,
        frameHeaderH: 22,
      }
    : {
        compact: false,
        canvasW: 800,
        pad: 22,
        gapX: 10,
        gapY: 10,
        cellW: 148,
        cellH: 64,
        elemW: 34,
        elemH: 24,
        nameFont: 11.5,
        typeFont: 9,
        valueFont: 10.5,
        smallFont: 9,
        frameHeaderH: 28,
      };
}

function isArrayCell(cell: MemoryCell): boolean {
  return (
    cell.category === 'array' ||
    (cell.arrayDims?.length ?? 0) > 0 ||
    (cell.arrayValues?.length ?? 0) > 0
  );
}

function createEmptyCellBox(cell: MemoryCell, m: Metrics): CellBox {
  const values = cell.arrayValues ?? [];
  if (isArrayCell(cell)) {
    const shown = values.slice(0, MAX_ARRAY_SHOWN);
    const w = Math.max(m.cellW, shown.length > 0 ? 24 + shown.length * (m.elemW + 3) : m.cellW);
    const h = shown.length > 0 ? (m.compact ? 58 : 70) : m.compact ? 44 : 54;
    return {
      cell,
      x: 0,
      y: 0,
      w,
      h,
      isArray: true,
      elems: [],
      moreCount: Math.max(0, values.length - shown.length),
    };
  }
  return { cell, x: 0, y: 0, w: m.cellW, h: m.cellH, isArray: false, elems: [], moreCount: 0 };
}

function placeArrayElems(box: CellBox, m: Metrics): void {
  const values = box.cell.arrayValues ?? [];
  const shown = values.slice(0, MAX_ARRAY_SHOWN);
  box.elems = shown.map((value, index) => ({
    index,
    value,
    x: box.x + 12 + index * (m.elemW + 3),
    y: box.y + (m.compact ? 26 : 32),
    w: m.elemW,
    h: m.elemH,
  }));
}

/** 把一组变量格横向排布并自动换行，返回所有格子与占用高度 */
function flowCells(
  cells: MemoryCell[],
  originX: number,
  originY: number,
  maxWidth: number,
  m: Metrics,
): { boxes: CellBox[]; height: number } {
  const boxes: CellBox[] = [];
  let x = originX;
  let y = originY;
  let rowHeight = 0;
  let first = true;
  for (const cell of cells) {
    const box = createEmptyCellBox(cell, m);
    if (!first && x + box.w > originX + maxWidth) {
      x = originX;
      y += rowHeight + m.gapY;
      rowHeight = 0;
    }
    box.x = x;
    box.y = y;
    if (box.isArray) placeArrayElems(box, m);
    boxes.push(box);
    x += box.w + m.gapX;
    rowHeight = Math.max(rowHeight, box.h);
    first = false;
  }
  return { boxes, height: boxes.length === 0 ? 0 : y + rowHeight - originY };
}

function sumBytes(cells: MemoryCell[]): number {
  return cells.reduce((total, cell) => total + (Number.isFinite(cell.bytes) ? cell.bytes : 0), 0);
}

export function buildMemoryLayout(memory: MemoryModel | null | undefined, compact: boolean): MemoryLayout {
  const empty: MemoryLayout = { width: 0, height: 0, sections: [], arrows: [], cellCount: 0 };
  if (!memory) return empty;
  const m = memoryMetricsFor(compact);
  const globals = memory.globals ?? [];
  const stack = memory.stack ?? [];
  const heap = memory.heap ?? [];
  const totalCells =
    globals.length + heap.length + stack.reduce((sum, frame) => sum + (frame.cells?.length ?? 0), 0);
  if (totalCells === 0) return empty;

  const contentW = m.canvasW - m.pad * 2;
  const sectionGap = compact ? 12 : 16;
  const titleH = compact ? 20 : 24;
  const sections: SectionLayout[] = [];
  let cursor = m.pad;

  // ---- 全局 / 静态区 ----
  {
    const cellsY = cursor + titleH + 8;
    const flow = flowCells(globals, m.pad + 14, cellsY, contentW - 28, m);
    const h = titleH + 8 + Math.max(flow.height, compact ? 20 : 26) + 16;
    sections.push({
      kind: 'global',
      title: '全局 / 静态区',
      hint: '程序运行期间一直存在',
      tone: 'sky',
      x: m.pad,
      y: cursor,
      w: contentW,
      h,
      bytes: sumBytes(globals),
      cells: flow.boxes,
      frames: [],
      emptyText: globals.length === 0 ? '没有全局变量' : '',
    });
    cursor += h + sectionGap;
  }

  // ---- 栈区 ----
  {
    let frameY = cursor + titleH + 8;
    const frames: FrameLayout[] = [];
    const frameX = m.pad + 10;
    const frameW = contentW - 20;
    for (const frame of stack) {
      const frameCells = frame.cells ?? [];
      const cellsY = frameY + m.frameHeaderH + 8;
      const flow = flowCells(frameCells, frameX + 12, cellsY, frameW - 24, m);
      const h = m.frameHeaderH + 8 + Math.max(flow.height, compact ? 18 : 24) + 12;
      frames.push({
        frame,
        x: frameX,
        y: frameY,
        w: frameW,
        h,
        cells: flow.boxes,
        bytes: sumBytes(frameCells),
        emptyText: frameCells.length === 0 ? '该帧没有局部变量' : undefined,
      });
      frameY += h + (compact ? 8 : 10);
    }
    const framesHeight = frameY - (cursor + titleH + 8);
    const h = titleH + 8 + Math.max(framesHeight, compact ? 22 : 28) + 16;
    sections.push({
      kind: 'stack',
      title: '栈区',
      hint: '函数调用时创建，返回后释放',
      tone: 'indigo',
      x: m.pad,
      y: cursor,
      w: contentW,
      h,
      bytes: frames.reduce((sum, frame) => sum + frame.bytes, 0),
      cells: [],
      frames,
      emptyText: stack.length === 0 ? '还没有可展示的栈帧' : '',
    });
    cursor += h + sectionGap;
  }

  // ---- 堆区 ----
  {
    const cellsY = cursor + titleH + 8;
    const flow = flowCells(heap, m.pad + 14, cellsY, contentW - 28, m);
    const h = titleH + 8 + Math.max(flow.height, compact ? 20 : 26) + 16;
    sections.push({
      kind: 'heap',
      title: '堆区',
      hint: 'new / malloc 申请，需手动释放',
      tone: 'amber',
      x: m.pad,
      y: cursor,
      w: contentW,
      h,
      bytes: sumBytes(heap),
      cells: flow.boxes,
      frames: [],
      emptyText: heap.length === 0 ? '没有发现显式的堆分配（new / malloc）' : '',
    });
    cursor += h;
  }

  // ---- 指针目标与箭头 ----
  const anchors = new Map<string, { x: number; y: number; w: number; h: number }>();
  const allBoxes: CellBox[] = [];
  for (const section of sections) {
    for (const box of section.cells) allBoxes.push(box);
    for (const frame of section.frames) {
      for (const box of frame.cells) allBoxes.push(box);
    }
  }
  for (const box of allBoxes) {
    const name = (box.cell.name ?? '').trim();
    if (!name) continue;
    if (!anchors.has(name)) anchors.set(name, box);
    for (const elem of box.elems) {
      const key = `${name}[${elem.index}]`;
      if (!anchors.has(key)) anchors.set(key, elem);
    }
  }

  const arrows: ArrowLayout[] = [];
  for (const box of allBoxes) {
    const target = (box.cell.pointerTarget ?? '').trim();
    if (!target) continue;
    let anchor = anchors.get(target);
    if (!anchor) {
      const base = target.replace(/\[[^\]]*\]/g, '').split('.')[0]?.trim();
      if (base) anchor = anchors.get(base);
    }
    if (!anchor || anchor === box) continue;
    const sx = box.x + box.w / 2;
    const sy = box.y + box.h;
    const tx = anchor.x + anchor.w / 2;
    const ty = anchor.y - 3;
    const bend = Math.max(22, Math.abs(tx - sx) * 0.35);
    const direction = tx >= sx ? 1 : -1;
    const path = `M ${sx} ${sy} C ${sx + bend * direction} ${sy + 26}, ${tx + bend * direction} ${
      ty - 26
    }, ${tx} ${ty}`;
    arrows.push({ path, from: box.cell.name, to: target });
  }

  return {
    width: m.canvasW,
    height: cursor + m.pad,
    sections,
    arrows,
    cellCount: totalCells,
  };
}
