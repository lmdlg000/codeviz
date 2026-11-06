import { useMemo, useState } from 'react';
import { chapters, conceptGraph, getLesson, glossary } from '../../data';
import type { ConceptNode, GlossaryItem } from '../../data/types';
import { PageHeader } from '../layout/PageHeader';
import { Badge, type BadgeTone } from '../components/Badge';
import { ButtonLink } from '../components/Button';
import { Icon } from '../components/Icon';
import { lessonHref } from '../lib/router';

type GroupId = ConceptNode['group'];

const GROUP_ORDER: GroupId[] = ['basics', 'control', 'data', 'cpp'];

const GROUP_META: Record<GroupId, { label: string; short: string; tone: BadgeTone }> = {
  basics: { label: 'C 语言起步', short: '基础', tone: 'indigo' },
  control: { label: '控制流程', short: '控制', tone: 'teal' },
  data: { label: '数据组织', short: '数据', tone: 'amber' },
  cpp: { label: 'C++ 面向对象', short: '进阶', tone: 'violet' },
};

const NODE_W = 132;
const NODE_H = 24;
const NODE_GAP = 3;
const ROW_GAP = 5;
const HEADER_H = 44;
const PAD = 10;
const COL_W = 150;
const COL_GAP = 6;
const VIEW_W = PAD * 2 + GROUP_ORDER.length * COL_W + (GROUP_ORDER.length - 1) * COL_GAP;

interface LaidOutNode {
  node: ConceptNode;
  x: number;
  y: number;
}

interface TierRow {
  tier: number;
  top: number;
  height: number;
}

interface GraphLayout {
  nodes: LaidOutNode[];
  tiers: TierRow[];
  height: number;
}

function buildLayout(): GraphLayout {
  const nodesByGroup = new Map<GroupId, ConceptNode[]>();
  GROUP_ORDER.forEach((group) => nodesByGroup.set(group, []));
  conceptGraph.nodes.forEach((node) => {
    nodesByGroup.get(node.group)?.push(node);
  });
  nodesByGroup.forEach((list) => {
    list.sort((a, b) => (a.tier !== b.tier ? a.tier - b.tier : a.id.localeCompare(b.id)));
  });

  const maxTier = conceptGraph.nodes.reduce((max, node) => Math.max(max, node.tier), 0);
  const tiers: TierRow[] = [];
  const nodes: LaidOutNode[] = [];
  let cursor = HEADER_H;

  for (let tier = 0; tier <= maxTier; tier += 1) {
    const counts = GROUP_ORDER.map(
      (group) => nodesByGroup.get(group)?.filter((node) => node.tier === tier).length ?? 0,
    );
    const stack = Math.max(1, ...counts);
    const contentHeight = stack * NODE_H + (stack - 1) * NODE_GAP;
    const rowHeight = contentHeight + ROW_GAP;

    GROUP_ORDER.forEach((group, groupIndex) => {
      const tierNodes = (nodesByGroup.get(group) ?? []).filter((node) => node.tier === tier);
      if (tierNodes.length === 0) return;
      const blockHeight = tierNodes.length * NODE_H + (tierNodes.length - 1) * NODE_GAP;
      const startY = cursor + (contentHeight - blockHeight) / 2;
      const x = PAD + groupIndex * (COL_W + COL_GAP) + (COL_W - NODE_W) / 2;
      tierNodes.forEach((node, index) => {
        nodes.push({ node, x, y: startY + index * (NODE_H + NODE_GAP) });
      });
    });

    tiers.push({ tier, top: cursor, height: rowHeight });
    cursor += rowHeight;
  }

  return { nodes, tiers, height: cursor + PAD };
}

interface EdgeShape {
  key: string;
  from: string;
  to: string;
  path: string;
}

function buildEdges(nodeMap: Map<string, LaidOutNode>): EdgeShape[] {
  return conceptGraph.edges.flatMap((edge, index) => {
    const from = nodeMap.get(edge.from);
    const to = nodeMap.get(edge.to);
    if (!from || !to) return [];
    const fromGroup = from.node.group;
    const toGroup = to.node.group;

    if (fromGroup === toGroup) {
      const ax = from.x + NODE_W / 2;
      const ay = from.y + NODE_H;
      const bx = to.x + NODE_W / 2;
      const by = to.y;
      const side = from.x + NODE_W + 9;
      return [
        {
          key: `${edge.from}-${edge.to}-${index}`,
          from: edge.from,
          to: edge.to,
          path: `M ${ax} ${ay} C ${side} ${ay + 12}, ${side} ${by - 12}, ${bx} ${by}`,
        },
      ];
    }

    const goingRight = to.x > from.x;
    const startX = goingRight ? from.x + NODE_W : from.x;
    const startY = from.y + NODE_H / 2;
    const endX = goingRight ? to.x : to.x + NODE_W;
    const endY = to.y + NODE_H / 2;
    const midX = (startX + endX) / 2;
    return [
      {
        key: `${edge.from}-${edge.to}-${index}`,
        from: edge.from,
        to: edge.to,
        path: `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`,
      },
    ];
  });
}

function findGlossary(node: ConceptNode): GlossaryItem | undefined {
  return (
    glossary.find((item) => item.term === node.label) ??
    glossary.find((item) => node.label.includes(item.term) || item.term.includes(node.label))
  );
}

function activateNode(event: { key: string; preventDefault: () => void }, action: () => void): void {
  if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
    event.preventDefault();
    action();
  }
}

export function MapPage() {
  const layout = useMemo(() => buildLayout(), []);
  const nodeMap = useMemo(() => {
    const map = new Map<string, LaidOutNode>();
    layout.nodes.forEach((item) => map.set(item.node.id, item));
    return map;
  }, [layout]);
  const edges = useMemo(() => buildEdges(nodeMap), [nodeMap]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<GroupId | 'all'>('all');

  const selected = selectedId ? nodeMap.get(selectedId) : undefined;
  const linkedId = hoveredId ?? selectedId;
  const related = useMemo(() => {
    if (!hoveredId) return new Set<string>();
    const set = new Set<string>([hoveredId]);
    conceptGraph.edges.forEach((edge) => {
      if (edge.from === hoveredId) set.add(edge.to);
      if (edge.to === hoveredId) set.add(edge.from);
    });
    return set;
  }, [hoveredId]);

  const glossaryItem = selected ? findGlossary(selected.node) : undefined;
  const chapter = selected ? chapters.find((item) => item.id === selected.node.chapterId) : undefined;
  const lesson = selected?.node.lessonId ? getLesson(selected.node.lessonId) : undefined;

  const totalEdges = conceptGraph.edges.length;
  const focusGroup = groupFilter === 'all' ? null : groupFilter;

  const nodeClass = (item: LaidOutNode): string => {
    const classes = ['map-node'];
    if (focusGroup && item.node.group !== focusGroup) classes.push('is-faded');
    if (hoveredId) {
      if (item.node.id === hoveredId) classes.push('is-active');
      else if (related.has(item.node.id)) classes.push('is-related');
      else classes.push('is-faded');
    }
    if (item.node.id === selectedId) classes.push('is-selected');
    return classes.join(' ');
  };

  const selectNode = (id: string): void => {
    setSelectedId(id);
    if (window.matchMedia?.('(max-width: 959px)').matches) {
      window.setTimeout(() => {
        document.getElementById('map-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
  };

  return (
    <div className="page map-page">
      <PageHeader
        eyebrow="CONCEPT MAP"
        title="知识图谱"
        description="概念之间的依赖关系，点击任一节点查看定义并跳转课程。连线表示学习顺序上的依赖，不是严格的先修要求。"
        aside={
          <div className="map-summary">
            <div className="map-summary__item">
              <strong className="tabular">{conceptGraph.nodes.length}</strong>
              <span>概念</span>
            </div>
            <span className="map-summary__divider" aria-hidden="true" />
            <div className="map-summary__item">
              <strong className="tabular">{totalEdges}</strong>
              <span>关系</span>
            </div>
          </div>
        }
      />

      <div className="map-toolbar">
        <div className="map-filters" role="group" aria-label="按章节筛选概念">
          <button
            type="button"
            className={groupFilter === 'all' ? 'filter-chip is-active' : 'filter-chip'}
            aria-pressed={groupFilter === 'all'}
            onClick={() => setGroupFilter('all')}
          >
            全部
            <span className="filter-chip__count tabular">{conceptGraph.nodes.length}</span>
          </button>
          {GROUP_ORDER.map((group) => {
            const count = conceptGraph.nodes.filter((node) => node.group === group).length;
            return (
              <button
                key={group}
                type="button"
                className={
                  groupFilter === group
                    ? `filter-chip filter-chip--${group} is-active`
                    : `filter-chip filter-chip--${group}`
                }
                aria-pressed={groupFilter === group}
                onClick={() => setGroupFilter(groupFilter === group ? 'all' : group)}
              >
                <span className={`filter-chip__dot tone-${GROUP_META[group].tone}`} aria-hidden="true" />
                {GROUP_META[group].label}
                <span className="filter-chip__count tabular">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="map-layout">
        <div className="map-canvas" tabIndex={0} aria-label="知识图谱画布，可横向滚动">
          <svg
            className="map-canvas__svg"
            viewBox={`0 0 ${VIEW_W} ${layout.height}`}
            width="100%"
            role="group"
            aria-label={`知识图谱：${conceptGraph.nodes.length} 个概念，${totalEdges} 条关系`}
          >
            <defs>
              <marker id="map-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0 8 4 0 8z" fill="var(--line-strong)" />
              </marker>
              <marker id="map-arrow-active" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0 8 4 0 8z" fill="var(--primary)" />
              </marker>
            </defs>

            {/* 分组背景区块 */}
            {GROUP_ORDER.map((group, index) => {
              const meta = GROUP_META[group];
              const x = PAD + index * (COL_W + COL_GAP) - 3;
              const dimmed = focusGroup !== null && focusGroup !== group;
              return (
                <g key={group} className={dimmed ? 'map-lane is-faded' : 'map-lane'}>
                  <rect
                    x={x}
                    y={10}
                    width={COL_W + 6}
                    height={layout.height - 20}
                    rx={14}
                    className={`map-lane__bg map-lane__bg--${meta.tone}`}
                  />
                  <text x={x + 14} y={28} className={`map-lane__label map-lane__label--${meta.tone}`}>
                    {meta.short}
                  </text>
                  <text x={x + COL_W - 14} y={28} textAnchor="end" className="map-lane__count">
                    {conceptGraph.nodes.filter((node) => node.group === group).length}
                  </text>
                </g>
              );
            })}

            {/* 连线 */}
            <g className="map-edges">
              {edges.map((edge) => {
                const from = nodeMap.get(edge.from);
                const to = nodeMap.get(edge.to);
                if (!from || !to) return null;
                const isActive = linkedId !== null && (edge.from === linkedId || edge.to === linkedId);
                const isDim =
                  (hoveredId !== null && !isActive) ||
                  (focusGroup !== null &&
                    from.node.group !== focusGroup &&
                    to.node.group !== focusGroup);
                const classes = ['map-edge'];
                if (isActive) classes.push('is-active');
                if (isDim) classes.push('is-faded');
                return (
                  <path
                    key={edge.key}
                    d={edge.path}
                    className={classes.join(' ')}
                    markerEnd={isActive ? 'url(#map-arrow-active)' : 'url(#map-arrow)'}
                  />
                );
              })}
            </g>

            {/* 节点 */}
            <g className="map-nodes">
              {layout.nodes.map((item) => {
                const { node, x, y } = item;
                return (
                  <g
                    key={node.id}
                    className={nodeClass(item)}
                    transform={`translate(${x} ${y})`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${node.label}：${node.description}`}
                    aria-pressed={node.id === selectedId}
                    onClick={() => selectNode(node.id)}
                    onMouseEnter={() => setHoveredId(node.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onFocus={() => setHoveredId(node.id)}
                    onBlur={() => setHoveredId(null)}
                    onKeyDown={(event) => activateNode(event, () => selectNode(node.id))}
                    style={{ cursor: 'pointer' }}
                  >
                    <rect
                      className="map-node__bg"
                      width={NODE_W}
                      height={NODE_H}
                      rx={12}
                    />
                    <circle
                      cx={14}
                      cy={NODE_H / 2}
                      r={3.4}
                      className={`map-node__dot map-node__dot--${GROUP_META[node.group].tone}`}
                    />
                    <text x={24} y={NODE_H / 2 + 4} className="map-node__label">
                      {node.label}
                    </text>
                    <title>{node.description}</title>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        <aside className="map-detail" id="map-detail" aria-label="概念详情">
          {selected ? (
            <>
              <div className="map-detail__head">
                <Badge tone={GROUP_META[selected.node.group].tone}>
                  {GROUP_META[selected.node.group].label}
                </Badge>
                <span className="map-detail__tier">第 {selected.node.tier + 1} 层</span>
              </div>
              <h2 className="map-detail__title">{selected.node.label}</h2>
              {glossaryItem?.en ? <p className="map-detail__en mono">{glossaryItem.en}</p> : null}
              <p className="map-detail__desc">
                {glossaryItem?.definition ?? selected.node.description}
              </p>
              {chapter ? (
                <div className="map-detail__meta">
                  <Icon name="book" size={14} />
                  <span>{chapter.title}</span>
                </div>
              ) : null}
              {lesson ? (
                <>
                  <ButtonLink
                    href={lessonHref(lesson.id)}
                    variant="primary"
                    iconRight="arrow-right"
                    block
                  >
                    学习这一节
                  </ButtonLink>
                  <p className="map-detail__lesson-name">{lesson.title}</p>
                </>
              ) : (
                <p className="map-detail__no-lesson">这个概念暂未关联课程，可以先从相关章节开始。</p>
              )}
              <p className="map-detail__hint">
                <Icon name="info" size={13} />
                也可以打开实验室，用代码观察对应结构。
              </p>
            </>
          ) : (
            <div className="map-detail__guide">
              <span className="map-detail__guide-icon" aria-hidden="true">
                <Icon name="map" size={26} />
              </span>
              <h2>从任意一个概念开始</h2>
              <p>点击画布中的节点，这里会显示概念定义、所属章节与对应课程。</p>
              <ul className="map-detail__legend">
                <li>
                  <span className="map-detail__legend-line" aria-hidden="true" />
                  连线代表依赖方向
                </li>
                <li>
                  <span className="map-detail__legend-dot" aria-hidden="true" />
                  节点颜色对应所属章节
                </li>
              </ul>
            </div>
          )}
        </aside>
      </div>

      {/* 移动端列表降级 */}
      <div className="map-mobile-list">
        {GROUP_ORDER.map((group) => {
          const nodes = conceptGraph.nodes.filter((node) => node.group === group);
          return (
            <section key={group} className={`map-mobile-group tone-${GROUP_META[group].tone}`}>
              <h2 className="map-mobile-group__title">
                <span className="map-mobile-group__dot" aria-hidden="true" />
                {GROUP_META[group].label}
                <span className="map-mobile-group__count tabular">{nodes.length}</span>
              </h2>
              <ul className="map-mobile-group__list">
                {nodes.map((node) => (
                  <li key={node.id}>
                    <button
                      type="button"
                      className={node.id === selectedId ? 'map-mobile-item is-active' : 'map-mobile-item'}
                      onClick={() => selectNode(node.id)}
                      aria-pressed={node.id === selectedId}
                    >
                      <span className="map-mobile-item__label">{node.label}</span>
                      <span className="map-mobile-item__desc">{node.description}</span>
                      {node.lessonId ? <Icon name="chevron-right" size={14} /> : null}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
