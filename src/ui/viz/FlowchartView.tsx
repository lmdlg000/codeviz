/**
 * 函数流程图（手写 SVG）
 * ------------------------------------------------------------------
 * 布局由 flowLayout.ts 计算；本文件只负责形状绘制、连线、缩放与交互。
 * 交互：节点可点击/回车/空格定位源码行，activeLine 对应节点显示 indigo 外环。
 */
import { useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { FlowchartData } from '../../engine/types';
import { layoutFlowchart, textRows, type FlowEdgeLayout, type FlowNodeLayout } from './flowLayout';
import { clamp, diamondPoints, measureText, parallelogramPoints, roundedOrthoPath } from './svgUtils';
import { VizIcon } from './icons';
import { VizEmpty } from './feedback';

let flowUid = 0;

const SHAPE_NAME: Record<FlowNodeLayout['shape'], string> = {
  start: '开始',
  end: '结束',
  process: '处理',
  decision: '判断',
  loop: '循环',
  io: '输入输出',
  call: '函数调用',
  switch: '选择结构',
  terminal: '跳转',
  case: '分支标签',
};

export interface FlowchartViewProps {
  data: FlowchartData;
  activeLine?: number;
  onSelectLine?: (line: number) => void;
  compact?: boolean;
}

interface NodeViewProps {
  node: FlowNodeLayout;
  active: boolean;
  selected: boolean;
  clickable: boolean;
  onActivate: (node: FlowNodeLayout) => void;
}

function GlyphPaths({ d, x, y, scale = 0.58 }: { d: string[]; x: number; y: number; scale?: number }) {
  return (
    <g className="cvz-flow__glyph" transform={`translate(${x} ${y}) scale(${scale})`} aria-hidden="true">
      {d.map((path) => (
        <path key={path} d={path} />
      ))}
    </g>
  );
}

function FlowNodeView({ node, active, selected, clickable, onActivate }: NodeViewProps) {
  const highlighted = active || selected;
  const { x, y, w, h } = node;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rows = textRows(cy, node.textLines, node.fontSize);
  const textX = node.shape === 'loop' || node.shape === 'call' ? cx + 8 : cx;
  const lineLabel =
    node.line > 0 && node.shape !== 'start' && node.shape !== 'end' ? `L${node.line}` : '';
  const accessible = `${SHAPE_NAME[node.shape]}：${node.label || node.textLines.join(' ')}${
    node.line > 0 ? `，第 ${node.line} 行` : ''
  }${active ? '，当前代码行' : ''}`;

  const activate = () => onActivate(node);

  const handleKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      activate();
    }
  };

  const commonProps = {
    role: 'button',
    tabIndex: 0,
    'aria-label': accessible,
    'aria-pressed': highlighted,
    'data-line': node.line,
    'data-node-id': node.id,
  } as const;

  return (
    <g
      className={`cvz-flow__node cvz-flow__node--${node.shape}${highlighted ? ' is-active' : ''}${
        clickable ? ' is-clickable' : ''
      }`}
      onClick={activate}
      onKeyDown={handleKeyDown}
      {...commonProps}
    >
      <title>{accessible}</title>
      {/* 透明命中区，扩大点击面积 */}
      <rect
        className="cvz-flow__hit"
        x={x - 6}
        y={y - 6}
        width={w + 12}
        height={h + 12}
        rx={node.shape === 'decision' ? 10 : 14}
      />
      {node.shape === 'decision' ? (
        <polygon
          className="cvz-flow__shape cvz-flow__shape--decision"
          points={diamondPoints(x, y, w, h)}
        />
      ) : node.shape === 'io' ? (
        <polygon
          className="cvz-flow__shape cvz-flow__shape--io"
          points={parallelogramPoints(x, y, w, h, 14)}
        />
      ) : (
        <rect
          className={`cvz-flow__shape cvz-flow__shape--${node.shape}`}
          x={x}
          y={y}
          width={w}
          height={h}
          rx={
            node.shape === 'start' || node.shape === 'end'
              ? h / 2
              : node.shape === 'terminal'
                ? 8
                : node.shape === 'case'
                  ? 7
                  : 12
          }
        />
      )}

      {node.shape === 'loop' ? (
        <GlyphPaths
          d={['M4 9a6 6 0 0 1 10.5-4L17 7', 'M20 15a6 6 0 0 1-10.5 4L7 17', 'M17 3v4h-4', 'M7 21v-4h4']}
          x={x + 9}
          y={cy - 7}
        />
      ) : null}
      {node.shape === 'call' ? (
        <GlyphPaths d={['M4 12h15', 'M13 6l6 6-6 6']} x={x + 9} y={cy - 7} scale={0.56} />
      ) : null}
      {node.shape === 'switch' ? (
        <GlyphPaths d={['M12 3l9 9-9 9-9-9z']} x={x + 8} y={cy - 7} scale={0.6} />
      ) : null}

      <text
        className={`cvz-flow__text${node.textMono ? ' is-mono' : ''}`}
        textAnchor="middle"
        fontSize={node.fontSize}
      >
        {rows.map((row) => (
          <tspan key={row.y} x={textX} y={row.y}>
            {row.text}
          </tspan>
        ))}
      </text>

      {node.shape === 'case' ? (
        <text
          className="cvz-flow__line-label"
          x={x + w + 7}
          y={cy + node.lineFontSize * 0.35}
          textAnchor="start"
          fontSize={node.lineFontSize}
        >
          {lineLabel}
        </text>
      ) : lineLabel ? (
        <text
          className="cvz-flow__line-label"
          x={x + w - 2}
          y={y + h + node.lineFontSize + 3}
          textAnchor="end"
          fontSize={node.lineFontSize}
        >
          {lineLabel}
        </text>
      ) : null}

      <rect
        className="cvz-flow__halo"
        x={x - 6}
        y={y - 6}
        width={w + 12}
        height={h + 12}
        rx={node.shape === 'decision' ? 12 : 16}
      />
    </g>
  );
}

const EDGE_TONE_MARKER: Record<FlowEdgeLayout['tone'], string> = {
  muted: 'muted',
  teal: 'teal',
  amber: 'amber',
};

function EdgeLabelView({ label }: { label: NonNullable<FlowEdgeLayout['label']> }) {
  const fontSize = 10;
  const width = measureText(label.text, fontSize) + 14;
  const rectX =
    label.anchor === 'start' ? label.x : label.anchor === 'end' ? label.x - width : label.x - width / 2;
  const textX = label.anchor === 'start' ? label.x + 7 : label.anchor === 'end' ? label.x - 7 : label.x;
  return (
    <g className={`cvz-flow__edge-label cvz-flow__edge-label--${label.tone}`} aria-hidden="true">
      <rect
        className="cvz-flow__edge-label-bg"
        x={rectX}
        y={label.y - 9}
        width={width}
        height={18}
        rx={9}
      />
      <text
        className="cvz-flow__edge-label-text"
        x={textX}
        y={label.y + 3.5}
        textAnchor={label.anchor}
        fontSize={fontSize}
      >
        {label.text}
      </text>
    </g>
  );
}

function FlowLegend() {
  return (
    <div className="cvz-flow__legend" aria-label="流程图图例">
      <span className="cvz-flow__legend-item">
        <i className="cvz-swatch cvz-swatch--decision" aria-hidden="true" />
        判断
      </span>
      <span className="cvz-flow__legend-item">
        <i className="cvz-swatch cvz-swatch--loop" aria-hidden="true" />
        循环
      </span>
      <span className="cvz-flow__legend-item">
        <i className="cvz-swatch cvz-swatch--io" aria-hidden="true" />
        输入输出
      </span>
      <span className="cvz-flow__legend-item">
        <i className="cvz-swatch cvz-swatch--call" aria-hidden="true" />
        调用
      </span>
      <span className="cvz-flow__legend-item">
        <i className="cvz-swatch cvz-swatch--process" aria-hidden="true" />
        处理
      </span>
    </div>
  );
}

export function FlowchartView({ data, activeLine, onSelectLine, compact = false }: FlowchartViewProps) {
  const [uid] = useState(() => `cvz-flow-${++flowUid}`);
  const layout = useMemo(() => layoutFlowchart(data, compact), [data, compact]);
  const [scale, setScale] = useState(1);
  const [fit, setFit] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const functionId = data?.functionId;
  useEffect(() => {
    setScale(1);
    setFit(true);
    setSelectedId(null);
  }, [functionId]);

  if (!data || layout.nodes.length === 0) {
    return (
      <div className={`cvz cvz-flow${compact ? ' is-compact' : ''}`}>
        <VizEmpty
          compact={compact}
          icon="flow"
          title="暂无可绘制的流程图"
          hint="这段代码里还没有可以展开的函数，或函数体为空。"
        />
      </div>
    );
  }

  const activate = (node: FlowNodeLayout) => {
    setSelectedId(node.id);
    if (node.line > 0) onSelectLine?.(node.line);
  };

  const zoom = (delta: number) => {
    setFit(false);
    setScale((value) => clamp(Math.round((value + delta) * 10) / 10, 0.6, 1.6));
  };

  return (
    <div className={`cvz cvz-flow${compact ? ' is-compact' : ''}`}>
      {!compact ? (
        <div className="cvz-flow__toolbar">
          <span className="cvz-flow__toolbar-name" title={data.functionName}>
            {data.functionName || '函数'}
          </span>
          <span className="cvz-flow__toolbar-spacer" />
          <button
            type="button"
            className={`cvz-flow__fitbtn${fit ? ' is-active' : ''}`}
            onClick={() => setFit((value) => !value)}
            aria-pressed={fit}
            title={fit ? '按面板宽度缩放，点击恢复原始大小' : '适应面板宽度，避免宽图被裁切'}
          >
            <VizIcon name="target" size={13} />
            适应宽度
          </button>
          <button
            type="button"
            className="cvz-iconbtn"
            onClick={() => zoom(-0.1)}
            disabled={scale <= 0.6}
            aria-label="缩小流程图"
            title="缩小"
          >
            <VizIcon name="zoomOut" size={15} />
          </button>
          <span className="cvz-flow__zoom" aria-live="polite">
            {fit ? '适应' : `${Math.round(scale * 100)}%`}
          </span>
          <button
            type="button"
            className="cvz-iconbtn"
            onClick={() => zoom(0.1)}
            disabled={scale >= 1.6}
            aria-label="放大流程图"
            title="放大"
          >
            <VizIcon name="zoomIn" size={15} />
          </button>
          <button
            type="button"
            className="cvz-iconbtn"
            onClick={() => {
              setScale(1);
              setFit(true);
            }}
            aria-label="重置缩放"
            title="重置缩放（适应宽度）"
          >
            <VizIcon name="reset" size={15} />
          </button>
        </div>
      ) : null}

      <div className={`cvz-flow__scroll${fit ? ' is-fit' : ''}`}>
        <div className="cvz-flow__inner">
          <svg
            className="cvz-flow__svg"
            width={layout.width * scale}
            height={layout.height * scale}
            style={fit ? { width: '100%', maxWidth: `${layout.width}px`, height: 'auto' } : undefined}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            preserveAspectRatio="xMidYMid meet"
            role="group"
            aria-label={`函数 ${data.functionName || ''} 的流程图，共 ${data.nodeCount || layout.nodes.length} 个节点`}
          >
            <defs>
              <pattern
                id={`${uid}-dots`}
                width="18"
                height="18"
                patternUnits="userSpaceOnUse"
                patternTransform={`scale(${compact ? 0.85 : 1})`}
              >
                <circle cx="1.2" cy="1.2" r="1.1" className="cvz-flow__dot" />
              </pattern>
              <marker
                id={`${uid}-arrow-muted`}
                viewBox="0 0 7 7"
                refX="6.2"
                refY="3.5"
                markerWidth="7"
                markerHeight="7"
                markerUnits="userSpaceOnUse"
                orient="auto-start-reverse"
              >
                <path d="M0.7 0.7 L6.6 3.5 L0.7 6.3 Z" className="cvz-flow__arrow cvz-flow__arrow--muted" />
              </marker>
              <marker
                id={`${uid}-arrow-teal`}
                viewBox="0 0 7 7"
                refX="6.2"
                refY="3.5"
                markerWidth="7"
                markerHeight="7"
                markerUnits="userSpaceOnUse"
                orient="auto-start-reverse"
              >
                <path d="M0.7 0.7 L6.6 3.5 L0.7 6.3 Z" className="cvz-flow__arrow cvz-flow__arrow--teal" />
              </marker>
              <marker
                id={`${uid}-arrow-amber`}
                viewBox="0 0 7 7"
                refX="6.2"
                refY="3.5"
                markerWidth="7"
                markerHeight="7"
                markerUnits="userSpaceOnUse"
                orient="auto-start-reverse"
              >
                <path d="M0.7 0.7 L6.6 3.5 L0.7 6.3 Z" className="cvz-flow__arrow cvz-flow__arrow--amber" />
              </marker>
            </defs>

            <rect className="cvz-flow__canvas" width={layout.width} height={layout.height} />
            <rect
              className="cvz-flow__grid"
              width={layout.width}
              height={layout.height}
              fill={`url(#${uid}-dots)`}
            />

            <g className="cvz-flow__edges">
              {layout.edges.map((edge, index) => (
                <path
                  key={`${nodeKey(edge.points)}-${index}`}
                  className={`cvz-flow__edge cvz-flow__edge--${edge.tone}${
                    edge.dashed ? ' is-dashed' : ''
                  }`}
                  d={roundedOrthoPath(edge.points, compact ? 6 : 8)}
                  markerEnd={
                    edge.arrow === false ? undefined : `url(#${uid}-arrow-${EDGE_TONE_MARKER[edge.tone]})`
                  }
                />
              ))}
            </g>

            <g className="cvz-flow__labels">
              {layout.edges.map((edge, index) =>
                edge.label ? <EdgeLabelView key={`label-${index}`} label={edge.label} /> : null,
              )}
            </g>

            <g className="cvz-flow__nodes">
              {layout.nodes.map((node) => {
                const active =
                  activeLine !== undefined &&
                  activeLine !== null &&
                  (node.line === activeLine || node.lines.includes(activeLine));
                return (
                  <FlowNodeView
                    key={node.id}
                    node={node}
                    active={Boolean(active)}
                    selected={selectedId === node.id}
                    clickable={Boolean(onSelectLine)}
                    onActivate={activate}
                  />
                );
              })}
            </g>
          </svg>
        </div>
      </div>

      {!compact ? <FlowLegend /> : null}
    </div>
  );
}

function nodeKey(points: { x: number; y: number }[]): string {
  return points.map((p) => `${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(' ');
}
