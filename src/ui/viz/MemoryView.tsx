/**
 * 内存布局示意（手写 SVG）
 * ------------------------------------------------------------------
 * 三段式：全局 / 静态区（sky）、栈区（indigo，每帧一个白盒）、堆区（amber 虚线）。
 * - 变量格显示名称、类型、字节数与值；数组拆成连续格子并标下标；
 * - 指针格用 amber 虚线箭头指向目标变量（目标可在任意区）；
 * - 所有地址与布局都是教学示意，底部注明。
 * 布局计算见 memoryLayout.ts。
 */
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { MemoryModel } from '../../engine/types';
import { truncateText } from './svgUtils';
import { VizEmpty } from './feedback';
import {
  CATEGORY_TONE,
  buildMemoryLayout,
  memoryMetricsFor,
  type CellBox,
  type FrameLayout,
  type Metrics,
  type SectionLayout,
} from './memoryLayout';

let memoryUid = 0;

export interface MemoryViewProps {
  memory: MemoryModel;
  compact?: boolean;
  /**
   * 是否在图形下方展示教学说明（默认 false）。
   * 实验室面板会自行展示 memory.notes，这里默认关闭以避免重复；
   * 课程内的 AnalyzedDiagram 会传 true。
   */
  showNotes?: boolean;
}

function CategoryDot({ tone, x, y }: { tone: string; x: number; y: number }) {
  return <circle className={`cvz-memory__dot cvz-memory__dot--${tone}`} cx={x} cy={y} r={2.8} />;
}

function CellView({ box, m, compact }: { box: CellBox; m: Metrics; compact: boolean }) {
  const { cell, x, y, w, h } = box;
  const tone = CATEGORY_TONE[cell.category] ?? 'slate';
  const name = truncateText(cell.name || '变量', w - 42, m.nameFont);
  const typeText = truncateText(cell.typeText || 'auto', w - 24, m.typeFont);
  const bytesText = `${cell.bytes} B`;
  const valueText = truncateText(cell.value ?? '', w - 24, m.valueFont);
  const pointerText = cell.pointerTarget ? `→ ${cell.pointerTarget}` : '';

  return (
    <g className="cvz-memory__cell" data-cell={cell.name}>
      <title>{`${cell.name}：${cell.typeText}，${cell.bytes} 字节${
        cell.value !== undefined ? `，值 ${cell.value}` : ''
      }`}</title>
      <rect className="cvz-memory__cell-bg" x={x} y={y} width={w} height={h} rx={8} />
      <CategoryDot tone={tone} x={x + 11} y={y + 11} />
      <text className="cvz-memory__name" x={x + 19} y={y + 15} fontSize={m.nameFont}>
        {name}
      </text>
      {!compact ? (
        <text className="cvz-memory__bytes" x={x + w - 8} y={y + 15} textAnchor="end" fontSize={m.smallFont}>
          {bytesText}
        </text>
      ) : null}
      {!compact ? (
        <text className="cvz-memory__type" x={x + 10} y={y + 31} fontSize={m.typeFont}>
          {typeText}
        </text>
      ) : null}
      {box.isArray ? (
        <ArrayBody box={box} m={m} compact={compact} />
      ) : (
        <text
          className={`cvz-memory__value${pointerText ? ' is-pointer' : ''}`}
          x={x + 10}
          y={y + (compact ? 36 : 51)}
          fontSize={m.valueFont}
        >
          {pointerText || valueText || '—'}
        </text>
      )}
    </g>
  );
}

function ArrayBody({ box, m, compact }: { box: CellBox; m: Metrics; compact: boolean }) {
  const { cell } = box;
  const dims = cell.arrayDims?.length ? cell.arrayDims.map((dim) => `[${dim}]`).join('') : '';
  if (box.elems.length === 0) {
    const text = truncateText(
      `${dims || `[${cell.arrayValues?.length ?? 0}]`} 未初始化`,
      box.w - 20,
      m.typeFont,
    );
    return (
      <text
        className="cvz-memory__array-empty"
        x={box.x + 10}
        y={box.y + (compact ? 38 : 46)}
        fontSize={m.typeFont}
      >
        {text}
      </text>
    );
  }
  return (
    <g className="cvz-memory__array">
      {!compact ? (
        <text className="cvz-memory__array-dims" x={box.x + 10} y={box.y + 26} fontSize={m.typeFont}>
          {dims || `${cell.arrayValues?.length ?? 0} 个元素`}
        </text>
      ) : null}
      {box.elems.map((elem) => (
        <g key={elem.index} className="cvz-memory__elem">
          <rect
            className="cvz-memory__elem-bg"
            x={elem.x}
            y={elem.y}
            width={elem.w}
            height={elem.h}
            rx={4}
          />
          <text
            className="cvz-memory__elem-value"
            x={elem.x + elem.w / 2}
            y={elem.y + elem.h * 0.62}
            textAnchor="middle"
            fontSize={m.valueFont - 0.5}
          >
            {truncateText(elem.value, elem.w - 6, m.valueFont - 0.5)}
          </text>
          <text
            className="cvz-memory__elem-index"
            x={elem.x + elem.w / 2}
            y={elem.y + elem.h + 9}
            textAnchor="middle"
            fontSize={7.5}
          >
            {elem.index}
          </text>
        </g>
      ))}
      {box.moreCount > 0 ? (
        <text
          className="cvz-memory__elem-index"
          x={box.x + box.w - 10}
          y={box.y + (compact ? 43 : 47)}
          textAnchor="end"
          fontSize={8}
        >
          +{box.moreCount}
        </text>
      ) : null}
    </g>
  );
}

function FrameView({ frame, m, compact }: { frame: FrameLayout; m: Metrics; compact: boolean }) {
  const { frame: info, x, y, w, h } = frame;
  return (
    <g className="cvz-memory__frame">
      <rect className="cvz-memory__frame-bg" x={x} y={y} width={w} height={h} rx={10} />
      <text className="cvz-memory__frame-name" x={x + 12} y={y + (compact ? 15 : 19)} fontSize={m.nameFont}>
        {info.functionName || '函数'}()
      </text>
      <text
        className="cvz-memory__frame-meta"
        x={x + w - 12}
        y={y + (compact ? 15 : 19)}
        textAnchor="end"
        fontSize={m.smallFont}
      >
        {compact ? `L${info.line}` : `第 ${info.line} 行 · ${frame.bytes} B`}
      </text>
      {frame.emptyText ? (
        <text
          className="cvz-memory__frame-empty"
          x={x + 12}
          y={y + m.frameHeaderH + (compact ? 14 : 18)}
          fontSize={m.typeFont}
        >
          {frame.emptyText}
        </text>
      ) : null}
    </g>
  );
}

function SectionView({
  section,
  m,
  compact,
  children,
}: {
  section: SectionLayout;
  m: Metrics;
  compact: boolean;
  children: ReactNode;
}) {
  return (
    <g className="cvz-memory__section">
      <rect
        className={`cvz-memory__section-bg cvz-memory__section-bg--${section.tone}`}
        x={section.x}
        y={section.y}
        width={section.w}
        height={section.h}
        rx={12}
      />
      <text
        className={`cvz-memory__section-title cvz-memory__section-title--${section.tone}`}
        x={section.x + 14}
        y={section.y + (compact ? 15 : 17)}
        fontSize={compact ? 10 : 11}
      >
        {section.title}
      </text>
      <text
        className="cvz-memory__section-hint"
        x={section.x + 14 + (compact ? 62 : 76)}
        y={section.y + (compact ? 15 : 17)}
        fontSize={compact ? 8 : 9}
      >
        {section.hint}
      </text>
      {!compact && section.bytes > 0 ? (
        <text
          className="cvz-memory__section-bytes"
          x={section.x + section.w - 14}
          y={section.y + 17}
          textAnchor="end"
          fontSize={m.smallFont}
        >
          {section.bytes} B
        </text>
      ) : null}
      {children}
    </g>
  );
}

export function MemoryView({ memory, compact = false, showNotes = false }: MemoryViewProps) {
  const [uid] = useState(() => `cvz-memory-${++memoryUid}`);
  const m = useMemo(() => memoryMetricsFor(compact), [compact]);
  const layout = useMemo(() => buildMemoryLayout(memory, compact), [memory, compact]);

  if (!memory || layout.sections.length === 0) {
    return (
      <div className={`cvz cvz-memory${compact ? ' is-compact' : ''}`}>
        <VizEmpty
          compact={compact}
          icon="memory"
          title="还没有可展示的内存布局"
          hint="声明变量、数组或指针后，这里会按全局区 / 栈区 / 堆区画出它们的存放方式。"
        />
      </div>
    );
  }

  const notes: string[] = [];
  for (const note of memory.notes ?? []) {
    if (note && !notes.includes(note)) notes.push(note);
  }
  const fallbackNote = '地址与布局为教学示意，不是真实运行地址。';

  return (
    <div className={`cvz cvz-memory${compact ? ' is-compact' : ''}`}>
      <div className="cvz-memory__scroll">
        <div className="cvz-memory__inner">
          <svg
            className="cvz-memory__svg"
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            role="img"
            aria-label={`内存布局示意，共 ${layout.cellCount} 个变量/数组`}
          >
            <defs>
              <marker
                id={`${uid}-ptr`}
                viewBox="0 0 8 8"
                refX="6.6"
                refY="4"
                markerWidth="8"
                markerHeight="8"
                markerUnits="userSpaceOnUse"
                orient="auto-start-reverse"
              >
                <path className="cvz-memory__arrow" d="M0.8 0.8 L7 4 L0.8 7.2 Z" />
              </marker>
              <pattern id={`${uid}-dots`} width="22" height="22" patternUnits="userSpaceOnUse">
                <circle cx="1.2" cy="1.2" r="1" className="cvz-memory__dot-bg" />
              </pattern>
            </defs>

            <rect className="cvz-memory__canvas" width={layout.width} height={layout.height} />
            <rect
              className="cvz-memory__grid"
              width={layout.width}
              height={layout.height}
              fill={`url(#${uid}-dots)`}
            />

            {layout.sections.map((section) => (
              <SectionView key={section.kind} section={section} m={m} compact={compact}>
                {section.frames.map((frame) => (
                  <FrameView
                    key={`${frame.frame.functionId}-${frame.y}`}
                    frame={frame}
                    m={m}
                    compact={compact}
                  />
                ))}
                {section.frames.length === 0 && section.emptyText ? (
                  <text
                    className="cvz-memory__section-empty"
                    x={section.x + 14}
                    y={section.y + (compact ? 36 : 44)}
                    fontSize={m.typeFont}
                  >
                    {section.emptyText}
                  </text>
                ) : null}
                {section.cells.map((box) => (
                  <CellView key={`${box.cell.id}-${box.x}-${box.y}`} box={box} m={m} compact={compact} />
                ))}
                {section.frames.flatMap((frame) =>
                  frame.cells.map((box) => (
                    <CellView
                      key={`${frame.frame.functionId}-${box.cell.id}`}
                      box={box}
                      m={m}
                      compact={compact}
                    />
                  )),
                )}
              </SectionView>
            ))}

            <g className="cvz-memory__arrows">
              {layout.arrows.map((arrow, index) => (
                <path
                  key={`${arrow.from}-${arrow.to}-${index}`}
                  className="cvz-memory__ptr"
                  d={arrow.path}
                  markerEnd={`url(#${uid}-ptr)`}
                >
                  <title>{`${arrow.from} 指向 ${arrow.to}`}</title>
                </path>
              ))}
            </g>
          </svg>
        </div>
      </div>

      {showNotes ? (
        <div className="cvz-memory__notes">
          <p className="cvz-memory__note">{fallbackNote}</p>
          {notes
            .filter((note) => note !== fallbackNote)
            .slice(0, 3)
            .map((note) => (
              <p className="cvz-memory__note" key={note}>
                {note}
              </p>
            ))}
        </div>
      ) : null}
    </div>
  );
}
