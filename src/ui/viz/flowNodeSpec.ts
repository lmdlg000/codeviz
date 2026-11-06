/**
 * 流程图节点尺寸与文本折行（布局的前半段）
 * ------------------------------------------------------------------
 * 根据节点类型计算宽高、折行后的文本与线号，供 flowLayout 组织树结构。
 * 纯函数，不依赖 DOM。
 */
import type { FlowchartNode, FlowNodeKind } from '../../engine/types';
import { clamp, measureText, textLineHeight, wrapLabel } from './svgUtils';
import type { FlowNodeLayout, FlowShape, Metrics } from './flowTypes';

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

/** 计算一个简单节点（非 block / decision / loop / switch）的尺寸与文本 */
export function leafSpec(node: FlowchartNode, m: Metrics): FlowNodeLayout {
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
      return makeNode(
        node,
        node.kind === 'start' ? 'start' : 'end',
        w,
        m.compact ? 30 : 34,
        [text],
        font,
        false,
        m,
      );
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

/** 文本行基线计算（供渲染器复用，保证与布局一致） */
export function textRows(
  centerY: number,
  textLines: string[],
  fontSize: number,
): { text: string; y: number }[] {
  const lh = textLineHeight(fontSize);
  const startY = centerY - ((textLines.length - 1) * lh) / 2 + fontSize * 0.34;
  return textLines.map((text, index) => ({ text, y: startY + index * lh }));
}
