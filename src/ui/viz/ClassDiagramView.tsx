/**
 * C++ 类图（UML 风格，手写 SVG）
 * ------------------------------------------------------------------
 * - 基类在上、派生类在下：按继承关系做分层（可处理环，环处停止上溯）；
 * - UML 盒子：«class»/«struct» + 类名 + 行号，字段区、方法区，访问符 + - #；
 * - 虚函数斜体并标注 virtual，抽象类类名斜体；继承用空心三角箭头（派生 → 基类）；
 * - 成员行可点击定位源码行，整盒可聚焦并用 Enter/Space 触发。
 * 布局与成员签名格式化见 classLayout.ts。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ClassInfo } from '../../engine/types';
import { truncateText } from './svgUtils';
import { VizEmpty } from './feedback';
import {
  buildClassLayout,
  classMetricsFor,
  fieldSignature,
  methodSignature,
  type Metrics,
  type PlacedBox,
} from './classLayout';

let classUid = 0;

export interface ClassDiagramViewProps {
  classes: ClassInfo[];
  activeLine?: number;
  onSelectLine?: (line: number) => void;
  compact?: boolean;
}

const ACCESS_SYMBOL: Record<string, string> = {
  public: '+',
  private: '-',
  protected: '#',
  default: '~',
};

function accessClass(access: string | undefined): string {
  switch (access) {
    case 'private':
      return 'is-private';
    case 'protected':
      return 'is-protected';
    case 'public':
      return 'is-public';
    default:
      return 'is-default';
  }
}

function ClassBoxView({
  box,
  m,
  activeLine,
  onSelectLine,
}: {
  box: PlacedBox;
  m: Metrics;
  activeLine?: number;
  onSelectLine?: (line: number) => void;
}) {
  const { cls, x, y, w } = box;
  const isAbstract = cls.isAbstract || (cls.methods ?? []).some((method) => method.isPureVirtual);
  const spanEnd = Math.max(cls.span?.endLine ?? cls.line, cls.line);
  const activeClass = activeLine !== undefined && activeLine >= cls.line && activeLine <= spanEnd;
  const contentW = w - 30;
  const accessible = `${cls.kind === 'struct' ? '结构体' : '类'} ${cls.name}，第 ${cls.line} 行，${
    (cls.fields ?? []).length
  } 个字段，${(cls.methods ?? []).length} 个方法${isAbstract ? '，抽象类' : ''}`;

  const activateClass = () => {
    if (cls.line > 0) onSelectLine?.(cls.line);
  };

  return (
    <g
      className={`cvz-class__node${activeClass ? ' is-active' : ''}${isAbstract ? ' is-abstract' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={accessible}
      aria-pressed={activeClass}
      data-line={cls.line}
      onClick={activateClass}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
          event.preventDefault();
          activateClass();
        }
      }}
    >
      <title>{accessible}</title>
      <rect className="cvz-class__hit" x={x - 5} y={y - 5} width={w + 10} height={box.h + 10} rx={17} />
      <rect className="cvz-class__box" x={x} y={y} width={w} height={box.h} rx={12} />
      <rect className="cvz-class__accent" x={x + 1} y={y + 1} width={w - 2} height={4} rx={2} />
      <text className="cvz-class__kind" x={x + 14} y={y + 18} fontSize={m.tagFont}>
        «{cls.kind === 'struct' ? 'struct' : 'class'}»
      </text>
      <text
        className={`cvz-class__name${isAbstract ? ' is-abstract' : ''}`}
        x={x + 14}
        y={y + 37}
        fontSize={m.nameFont}
      >
        {truncateText(cls.name, contentW - 32, m.nameFont)}
      </text>
      <text className="cvz-class__line" x={x + w - 12} y={y + 18} textAnchor="end" fontSize={m.tagFont}>
        L{cls.line}
      </text>
      {box.hasBases ? (
        <text className="cvz-class__bases" x={x + 14} y={y + 38 + m.baseRowH} fontSize={m.tagFont}>
          {truncateText(`: ${(cls.bases ?? []).join(', ')}`, contentW, m.tagFont)}
        </text>
      ) : null}
      <line
        className="cvz-class__divider"
        x1={x}
        y1={y + box.headerH}
        x2={x + w}
        y2={y + box.headerH}
      />

      {box.fieldRows.length === 0 ? (
        <text
          className="cvz-class__empty-row"
          x={x + w / 2}
          y={y + box.fieldsTop + m.fieldRowH * 0.65}
          textAnchor="middle"
          fontSize={m.memberFont}
        >
          无字段
        </text>
      ) : (
        box.fieldRows.map((row) => (
          <MemberRowView
            key={`field-${row.item.name}-${row.item.line}`}
            x={x}
            y={y}
            w={w}
            rowTop={row.rowTop}
            rowH={row.rowH}
            access={row.item.access}
            text={fieldSignature(row.item)}
            line={row.item.line}
            font={m.memberFont}
            onSelectLine={onSelectLine}
            active={activeLine === row.item.line}
            mono
          />
        ))
      )}

      <line
        className="cvz-class__divider"
        x1={x}
        y1={y + box.methodsTop - 6}
        x2={x + w}
        y2={y + box.methodsTop - 6}
      />

      {box.methodRows.length === 0 ? (
        <text
          className="cvz-class__empty-row"
          x={x + w / 2}
          y={y + box.methodsTop + m.methodRowH * 0.65}
          textAnchor="middle"
          fontSize={m.memberFont}
        >
          无成员函数
        </text>
      ) : (
        box.methodRows.map((row) => {
          const isVirtual = Boolean(row.item.isVirtual || row.item.isPureVirtual);
          return (
            <MemberRowView
              key={`method-${row.item.name}-${row.item.line}`}
              x={x}
              y={y}
              w={w}
              rowTop={row.rowTop}
              rowH={row.rowH}
              access={row.item.access}
              text={methodSignature(row.item)}
              line={row.item.line}
              font={m.memberFont}
              onSelectLine={onSelectLine}
              active={activeLine === row.item.line}
              italic={isVirtual}
              badge={isVirtual ? 'virtual' : undefined}
            />
          );
        })
      )}
      <rect className="cvz-class__halo" x={x - 5} y={y - 5} width={w + 10} height={box.h + 10} rx={17} />
    </g>
  );
}

function MemberRowView({
  x,
  y,
  w,
  rowTop,
  rowH,
  access,
  text,
  line,
  font,
  onSelectLine,
  active,
  italic,
  badge,
  mono,
}: {
  x: number;
  y: number;
  w: number;
  rowTop: number;
  rowH: number;
  access: string;
  text: string;
  line: number;
  font: number;
  onSelectLine?: (line: number) => void;
  active?: boolean;
  italic?: boolean;
  badge?: string;
  mono?: boolean;
}) {
  const badgeRoom = badge ? 40 : 0;
  const maxWidth = w - 30 - badgeRoom;
  const clipped = truncateText(text, maxWidth, font);
  const rowCenter = y + rowTop + rowH / 2;
  const clickable = Boolean(onSelectLine) && line > 0;

  return (
    <g
      className={`cvz-class__row${clickable ? ' is-clickable' : ''}${active ? ' is-active' : ''}`}
      onClick={(event) => {
        if (!clickable) return;
        event.stopPropagation();
        onSelectLine?.(line);
      }}
    >
      <title>{`第 ${line} 行：${access} ${text}`}</title>
      <rect
        className="cvz-class__row-bg"
        x={x + 8}
        y={y + rowTop + 1}
        width={w - 16}
        height={rowH - 2}
        rx={4}
      />
      <text
        className={`cvz-class__access ${accessClass(access)}`}
        x={x + 16}
        y={rowCenter + font * 0.35}
        fontSize={font}
      >
        {ACCESS_SYMBOL[access] ?? '~'}
      </text>
      <text
        className={`cvz-class__member${mono ? ' is-mono' : ''}${italic ? ' is-virtual' : ''}`}
        x={x + 30}
        y={rowCenter + font * 0.35}
        fontSize={font}
      >
        {clipped}
      </text>
      {badge ? (
        <text
          className="cvz-class__virtual-badge"
          x={x + w - 14}
          y={rowCenter + font * 0.32}
          textAnchor="end"
          fontSize={font - 1}
        >
          {badge}
        </text>
      ) : null}
    </g>
  );
}

export function ClassDiagramView({ classes, activeLine, onSelectLine, compact = false }: ClassDiagramViewProps) {
  const [uid] = useState(() => `cvz-class-${++classUid}`);
  const m = useMemo(() => classMetricsFor(compact), [compact]);
  const layout = useMemo(() => buildClassLayout(classes, compact), [classes, compact]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [availableWidth, setAvailableWidth] = useState(0);

  // 优先整体缩放到容器宽度；最小 0.75，仍然过宽时允许横向滚动
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const update = () => setAvailableWidth(element.clientWidth);
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const scale =
    availableWidth > 0 && layout.width > 0
      ? Math.min(1, Math.max(0.75, (availableWidth - 24) / layout.width))
      : 1;

  if (!classes || layout.boxes.length === 0) {
    return (
      <div className={`cvz cvz-class${compact ? ' is-compact' : ''}`}>
        <VizEmpty
          compact={compact}
          icon="class"
          title="这段代码还没有定义 class / struct"
          hint="用 class 或 struct 描述一个类型，这里就会画出 UML 类图与继承关系。"
        />
      </div>
    );
  }

  return (
    <div className={`cvz cvz-class${compact ? ' is-compact' : ''}`}>
      <div className="cvz-class__scroll" ref={scrollRef}>
        <div className="cvz-class__inner">
          <svg
            className="cvz-class__svg"
            width={layout.width * scale}
            height={layout.height * scale}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            preserveAspectRatio="xMidYMid meet"
            role="group"
            aria-label={`UML 类图，共 ${layout.boxes.length} 个类${
              scale < 0.999 ? `，已缩放到 ${Math.round(scale * 100)}%` : ''
            }`}
          >
            <defs>
              <marker
                id={`${uid}-inherit`}
                viewBox="0 0 12 10"
                refX="10.5"
                refY="5"
                markerWidth="12"
                markerHeight="10"
                markerUnits="userSpaceOnUse"
                orient="auto-start-reverse"
              >
                <path className="cvz-class__inherit-arrow" d="M0.8 0.8 L10.8 5 L0.8 9.2 Z" />
              </marker>
              <pattern id={`${uid}-dots`} width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="1.2" cy="1.2" r="1" className="cvz-class__dot" />
              </pattern>
            </defs>

            <rect className="cvz-class__canvas" width={layout.width} height={layout.height} />
            <rect
              className="cvz-class__grid"
              width={layout.width}
              height={layout.height}
              fill={`url(#${uid}-dots)`}
            />

            <g className="cvz-class__edges">
              {layout.edges.map((edge, index) => (
                <g key={`${edge.from}->${edge.to}-${index}`}>
                  <path className="cvz-class__inherit" d={edge.path} markerEnd={`url(#${uid}-inherit)`} />
                  <title>{`${edge.from} 继承自 ${edge.to}`}</title>
                </g>
              ))}
            </g>

            <g className="cvz-class__nodes">
              {layout.boxes.map((box) => (
                <ClassBoxView
                  key={box.cls.id || box.cls.name}
                  box={box}
                  m={m}
                  activeLine={activeLine}
                  onSelectLine={onSelectLine}
                />
              ))}
            </g>
          </svg>
        </div>
      </div>

      {!compact ? (
        <div className="cvz-class__legend" aria-label="类图图例">
          <span className="cvz-class__legend-item">
            <span className="cvz-class__legend-symbol" aria-hidden="true">
              +
            </span>
            public
          </span>
          <span className="cvz-class__legend-item">
            <span className="cvz-class__legend-symbol" aria-hidden="true">
              -
            </span>
            private
          </span>
          <span className="cvz-class__legend-item">
            <span className="cvz-class__legend-symbol" aria-hidden="true">
              #
            </span>
            protected
          </span>
          <span className="cvz-class__legend-item">
            <i className="cvz-class__legend-triangle" aria-hidden="true" />
            继承自
          </span>
          <span className="cvz-class__legend-item">
            <i className="cvz-class__legend-italic" aria-hidden="true">
              virtual
            </i>
            虚函数
          </span>
        </div>
      ) : null}
    </div>
  );
}
