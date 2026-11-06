/**
 * 结构化流程图布局
 * ------------------------------------------------------------------
 * 把引擎给出的 FlowchartNode 树排成「上→下」的流程图：
 * - 每个布局单元都从顶部中心进入、底部中心离开，因此顺序连接永远是一条竖线；
 * - if/else：判断菱形在顶部，是分支在左、否分支在右，靠分支标签说明，最后汇合；
 * - while/for/do：循环头在上，循环体在下，右侧用 teal 虚线回边并标「重复」；
 * - switch：按契约「cases 依次渲染」，每个 case 用小标签 + 自身 body 纵向排列；
 * - 所有坐标先以单元左上角为原点计算，最后统一平移到画布内边距中。
 * 该模块是纯函数，不接触 DOM，便于单独推理与测试。
 */
import type { FlowchartData, FlowchartNode, FlowNodeKind } from '../../engine/types';
import type { Point } from './svgUtils';
import { clamp, measureText, textLineHeight, wrapLabel } from './svgUtils';

export type FlowShape =
  | 'start'
  | 'end'
  | 'process'
  | 'decision'
  | 'loop'
  | 'io'
  | 'call'
  | 'switch'
  | 'terminal'
  | 'case';

export interface FlowNodeLayout {
  id: string;
  kind: FlowNodeKind;
  shape: FlowShape;
  line: number;
  lines: number[];
  label: string;
  textLines: string[];
  textMono: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
  lineFontSize: number;
  code?: string;
  condition?: string;
  loopKind?: 'while' | 'for' | 'do';
  testAfter?: boolean;
}

export interface FlowEdgeLabel {
  text: string;
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
  tone: 'teal' | 'amber';
}

export interface FlowEdgeLayout {
  points: Point[];
  tone: 'muted' | 'teal' | 'amber';
  dashed?: boolean;
  /** 默认 true；汇合线不画箭头，避免多个箭头重叠 */
  arrow?: boolean;
  label?: FlowEdgeLabel;
}

export interface FlowLayout {
  nodes: FlowNodeLayout[];
  edges: FlowEdgeLayout[];
  width: number;
  height: number;
}

interface Metrics {
  compact: boolean;
  labelFont: number;
  monoFont: number;
  smallFont: number;
  lineFontSize: number;
  vGap: number;
  hGap: number;
  decisionW: number;
  decisionH: number;
  decisionTextW: number;
  loopTextW: number;
  padX: number;
  padY: number;
}

interface Region {
  w: number;
  h: number;
  nodes: FlowNodeLayout[];
  edges: FlowEdgeLayout[];
}

const MAX_DEPTH = 64;

const KIND_FALLBACK: Record<FlowNodeKind, string> = {
  start: '开始',
  end: '结束',
  process: '处理',
  decision: '判断',
  loop: '循环',
  return: 'return',
  break: 'break',
  continue: 'continue',
  call: '调用',
  input: '输入',
  output: '输出',
  switch: 'switch',
  block: '语句',
};

export function flowMetrics(compact: boolean): Metrics {
  return compact
    ? {
        compact: true,
        labelFont: 11.5,
        monoFont: 11,
        smallFont: 9.5,
        lineFontSize: 9,
        vGap: 28,
        hGap: 28,
        decisionW: 180,
        decisionH: 88,
        decisionTextW: 94,
        loopTextW: 128,
        padX: 20,
        padY: 22,
      }
    : {
        compact: false,
        labelFont: 12.5,
        monoFont: 12,
        smallFont: 10,
        lineFontSize: 10,
        vGap: 40,
        hGap: 44,
        decisionW: 204,
        decisionH: 98,
        decisionTextW: 112,
        loopTextW: 150,
        padX: 30,
        padY: 30,
      };
}

function emptyRegion(): Region {
  return { w: 0, h: 0, nodes: [], edges: [] };
}

function isEmptyRegion(region: Region): boolean {
  return region.nodes.length === 0;
}

function translateRegion(region: Region, dx: number, dy: number): Region {
  if (isEmptyRegion(region)) return emptyRegion();
  return {
    w: region.w,
    h: region.h,
    nodes: region.nodes.map((node) => ({ ...node, x: node.x + dx, y: node.y + dy })),
    edges: region.edges.map((edge) => ({
      ...edge,
      points: edge.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
      label: edge.label ? { ...edge.label, x: edge.label.x + dx, y: edge.label.y + dy } : undefined,
    })),
  };
}

function nodeLines(node: FlowchartNode): number[] {
  if (node.lines && node.lines.length > 0) return node.lines.filter((n) => n > 0);
  return node.line > 0 ? [node.line] : [];
}

function makeNode(
  node: FlowchartNode,
  shape: FlowShape,
  w: number,
  h: number,
  textLines: string[],
  fontSize: number,
  mono: boolean,
  m: Metrics,
): FlowNodeLayout {
  return {
    id: `${node.id}-${shape}`,
    kind: node.kind,
    shape,
    line: node.line,
    lines: nodeLines(node),
    label: node.label,
    textLines,
    textMono: mono,
    x: 0,
    y: 0,
    w,
    h,
    fontSize,
    lineFontSize: m.lineFontSize,
    code: node.code,
    condition: node.condition,
    loopKind: node.loopKind,
    testAfter: node.testAfter,
  };
}

function leafSpec(node: FlowchartNode, m: Metrics): FlowNodeLayout {
  const label = (node.label || '').trim() || KIND_FALLBACK[node.kind] || '语句';
  const condition = (node.condition || '').trim();
  const font = m.labelFont;
  const mono = m.monoFont;

  switch (node.kind) {
    case 'decision': {
      const text = condition || label;
      const lines = wrapLabel(text, m.decisionTextW, mono, 2);
      return makeNode(node, 'decision', m.decisionW, m.decisionH, lines, mono, true, m);
    }
    case 'loop': {
      const text = condition || label;
      const lines = wrapLabel(text, m.loopTextW, mono, 2);
      const textWidth = Math.max(...lines.map((line) => measureText(line, mono)));
      const w = clamp(textWidth + (m.compact ? 66 : 78), m.compact ? 178 : 196, m.compact ? 250 : 286);
      return makeNode(node, 'loop', w, m.compact ? 50 : 56, lines, mono, true, m);
    }
    case 'switch': {
      const lines = wrapLabel(label, m.compact ? 138 : 158, font, 2);
      const textWidth = Math.max(...lines.map((line) => measureText(line, font)));
      const w = clamp(textWidth + 52, m.compact ? 176 : 190, m.compact ? 236 : 260);
      return makeNode(node, 'switch', w, m.compact ? 46 : 52, lines, font, false, m);
    }
    case 'input':
    case 'output': {
      const lines = wrapLabel(label, m.compact ? 132 : 152, font, 2);
      const textWidth = Math.max(...lines.map((line) => measureText(line, font)));
      const w = clamp(textWidth + 62, m.compact ? 148 : 164, m.compact ? 228 : 252);
      return makeNode(node, 'io', w, m.compact ? 44 : 50, lines, font, false, m);
    }
    case 'call': {
      const lines = wrapLabel(label, m.compact ? 130 : 150, font, 2);
      const textWidth = Math.max(...lines.map((line) => measureText(line, font)));
      const w = clamp(textWidth + 60, m.compact ? 156 : 172, m.compact ? 230 : 256);
      return makeNode(node, 'call', w, m.compact ? 44 : 50, lines, font, false, m);
    }
    case 'return':
    case 'break':
    case 'continue': {
      const text = wrapLabel(label, m.compact ? 108 : 124, mono, 1)[0] || KIND_FALLBACK[node.kind];
      const w = clamp(measureText(text, mono) + 32, m.compact ? 92 : 104, m.compact ? 168 : 190);
      return makeNode(node, 'terminal', w, m.compact ? 30 : 34, [text], mono, true, m);
    }
    case 'start':
    case 'end': {
      const lines = wrapLabel(label, m.compact ? 104 : 120, font, 1);
      const text = lines[0] || KIND_FALLBACK[node.kind];
      const w = clamp(measureText(text, font) + 40, m.compact ? 74 : 84, m.compact ? 152 : 170);
      return makeNode(node, node.kind === 'start' ? 'start' : 'end', w, m.compact ? 30 : 34, [text], font, false, m);
    }
    case 'block':
    case 'process':
    default: {
      const lines = wrapLabel(label, m.compact ? 146 : 170, font, 2);
      const textWidth = Math.max(...lines.map((line) => measureText(line, font)));
      const w = clamp(textWidth + 36, m.compact ? 126 : 142, m.compact ? 212 : 246);
      const h = lines.length > 1 ? (m.compact ? 50 : 58) : m.compact ? 40 : 46;
      return makeNode(node, 'process', w, h, lines, font, false, m);
    }
  }
}

function layoutLeaf(node: FlowchartNode, m: Metrics): Region {
  const spec = leafSpec(node, m);
  return { w: spec.w, h: spec.h, nodes: [{ ...spec, x: 0, y: 0 }], edges: [] };
}

function layoutSequence(children: FlowchartNode[], m: Metrics, depth: number): Region {
  const parts: Region[] = [];
  for (const child of children) {
    const part = layoutNode(child, m, depth + 1);
    if (!isEmptyRegion(part)) parts.push(part);
  }
  if (parts.length === 0) return emptyRegion();
  const width = Math.max(...parts.map((part) => part.w));
  const nodes: FlowNodeLayout[] = [];
  const edges: FlowEdgeLayout[] = [];
  let cursor = 0;
  let prevOut: Point | null = null;

  parts.forEach((part, index) => {
    if (index > 0) cursor += m.vGap;
    const dx = (width - part.w) / 2;
    const placed = translateRegion(part, dx, cursor);
    nodes.push(...placed.nodes);
    edges.push(...placed.edges);
    const inPoint: Point = { x: width / 2, y: cursor };
    if (prevOut) {
      if (inPoint.y - prevOut.y > 0.5) {
        edges.push({ points: [prevOut, inPoint], tone: 'muted' });
      }
    }
    prevOut = { x: width / 2, y: cursor + part.h };
    cursor += part.h;
  });

  return { w: width, h: cursor, nodes, edges };
}

function branchLabel(text: string, x: number, y: number, side: 'left' | 'right'): FlowEdgeLabel {
  return { text, x, y, anchor: side === 'left' ? 'end' : 'start', tone: 'amber' };
}

function layoutDecision(node: FlowchartNode, m: Metrics, depth: number): Region {
  const spec = leafSpec(node, m);
  const yes = node.yes ? layoutNode(node.yes, m, depth + 1) : emptyRegion();
  const no = node.no ? layoutNode(node.no, m, depth + 1) : emptyRegion();
  const hasYes = !isEmptyRegion(yes);
  const hasNo = !isEmptyRegion(no);
  const yesW = hasYes ? yes.w : 0;
  const noW = hasNo ? no.w : 0;
  const branchGap = Math.max(m.hGap, 32);
  const branchesWidth = hasYes && hasNo ? yesW + noW + branchGap : Math.max(yesW, noW);
  // 只有一侧分支时，为另一侧的空分支留出 160px，避免空分支的折线穿过内容
  const singleBranch = hasYes !== hasNo;
  const stubRoom = singleBranch ? 160 : 0;
  const width = Math.max(
    spec.w,
    branchesWidth + stubRoom,
    hasYes || hasNo ? 0 : m.compact ? 190 : 214,
  );
  const header: FlowNodeLayout = { ...spec, x: (width - spec.w) / 2, y: 0 };
  const nodes: FlowNodeLayout[] = [header];
  const edges: FlowEdgeLayout[] = [];

  const centerX = width / 2;
  const start: Point = { x: centerX, y: spec.h };
  const splitY = spec.h + Math.max(16, m.vGap * 0.45);
  const branchY = spec.h + Math.max(28, m.vGap * 0.9);

  let yesX = 0;
  let noX = 0;
  if (hasYes && hasNo) {
    yesX = (width - branchesWidth) / 2;
    noX = yesX + yesW + branchGap;
  } else if (hasYes) {
    yesX = (width - yesW) / 2;
  } else if (hasNo) {
    noX = (width - noW) / 2;
  }

  const yesEntryX = hasYes
    ? yesX + yesW / 2
    : hasNo
      ? Math.max(26, noX - 34)
      : centerX - Math.min(52, width * 0.22);
  const noEntryX = hasNo
    ? noX + noW / 2
    : hasYes
      ? Math.min(width - 26, yesX + yesW + 34)
      : centerX + Math.min(52, width * 0.22);
  // 「是」分支在左、「否」分支在右：标签分别贴在分支入口外侧
  const yesSide: 'left' | 'right' = 'left';
  const noSide: 'right' | 'left' = 'right';

  if (hasYes) {
    const placed = translateRegion(yes, yesX, branchY);
    nodes.push(...placed.nodes);
    edges.push(...placed.edges);
  }
  if (hasNo) {
    const placed = translateRegion(no, noX, branchY);
    nodes.push(...placed.nodes);
    edges.push(...placed.edges);
  }

  const yesBottom = hasYes ? branchY + yes.h : branchY;
  const noBottom = hasNo ? branchY + no.h : branchY;
  const anyBranch = hasYes || hasNo;
  const maxBottom = Math.max(yesBottom, noBottom);
  const mergeY = anyBranch ? maxBottom + Math.max(22, m.vGap * 0.7) : splitY + Math.max(18, m.vGap * 0.4);
  const mergePoint: Point = { x: centerX, y: mergeY };

  // 判断 → 两个分支（共享一段向下的竖线与左右两条水平分配线）
  const labelY = splitY - Math.max(10, m.smallFont * 0.95);
  if (hasYes) {
    edges.push({
      points: [start, { x: centerX, y: splitY }, { x: yesEntryX, y: splitY }, { x: yesEntryX, y: branchY }],
      tone: 'muted',
      label: branchLabel('是', yesEntryX + (yesSide === 'left' ? -8 : 8), labelY, yesSide),
    });
  } else {
    edges.push({
      points: [
        start,
        { x: centerX, y: splitY },
        { x: yesEntryX, y: splitY },
        { x: yesEntryX, y: mergeY },
        mergePoint,
      ],
      tone: 'muted',
      arrow: false,
      label: branchLabel('是', yesEntryX + (yesSide === 'left' ? -8 : 8), labelY, yesSide),
    });
  }
  if (hasNo) {
    edges.push({
      points: [start, { x: centerX, y: splitY }, { x: noEntryX, y: splitY }, { x: noEntryX, y: branchY }],
      tone: 'muted',
      label: branchLabel('否', noEntryX + (noSide === 'right' ? 8 : -8), labelY, noSide),
    });
  } else {
    edges.push({
      points: [
        start,
        { x: centerX, y: splitY },
        { x: noEntryX, y: splitY },
        { x: noEntryX, y: mergeY },
        mergePoint,
      ],
      tone: 'muted',
      arrow: false,
      label: branchLabel('否', noEntryX + (noSide === 'right' ? 8 : -8), labelY, noSide),
    });
  }

  // 分支底部汇合
  const converge = (from: Point) => {
    if (Math.abs(from.x - mergePoint.x) < 0.5) {
      edges.push({ points: [from, mergePoint], tone: 'muted', arrow: false });
    } else {
      edges.push({
        points: [from, { x: from.x, y: mergeY }, mergePoint],
        tone: 'muted',
        arrow: false,
      });
    }
  };
  if (hasYes) converge({ x: yesX + yesW / 2, y: branchY + yes.h });
  if (hasNo) converge({ x: noX + noW / 2, y: branchY + no.h });

  return { w: width, h: mergeY, nodes, edges };
}

function layoutLoop(node: FlowchartNode, m: Metrics, depth: number): Region {
  const spec = leafSpec(node, m);
  const body = node.body ? layoutNode(node.body, m, depth + 1) : emptyRegion();
  const hasBody = !isEmptyRegion(body);
  const width = hasBody
    ? Math.max(spec.w, body.w + (m.compact ? 96 : 140), m.compact ? 196 : 220)
    : Math.max(spec.w, m.compact ? 180 : 200);
  const header: FlowNodeLayout = { ...spec, x: (width - spec.w) / 2, y: 0 };
  const nodes: FlowNodeLayout[] = [header];
  const edges: FlowEdgeLayout[] = [];
  const centerX = width / 2;

  if (!hasBody) {
    const outY = spec.h + Math.max(22, m.vGap * 0.55);
    edges.push({
      points: [
        { x: centerX, y: spec.h },
        { x: centerX, y: outY },
      ],
      tone: 'muted',
      arrow: false,
    });
    return { w: width, h: outY, nodes, edges };
  }

  const bodyX = (width - body.w) / 2;
  const bodyY = spec.h + m.vGap;
  const placed = translateRegion(body, bodyX, bodyY);
  nodes.push(...placed.nodes);
  edges.push(...placed.edges);

  edges.push({ points: [{ x: centerX, y: spec.h }, { x: centerX, y: bodyY }], tone: 'muted' });
  const bodyBottom = bodyY + body.h;
  const outY = bodyBottom + Math.max(20, m.vGap * 0.6);
  const railX = Math.min(width - (m.compact ? 28 : 34), bodyX + body.w + (m.compact ? 26 : 32));
  const backStartY = bodyBottom + Math.max(8, (outY - bodyBottom) * 0.4);
  const backLabelY = (spec.h / 2 + backStartY) / 2;

  edges.push({
    points: [
      { x: centerX, y: backStartY },
      { x: railX, y: backStartY },
      { x: railX, y: spec.h / 2 },
      { x: (width + spec.w) / 2, y: spec.h / 2 },
    ],
    tone: 'teal',
    dashed: true,
    label: {
      text: '重复',
      x: railX + (m.compact ? 4 : 6),
      y: backLabelY,
      anchor: 'start',
      tone: 'teal',
    },
  });
  // 循环体结束后的前进线（不画箭头，交给下一个节点）
  edges.push({
    points: [
      { x: centerX, y: bodyBottom },
      { x: centerX, y: outY },
    ],
    tone: 'muted',
    arrow: false,
  });

  return { w: width, h: outY, nodes, edges };
}

function layoutSwitch(node: FlowchartNode, m: Metrics, depth: number): Region {
  const spec = leafSpec(node, m);
  const cases = node.cases ?? [];
  interface CasePart {
    label: string;
    line: number;
    isDefault?: boolean;
    region: Region;
    pill: FlowNodeLayout;
  }
  const parts: CasePart[] = [];
  for (const item of cases) {
    const label = (item.label || 'case').trim();
    const text = item.isDefault ? 'default' : `case ${label}:`;
    const fontSize = m.monoFont;
    const w = clamp(measureText(text, fontSize) + 28, m.compact ? 76 : 84, m.compact ? 180 : 206);
    const pill: FlowNodeLayout = {
      id: `${node.id}-case-${item.line}-${parts.length}`,
      kind: 'process',
      shape: 'case',
      line: item.line,
      lines: item.line > 0 ? [item.line] : [],
      label: item.isDefault ? 'default' : `case ${label}`,
      textLines: [text],
      textMono: true,
      x: 0,
      y: 0,
      w,
      h: m.compact ? 22 : 24,
      fontSize,
      lineFontSize: m.lineFontSize,
    };
    parts.push({
      label,
      line: item.line,
      isDefault: item.isDefault,
      region: layoutNode(item.body, m, depth + 1),
      pill,
    });
  }

  const width = Math.max(
    spec.w,
    ...parts.map((part) => Math.max(part.pill.w, part.region.w)),
    m.compact ? 190 : 210,
  );
  const header: FlowNodeLayout = { ...spec, x: (width - spec.w) / 2, y: 0 };
  const nodes: FlowNodeLayout[] = [header];
  const edges: FlowEdgeLayout[] = [];
  const centerX = width / 2;
  let cursor = spec.h;
  let prevOut: Point = { x: centerX, y: spec.h };

  for (const part of parts) {
    cursor += Math.max(18, m.vGap * 0.5);
    const pillX = (width - part.pill.w) / 2;
    const placedPill: FlowNodeLayout = { ...part.pill, x: pillX, y: cursor };
    nodes.push(placedPill);
    edges.push({ points: [prevOut, { x: centerX, y: cursor }], tone: 'muted' });
    cursor += part.pill.h;
    prevOut = { x: centerX, y: cursor };

    if (!isEmptyRegion(part.region)) {
      cursor += Math.max(14, m.vGap * 0.35);
      const dx = (width - part.region.w) / 2;
      const placed = translateRegion(part.region, dx, cursor);
      nodes.push(...placed.nodes);
      edges.push(...placed.edges);
      edges.push({ points: [prevOut, { x: centerX, y: cursor }], tone: 'muted' });
      cursor += part.region.h;
      prevOut = { x: centerX, y: cursor };
    }
  }

  if (parts.length === 0) {
    cursor = spec.h + Math.max(22, m.vGap * 0.55);
    edges.push({
      points: [
        { x: centerX, y: spec.h },
        { x: centerX, y: cursor },
      ],
      tone: 'muted',
      arrow: false,
    });
  }
  return { w: width, h: cursor, nodes, edges };
}

function layoutNode(node: FlowchartNode | undefined, m: Metrics, depth: number): Region {
  if (!node || depth > MAX_DEPTH) return emptyRegion();
  switch (node.kind) {
    case 'block':
      return node.children && node.children.length > 0
        ? layoutSequence(node.children, m, depth)
        : emptyRegion();
    case 'decision':
      return layoutDecision(node, m, depth);
    case 'loop':
      return layoutLoop(node, m, depth);
    case 'switch':
      return layoutSwitch(node, m, depth);
    default:
      return layoutLeaf(node, m);
  }
}

/** 主入口：把流程图数据排成带画布内边距的绝对坐标布局。 */
export function layoutFlowchart(data: FlowchartData | null | undefined, compact: boolean): FlowLayout {
  const empty: FlowLayout = { nodes: [], edges: [], width: 0, height: 0 };
  if (!data || !data.entry) return empty;
  const m = flowMetrics(compact);
  let region: Region;
  try {
    region = layoutNode(data.entry, m, 0);
  } catch {
    return empty;
  }
  if (isEmptyRegion(region)) return empty;
  const width = region.w + m.padX * 2;
  const height = region.h + m.padY * 2;
  return {
    width,
    height,
    nodes: region.nodes.map((node) => ({ ...node, x: node.x + m.padX, y: node.y + m.padY })),
    edges: region.edges.map((edge) => ({
      ...edge,
      points: edge.points.map((p) => ({ x: p.x + m.padX, y: p.y + m.padY })),
      label: edge.label ? { ...edge.label, x: edge.label.x + m.padX, y: edge.label.y + m.padY } : undefined,
    })),
  };
}

/** 文本行基线计算（供渲染器复用，保证与布局一致） */
export function textRows(centerY: number, textLines: string[], fontSize: number): { text: string; y: number }[] {
  const lh = textLineHeight(fontSize);
  const startY = centerY - ((textLines.length - 1) * lh) / 2 + fontSize * 0.34;
  return textLines.map((text, index) => ({ text, y: startY + index * lh }));
}
