/**
 * SVG 布局辅助：文本测量/折行、正交圆角路径
 * ------------------------------------------------------------------
 * 不依赖 canvas 与字体加载：用「全角 1em / 半角 0.56em」的近似宽度估算，
 * 对中文与等宽字体都很稳定，宁可略宽也不让文字溢出节点。
 */

export interface Point {
  x: number;
  y: number;
}

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const WIDE_CHAR =
  /[\u1100-\u115f\u2e80-\u303e\u3041-\u33ff\u3400-\u4dbf\u4e00-\u9fff\ua000-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/;

export function isWideChar(ch: string): boolean {
  return WIDE_CHAR.test(ch);
}

/** 单个字符相对字号的宽度系数 */
export function charWidthFactor(ch: string): number {
  if (ch === ' ') return 0.32;
  if (ch === '\t') return 1.6;
  if (isWideChar(ch)) return 1;
  if (/[A-Z0-9]/.test(ch)) return 0.62;
  if (/[il.,:;'!|]/.test(ch)) return 0.3;
  if (/[mwMW@#%&]/.test(ch)) return 0.86;
  return 0.56;
}

export function measureText(text: string, fontSize: number): number {
  let width = 0;
  for (const ch of text) width += charWidthFactor(ch) * fontSize;
  return width;
}

export function ellipsize(text: string, maxWidth: number, fontSize: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (measureText(clean, fontSize) <= maxWidth) return clean;
  const dots = measureText('…', fontSize);
  let out = '';
  let width = 0;
  for (const ch of clean) {
    const next = charWidthFactor(ch) * fontSize;
    if (width + next + dots > maxWidth) break;
    out += ch;
    width += next;
  }
  return `${out.trimEnd()}…`;
}

export function truncateText(text: string, maxWidth: number, fontSize: number): string {
  return ellipsize(text, maxWidth, fontSize);
}

/**
 * 把标签折成最多 maxLines 行；优先在空格处断行，中文按字断行。
 * 超出部分在最后一行以省略号收尾。
 */
export function wrapLabel(text: string, maxWidth: number, fontSize: number, maxLines = 2): string[] {
  const width = Math.max(8, maxWidth);
  let rest = text.replace(/\s+/g, ' ').trim();
  if (rest.length === 0) return [''];
  const lines: string[] = [];
  while (rest.length > 0 && lines.length < maxLines) {
    let line = '';
    let lineWidth = 0;
    let index = 0;
    while (index < rest.length) {
      const ch = rest[index];
      const cw = charWidthFactor(ch) * fontSize;
      if (line.length > 0 && lineWidth + cw > width) break;
      line += ch;
      lineWidth += cw;
      index += 1;
    }
    if (index >= rest.length) {
      lines.push(line.trim());
      rest = '';
      break;
    }
    let cut = line.length;
    const spaceAt = line.lastIndexOf(' ');
    if (spaceAt > 0 && spaceAt >= line.length * 0.35) cut = spaceAt;
    lines.push(line.slice(0, cut).trimEnd());
    rest = (line.slice(cut) + rest.slice(index)).trimStart();
  }
  if (rest.length > 0 && lines.length >= maxLines) {
    let last = lines[maxLines - 1];
    while (last.length > 0 && measureText(`${last}…`, fontSize) > width) {
      last = last.slice(0, -1);
    }
    lines[maxLines - 1] = `${last.trimEnd()}…`;
  }
  return lines.length > 0 ? lines : [''];
}

const fmt = (value: number): string => `${Math.round(value * 10) / 10}`;

/**
 * 生成带圆角的正交折线路径（自动去重、共线段合并）。
 * 输入点按顺序连接，直角处用二次贝塞尔倒角。
 */
export function roundedOrthoPath(points: Point[], radius = 8): string {
  const pts: Point[] = [];
  for (const p of points) {
    const last = pts[pts.length - 1];
    if (!last || Math.abs(last.x - p.x) > 0.01 || Math.abs(last.y - p.y) > 0.01) {
      pts.push(p);
    }
  }
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${fmt(pts[0].x)} ${fmt(pts[0].y)}`;
  let d = `M ${fmt(pts[0].x)} ${fmt(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i += 1) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const next = pts[i + 1];
    const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const outLen = Math.hypot(next.x - cur.x, next.y - cur.y);
    if (inLen < 0.01 || outLen < 0.01) {
      d += ` L ${fmt(cur.x)} ${fmt(cur.y)}`;
      continue;
    }
    const cross = (cur.x - prev.x) * (next.y - cur.y) - (cur.y - prev.y) * (next.x - cur.x);
    if (Math.abs(cross) < 0.01) {
      d += ` L ${fmt(cur.x)} ${fmt(cur.y)}`;
      continue;
    }
    const rr = Math.min(radius, inLen / 2, outLen / 2);
    const a = {
      x: cur.x - ((cur.x - prev.x) / inLen) * rr,
      y: cur.y - ((cur.y - prev.y) / inLen) * rr,
    };
    const b = {
      x: cur.x + ((next.x - cur.x) / outLen) * rr,
      y: cur.y + ((next.y - cur.y) / outLen) * rr,
    };
    d += ` L ${fmt(a.x)} ${fmt(a.y)} Q ${fmt(cur.x)} ${fmt(cur.y)} ${fmt(b.x)} ${fmt(b.y)}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${fmt(last.x)} ${fmt(last.y)}`;
  return d;
}

/** 顺时针生成菱形顶点（用于节点与命中区） */
export function diamondPoints(x: number, y: number, w: number, h: number): string {
  return `${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`;
}

/** 生成平行四边形顶点（输入/输出） */
export function parallelogramPoints(x: number, y: number, w: number, h: number, slant: number): string {
  return `${x + slant},${y} ${x + w},${y} ${x + w - slant},${y + h} ${x},${y + h}`;
}

/** 文本块在竖直方向的第一行基线（配合 text-anchor=middle 使用） */
export function textLinesStartY(centerY: number, lineCount: number, fontSize: number, lineHeight = 1.32): number {
  const lh = fontSize * lineHeight;
  return centerY - ((lineCount - 1) * lh) / 2 + fontSize * 0.34;
}

export function textLineHeight(fontSize: number, lineHeight = 1.32): number {
  return fontSize * lineHeight;
}
