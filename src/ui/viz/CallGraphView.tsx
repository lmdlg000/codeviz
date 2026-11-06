/**
 * 函数调用图（手写 SVG）
 * ------------------------------------------------------------------
 * - 按 depth 分列（左→右）；同列按行号排序，纵向均分并整体居中；
 * - 递归 / 回边用 amber 虚线绕到下方回指，并标「递归」；
 * - 自调用画成节点上方的自环；main（roots）实底 indigo 高亮；
 * - 外部函数不建节点，以 chips 展示在图下方。
 */
import { useEffect, useMemo, useState } from 'react';
import type { CallGraph, CallGraphEdge, CallGraphNode, FunctionKind } from '../../engine/types';
import { truncateText } from './svgUtils';import { VizIcon } from './icons';
import { VizEmpty } from './feedback';

let callUid = 0;

const KIND_LABEL: Record<FunctionKind, string> = {
  function: '函数',
  main: '入口',
  method: '成员函数',
  constructor: '构造',
  destructor: '析构',
  operator: '运算符',
};

export interface CallGraphViewProps {
  graph: CallGraph;
  activeFunctionId?: string;
  onSelectFunction?: (id: string) => void;
  compact?: boolean;
}

interface Box {
  node: CallGraphNode;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface EdgeShape {
  edge: CallGraphEdge;
  path: string;
  recursive: boolean;
  selfLoop: boolean;
  label?: { text: string; x: number; y: number };
}

interface Layout {
  boxes: Box[];
  shapes: EdgeShape[];
  width: number;
  height: number;
  maxRows: number;
}

interface Metrics {
  nodeW: number;
  nodeH: number;
  gapX: number;
  gapY: number;
  padX: number;
  padTop: number;
  padBottom: number;
  maxCols: number;
}

function metricsFor(compact: boolean): Metrics {
  return compact
    ? { nodeW: 138, nodeH: 54, gapX: 54, gapY: 20, padX: 22, padTop: 24, padBottom: 20, maxCols: 8 }
    : { nodeW: 160, nodeH: 64, gapX: 72, gapY: 26, padX: 28, padTop: 26, padBottom: 24, maxCols: 10 };
}

function edgeKey(edge: CallGraphEdge): string {
  return `${edge.from}->${edge.to}`;
}

/** DFS 找所有回边（指向当前递归栈上节点的边），用于虚线标注 */
function findBackEdges(nodes: CallGraphNode[], edges: CallGraphEdge[], roots: string[]): Set<string> {
  const adjacency = new Map<string, CallGraphEdge[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.from);
    if (list) list.push(edge);
    else adjacency.set(edge.from, [edge]);
  }
  const state = new Map<string, 0 | 1 | 2>();
  const back = new Set<string>();
  const visit = (id: string) => {
    state.set(id, 1);
    for (const edge of adjacency.get(id) ?? []) {
      const targetState = state.get(edge.to) ?? 0;
      if (targetState === 1) {
        back.add(edgeKey(edge));
      } else if (targetState === 0) {
        visit(edge.to);
      }
    }
    state.set(id, 2);
  };
  for (const root of roots) {
    if ((state.get(root) ?? 0) === 0) visit(root);
  }
  for (const node of nodes) {
    if ((state.get(node.id) ?? 0) === 0) visit(node.id);
  }
  return back;
}

function buildLayout(graph: CallGraph, compact: boolean): Layout {
  const m = metricsFor(compact);
  const nodes = (graph.nodes ?? []).filter((node) => node && !node.external && node.id);
  const empty: Layout = { boxes: [], shapes: [], width: 0, height: 0, maxRows: 0 };
  if (nodes.length === 0) return empty;

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = (graph.edges ?? []).filter(
    (edge) => edge && nodeIds.has(edge.from) && nodeIds.has(edge.to),
  );
  const roots = new Set((graph.roots ?? []).filter((id) => nodeIds.has(id)));
  const selfLoopNodes = new Set<string>();
  for (const edge of edges) {
    if (edge.from === edge.to) selfLoopNodes.add(edge.from);
  }

  const layers = new Map<number, CallGraphNode[]>();
  for (const node of nodes) {
    const depth = Number.isFinite(node.depth) ? Math.max(0, Math.min(Math.floor(node.depth), m.maxCols - 1)) : 0;
    const list = layers.get(depth);
    if (list) list.push(node);
    else layers.set(depth, [node]);
  }
  const depths = Array.from(layers.keys()).sort((a, b) => a - b);
  for (const depth of depths) {
    layers.get(depth)?.sort((a, b) => a.line - b.line || a.name.localeCompare(b.name));
  }
  const maxRows = Math.max(...depths.map((depth) => layers.get(depth)?.length ?? 0), 1);

  const gridWidth = depths.length * m.nodeW + (depths.length - 1) * m.gapX;
  const gridHeight = maxRows * m.nodeH + (maxRows - 1) * m.gapY;
  const padTop = m.padTop + (selfLoopNodes.size > 0 ? 26 : 0);
  const width = Math.max(m.padX * 2 + gridWidth, compact ? 260 : 320);

  const boxes: Box[] = [];
  const boxById = new Map<string, Box>();
  for (const depth of depths) {
    const column = layers.get(depth) ?? [];
    const columnHeight = column.length * m.nodeH + Math.max(0, column.length - 1) * m.gapY;
    const startY = padTop + (gridHeight - columnHeight) / 2;
    const x = m.padX + depths.indexOf(depth) * (m.nodeW + m.gapX);
    column.forEach((node, index) => {
      const box: Box = {
        node,
        x,
        y: startY + index * (m.nodeH + m.gapY),
        w: m.nodeW,
        h: m.nodeH,
      };
      boxes.push(box);
      boxById.set(node.id, box);
    });
  }

  const backEdges = findBackEdges(nodes, edges, Array.from(roots));
  const laneStep = 14;
  // 所有无法从左向右画的边（回边、同列边）统一走下方通道
  const laneEdges: CallGraphEdge[] = [];
  for (const edge of edges) {
    if (edge.from === edge.to) continue;
    const source = boxById.get(edge.from);
    const target = boxById.get(edge.to);
    if (!source || !target) continue;
    if (!(target.x > source.x)) laneEdges.push(edge);
  }
  const laneIndex = new Map<string, number>();
  laneEdges.forEach((edge, index) => laneIndex.set(edgeKey(edge), index));
  const laneCount = laneEdges.length;
  const laneBase = padTop + gridHeight + 18;
  const height =
    laneCount > 0 ? laneBase + (laneCount - 1) * laneStep + m.padBottom : laneBase + m.padBottom;

  const shapes: EdgeShape[] = [];
  for (const edge of edges) {
    const source = boxById.get(edge.from);
    const target = boxById.get(edge.to);
    if (!source || !target) continue;

    if (edge.from === edge.to) {
      // 自环：节点上方画一个回环
      const sx = source.x + source.w * 0.3;
      const ex = source.x + source.w * 0.7;
      const top = source.y;
      const arc = 34;
      const labelX = source.x + source.w / 2;
      shapes.push({
        edge,
        selfLoop: true,
        recursive: true,
        path: `M ${sx} ${top} C ${sx} ${top - arc}, ${ex} ${top - arc}, ${ex} ${top - 1}`,
        label: { text: '递归', x: labelX, y: top - arc * 0.62 },
      });
      continue;
    }

    const isBack = backEdges.has(edgeKey(edge));
    const forward = target.x > source.x && !isBack;
    if (forward) {
      const sx = source.x + source.w;
      const sy = source.y + source.h / 2;
      const tx = target.x;
      const ty = target.y + target.h / 2;
      const dx = Math.max(24, (tx - sx) * 0.5);
      shapes.push({
        edge,
        selfLoop: false,
        recursive: false,
        path: `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx - 1} ${ty}`,
        label: edge.count > 1 ? { text: `×${edge.count}`, x: (sx + tx) / 2, y: (sy + ty) / 2 - 6 } : undefined,
      });
    } else {
      // 递归 / 同列 / 不规则的边，走下方通道
      const lane = laneBase + (laneIndex.get(edgeKey(edge)) ?? 0) * laneStep;
      const sx = source.x + source.w / 2;
      const tx = target.x + target.w / 2;
      const sy = source.y + source.h;
      const ty = target.y + target.h;
      shapes.push({
        edge,
        selfLoop: false,
        recursive: isBack,
        path: `M ${sx} ${sy} L ${sx} ${lane} L ${tx} ${lane} L ${tx} ${ty + 1}`,
        label: isBack
          ? { text: '递归', x: (sx + tx) / 2, y: lane - 5 }
          : edge.count > 1
            ? { text: `×${edge.count}`, x: (sx + tx) / 2, y: lane - 5 }
            : undefined,
      });
    }
  }

  return { boxes, shapes, width, height: height + 8, maxRows };
}

function CallNodeView({
  box,
  root,
  active,
  selected,
  compact,
  onActivate,
}: {
  box: Box;
  root: boolean;
  active: boolean;
  selected: boolean;
  compact: boolean;
  onActivate: (node: CallGraphNode) => void;
}) {
  const { node, x, y, w, h } = box;
  const highlighted = active || selected;
  const nameFont = compact ? 11.5 : 12.5;
  const name = truncateText(node.name || node.id, w - 22, nameFont);
  const sub = truncateText(
    `${KIND_LABEL[node.kind] ?? '函数'} · 复杂度 ${node.complexity} · L${node.line}`,
    w - 22,
    compact ? 9 : 9.5,
  );
  const accessible = `${node.name}，${KIND_LABEL[node.kind] ?? '函数'}，第 ${node.line} 行，复杂度 ${node.complexity}${
    node.recursive ? '，递归函数' : ''
  }${root ? '，程序入口' : ''}`;

  return (
    <g
      className={`cvz-call__node${root ? ' is-root' : ''}${node.recursive ? ' is-recursive' : ''}${
        highlighted ? ' is-active' : ''
      }`}
      role="button"
      tabIndex={0}
      aria-label={accessible}
      aria-pressed={highlighted}
      data-line={node.line}
      onClick={() => onActivate(node)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
          event.preventDefault();
          onActivate(node);
        }
      }}
    >
      <title>{accessible}</title>
      <rect className="cvz-call__hit" x={x - 5} y={y - 5} width={w + 10} height={h + 10} rx={16} />
      <rect className="cvz-call__box" x={x} y={y} width={w} height={h} rx={12} />
      <rect className="cvz-call__accent" x={x + 1} y={y + 12} width={3} height={h - 24} rx={1.5} />
      <text className="cvz-call__name" x={x + 14} y={y + (compact ? 23 : 26)} fontSize={nameFont}>
        {name}
      </text>
      <text className="cvz-call__sub" x={x + 14} y={y + (compact ? 41 : 48)} fontSize={compact ? 9 : 9.5}>
        {sub}
      </text>
      {root ? (
        <text className="cvz-call__badge-text" x={x + w - 10} y={y + (compact ? 20 : 22)} textAnchor="end" fontSize={8.5}>
          入口
        </text>
      ) : null}
      {node.recursive ? <circle className="cvz-call__rec-dot" cx={x + w - 12} cy={y + h - 12} r={3.2} /> : null}
      <rect className="cvz-call__halo" x={x - 5} y={y - 5} width={w + 10} height={h + 10} rx={16} />
    </g>
  );
}

export function CallGraphView({ graph, activeFunctionId, onSelectFunction, compact = false }: CallGraphViewProps) {
  const [uid] = useState(() => `cvz-call-${++callUid}`);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const layout = useMemo(() => buildLayout(graph, compact), [graph, compact]);
  const roots = graph?.roots ?? [];
  const graphSignature = useMemo(
    () =>
      `${(graph?.nodes ?? []).map((node) => node.id).join('|')}#${(graph?.edges ?? [])
        .map((edge) => `${edge.from}>${edge.to}`)
        .join('|')}#${(graph?.roots ?? []).join('|')}`,
    [graph],
  );

  useEffect(() => {
    setSelectedId(null);
  }, [graphSignature]);

  if (!graph || layout.boxes.length === 0) {
    return (
      <div className={`cvz cvz-call${compact ? ' is-compact' : ''}`}>
        <VizEmpty
          compact={compact}
          icon="call"
          title="还没有可展示的调用关系"
          hint="定义一个函数并从 main 或其他函数里调用它，这里就会出现调用层级。"
        />
      </div>
    );
  }

  const activate = (node: CallGraphNode) => {
    setSelectedId(node.id);
    onSelectFunction?.(node.id);
  };

  return (
    <div className={`cvz cvz-call${compact ? ' is-compact' : ''}`}>
      <div className="cvz-call__scroll">
        <div className="cvz-call__inner">
          <svg
            className="cvz-call__svg"
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            role="group"
            aria-label={`函数调用图，${layout.boxes.length} 个函数${graph.hasRecursion ? '，含递归调用' : ''}`}
          >
            <defs>
              <marker
                id={`${uid}-arrow`}
                viewBox="0 0 7 7"
                refX="6.2"
                refY="3.5"
                markerWidth="7"
                markerHeight="7"
                markerUnits="userSpaceOnUse"
                orient="auto-start-reverse"
              >
                <path className="cvz-call__arrow" d="M0.7 0.7 L6.6 3.5 L0.7 6.3 Z" />
              </marker>
              <marker
                id={`${uid}-arrow-rec`}
                viewBox="0 0 7 7"
                refX="6.2"
                refY="3.5"
                markerWidth="7"
                markerHeight="7"
                markerUnits="userSpaceOnUse"
                orient="auto-start-reverse"
              >
                <path className="cvz-call__arrow cvz-call__arrow--rec" d="M0.7 0.7 L6.6 3.5 L0.7 6.3 Z" />
              </marker>
              <pattern id={`${uid}-dots`} width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="1.2" cy="1.2" r="1" className="cvz-call__dot" />
              </pattern>
            </defs>

            <rect className="cvz-call__canvas" width={layout.width} height={layout.height} />
            <rect
              className="cvz-call__grid"
              width={layout.width}
              height={layout.height}
              fill={`url(#${uid}-dots)`}
            />

            <g className="cvz-call__edges">
              {layout.shapes.map((shape, index) => (
                <g key={`${shape.edge.from}-${shape.edge.to}-${index}`}>
                  <path
                    className={`cvz-call__edge${shape.recursive ? ' is-recursive' : ''}`}
                    d={shape.path}
                    markerEnd={`url(#${uid}-${shape.recursive ? 'arrow-rec' : 'arrow'})`}
                  />
                  {shape.label ? (
                    <text
                      className={`cvz-call__edge-label${shape.recursive ? ' is-recursive' : ''}`}
                      x={shape.label.x}
                      y={shape.label.y}
                      textAnchor="middle"
                      fontSize={shape.recursive ? 9.5 : 9}
                    >
                      {shape.label.text}
                    </text>
                  ) : null}
                </g>
              ))}
            </g>

            <g className="cvz-call__nodes">
              {layout.boxes.map((box) => (
                <CallNodeView
                  key={box.node.id}
                  box={box}
                  root={roots.includes(box.node.id) || box.node.kind === 'main'}
                  active={Boolean(activeFunctionId && box.node.id === activeFunctionId)}
                  selected={selectedId === box.node.id}
                  compact={compact}
                  onActivate={activate}
                />
              ))}
            </g>
          </svg>
        </div>
      </div>

      {!compact ? (
        <div className="cvz-call__meta">
          <div className="cvz-call__legend" aria-label="调用图图例">
            <span className="cvz-call__legend-item">
              <i className="cvz-swatch cvz-swatch--entry" aria-hidden="true" />
              入口函数
            </span>
            <span className="cvz-call__legend-item">
              <i className="cvz-call__legend-dash" aria-hidden="true" />
              递归调用
            </span>
            <span className="cvz-call__legend-item">
              <i className="cvz-call__legend-line" aria-hidden="true" />
              普通调用
            </span>
          </div>
          {graph.externalCalls && graph.externalCalls.length > 0 ? (
            <div className="cvz-call__external">
              <span className="cvz-call__external-title">
                <VizIcon name="external" size={13} />
                外部函数
              </span>
              <span className="cvz-call__chips">
                {graph.externalCalls.slice(0, 24).map((name) => (
                  <span className="cvz-chip cvz-chip--sky" key={name}>
                    {name}
                  </span>
                ))}
                {graph.externalCalls.length > 24 ? (
                  <span className="cvz-chip">+{graph.externalCalls.length - 24}</span>
                ) : null}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
