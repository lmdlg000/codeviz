/**
 * 类图布局与成员签名格式化（纯函数）
 * ------------------------------------------------------------------
 * 按继承关系分层：基类在上、派生类在下（环处停止上溯）。
 * 视图只负责 UML 盒子绘制与交互，布局计算集中在这里便于校验。
 */
import type { ClassInfo, ClassMemberInfo, MethodInfo, ParameterInfo } from '../../engine/types';
import { clamp, measureText, roundedOrthoPath, type Point } from './svgUtils';

export interface Metrics {
  compact: boolean;
  boxW: number;
  headerH: number;
  baseRowH: number;
  fieldRowH: number;
  methodRowH: number;
  padX: number;
  padTop: number;
  padBottom: number;
  layerGapY: number;
  colGap: number;
  nameFont: number;
  memberFont: number;
  tagFont: number;
}

export interface MemberRow<T> {
  item: T;
  /** 相对盒子顶部的行顶部 y */
  rowTop: number;
  rowH: number;
}

export interface LocalBox {
  cls: ClassInfo;
  w: number;
  headerH: number;
  h: number;
  fieldsTop: number;
  fieldsAreaH: number;
  methodsTop: number;
  methodsAreaH: number;
  fieldRows: MemberRow<ClassMemberInfo>[];
  methodRows: MemberRow<MethodInfo>[];
  hasBases: boolean;
}

export interface PlacedBox extends LocalBox {
  x: number;
  y: number;
}

export interface ClassLayout {
  boxes: PlacedBox[];
  edges: { path: string; from: string; to: string }[];
  width: number;
  height: number;
}

export function classMetricsFor(compact: boolean): Metrics {
  return compact
    ? {
        compact: true,
        boxW: 236,
        headerH: 42,
        baseRowH: 13,
        fieldRowH: 19,
        methodRowH: 21,
        padX: 18,
        padTop: 18,
        padBottom: 24,
        layerGapY: 58,
        colGap: 26,
        nameFont: 13.5,
        memberFont: 9.5,
        tagFont: 8.5,
      }
    : {
        compact: false,
        boxW: 278,
        headerH: 48,
        baseRowH: 15,
        fieldRowH: 22,
        methodRowH: 24,
        padX: 26,
        padTop: 26,
        padBottom: 30,
        layerGapY: 76,
        colGap: 40,
        nameFont: 15,
        memberFont: 10.5,
        tagFont: 9,
      };
}

export function shortName(name: string): string {
  const clean = (name || '').replace(/<[^>]*>/g, '').trim();
  const parts = clean.split('::');
  return parts[parts.length - 1]?.trim() || clean;
}

export function formatParam(param: ParameterInfo): string {
  const rawType = (param.typeText || '').trim() || 'int';
  let type = rawType;
  if (param.isPointer && !/[*&]$/.test(type)) type += '*';
  if (param.isReference && !/&$/.test(type)) type += '&';
  const name = (param.name || '').trim();
  if (!name) return type;
  const glue = /[*&]$/.test(type) ? '' : ' ';
  return `${type}${glue}${name}`;
}

/** 清洗引擎可能混入的修饰符，returnType 只保留真正的返回类型 */
export function cleanReturnType(typeText: string | undefined): string {
  let text = (typeText || '').trim();
  const noise = /^(?:virtual|static|inline|explicit|constexpr|friend)\b\s*/i;
  let guard = 0;
  while (noise.test(text) && guard < 8) {
    text = text.replace(noise, '').trim();
    guard += 1;
  }
  text = text.replace(/\s*=\s*0\s*$/, '').trim();
  text = text.replace(/\s+(?:override|final)\s*$/i, '').trim();
  return text || 'void';
}

export function methodSignature(method: MethodInfo): string {
  const params = (method.params ?? []).map(formatParam).join(', ');
  const isCtor = method.kind === 'constructor' || method.kind === 'destructor';
  const constPart = method.isConst ? ' const' : '';
  const pure = method.isPureVirtual ? ' = 0' : '';
  if (isCtor) return `${method.name}(${params})${pure}`;
  const returnType = cleanReturnType(method.returnType);
  return `${method.name}(${params})${constPart}: ${returnType}${pure}`;
}

export function fieldSignature(field: ClassMemberInfo): string {
  const suffix = `${field.isStatic ? ' static' : ''}${field.isConst ? ' const' : ''}`;
  return `${field.name}: ${field.typeText || 'auto'}${suffix}`;
}

/** 按成员签名自适应盒子宽度：长签名加宽，上限 360 / compact 300 */
function boxWidthFor(cls: ClassInfo, m: Metrics): number {
  const minWidth = m.compact ? 236 : 278;
  const maxWidth = m.compact ? 300 : 360;
  const virtualRoom = (cls.methods ?? []).some((method) => method.isVirtual || method.isPureVirtual)
    ? m.compact
      ? 34
      : 42
    : 0;
  const nameWidth = measureText(cls.name, m.nameFont) + 62;
  const baseWidth = (cls.bases ?? []).length
    ? measureText(`: ${(cls.bases ?? []).join(', ')}`, m.tagFont) + 28
    : 0;
  let width = Math.max(nameWidth, baseWidth);
  for (const field of cls.fields ?? []) {
    width = Math.max(width, measureText(fieldSignature(field), m.memberFont) + 30 + 14);
  }
  for (const method of cls.methods ?? []) {
    width = Math.max(
      width,
      measureText(methodSignature(method), m.memberFont) + 30 + 14 + virtualRoom,
    );
  }
  return clamp(Math.ceil(width), minWidth, maxWidth);
}

function buildLocalBox(cls: ClassInfo, m: Metrics): LocalBox {
  const hasBases = (cls.bases ?? []).length > 0;
  const headerH = m.headerH + (hasBases ? m.baseRowH : 0);
  const fields = cls.fields ?? [];
  const methods = cls.methods ?? [];
  const fieldsTop = headerH + 9;
  const fieldsAreaH = Math.max(1, fields.length) * m.fieldRowH;
  const methodsTop = fieldsTop + fieldsAreaH + 9;
  const methodsAreaH = Math.max(1, methods.length) * m.methodRowH;
  const h = methodsTop + methodsAreaH + 11;
  return {
    cls,
    w: boxWidthFor(cls, m),
    headerH,
    h,
    fieldsTop,
    fieldsAreaH,
    methodsTop,
    methodsAreaH,
    hasBases,
    fieldRows: fields.map((item, index) => ({
      item,
      rowTop: fieldsTop + index * m.fieldRowH,
      rowH: m.fieldRowH,
    })),
    methodRows: methods.map((item, index) => ({
      item,
      rowTop: methodsTop + index * m.methodRowH,
      rowH: m.methodRowH,
    })),
  };
}

export function buildClassLayout(classes: ClassInfo[], compact: boolean): ClassLayout {
  const m = classMetricsFor(compact);
  const valid = (classes ?? []).filter((cls) => cls && cls.name);
  if (valid.length === 0) return { boxes: [], edges: [], width: 0, height: 0 };

  const byName = new Map<string, ClassInfo>();
  const byShort = new Map<string, ClassInfo>();
  for (const cls of valid) {
    byName.set(cls.name, cls);
    const short = shortName(cls.name);
    if (!byShort.has(short)) byShort.set(short, cls);
  }
  const resolveBase = (base: string): ClassInfo | undefined => {
    const name = (base ?? '').trim();
    return byName.get(name) ?? byShort.get(shortName(name));
  };

  const layerCache = new Map<string, number>();
  const visiting = new Set<string>();
  const layerOf = (cls: ClassInfo): number => {
    const cached = layerCache.get(cls.name);
    if (cached !== undefined) return cached;
    if (visiting.has(cls.name)) return 0;
    visiting.add(cls.name);
    let layer = 0;
    for (const base of cls.bases ?? []) {
      const baseCls = resolveBase(base);
      if (baseCls) layer = Math.max(layer, layerOf(baseCls) + 1);
    }
    visiting.delete(cls.name);
    layerCache.set(cls.name, layer);
    return layer;
  };

  const layers = new Map<number, LocalBox[]>();
  for (const cls of valid) {
    const depth = layerOf(cls);
    const box = buildLocalBox(cls, m);
    const list = layers.get(depth);
    if (list) list.push(box);
    else layers.set(depth, [box]);
  }
  const layerKeys = Array.from(layers.keys()).sort((a, b) => a - b);
  for (const key of layerKeys) {
    layers.get(key)?.sort((a, b) => a.cls.line - b.cls.line || a.cls.name.localeCompare(b.cls.name));
  }

  const layerHeights = new Map<number, number>();
  const layerWidths = new Map<number, number>();
  for (const key of layerKeys) {
    const boxes = layers.get(key) ?? [];
    layerHeights.set(key, Math.max(...boxes.map((box) => box.h), 0));
    layerWidths.set(
      key,
      boxes.reduce((sum, box) => sum + box.w, 0) + Math.max(0, boxes.length - 1) * m.colGap,
    );
  }
  const contentWidth = Math.max(...layerKeys.map((key) => layerWidths.get(key) ?? 0), m.boxW);
  const width = contentWidth + m.padX * 2;

  const placed: PlacedBox[] = [];
  const placedByName = new Map<string, PlacedBox>();
  let cursorY = m.padTop;
  for (const key of layerKeys) {
    const boxes = layers.get(key) ?? [];
    const rowWidth = layerWidths.get(key) ?? 0;
    let cursorX = m.padX + (contentWidth - rowWidth) / 2;
    const rowHeight = layerHeights.get(key) ?? 0;
    for (const local of boxes) {
      const box: PlacedBox = {
        ...local,
        x: cursorX,
        y: cursorY + (rowHeight - local.h) / 2,
      };
      placed.push(box);
      placedByName.set(box.cls.name, box);
      cursorX += local.w + m.colGap;
    }
    cursorY += rowHeight + m.layerGapY;
  }
  const height = cursorY - m.layerGapY + m.padBottom;

  const edges: { path: string; from: string; to: string }[] = [];
  for (const box of placed) {
    for (const baseName of box.cls.bases ?? []) {
      const baseCls = resolveBase(baseName);
      if (!baseCls) continue;
      const base = placedByName.get(baseCls.name);
      if (!base) continue;
      const fromX = box.x + box.w / 2;
      const fromY = box.y;
      const toX = base.x + base.w / 2;
      const toY = base.y + base.h;
      const midY = fromY - m.layerGapY * 0.5;
      const points: Point[] =
        Math.abs(fromX - toX) < 1
          ? [
              { x: fromX, y: fromY },
              { x: toX, y: toY },
            ]
          : [
              { x: fromX, y: fromY },
              { x: fromX, y: midY },
              { x: toX, y: midY },
              { x: toX, y: toY },
            ];
      edges.push({ path: roundedOrthoPath(points, 10), from: box.cls.name, to: baseCls.name });
    }
  }

  return { boxes: placed, edges, width, height };
}
