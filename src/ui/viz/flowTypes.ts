/**
 * 流程图布局的公共类型（布局与渲染共享）
 */
import type { FlowNodeKind } from '../../engine/types';
import type { Point } from './svgUtils';

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

export interface Metrics {
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

/** 布局过程中的局部区域：约定从顶部中心进入、底部中心离开 */
export interface Region {
  w: number;
  h: number;
  nodes: FlowNodeLayout[];
  edges: FlowEdgeLayout[];
}
