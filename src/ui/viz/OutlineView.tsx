/**
 * 结构大纲（可折叠树）
 * ------------------------------------------------------------------
 * 用嵌套列表 + 缩进连接线呈现 AST 摘要：行号 chip、类型图标、详情小字。
 * 默认展开「程序根 + 函数 / 类」以及函数下的直接语句块；
 * activeLine 变化时会自动展开它所在的路径。所有行都是原生 button，键盘可直接操作。
 */
import { useEffect, useMemo, useState } from 'react';
import type { OutlineKind, OutlineNode } from '../../engine/types';
import { VizIcon, type VizIconName } from './icons';
import { VizEmpty } from './feedback';

export interface OutlineViewProps {
  outline: OutlineNode;
  activeLine?: number;
  onSelectLine?: (line: number) => void;
  compact?: boolean;
}

interface KindMeta {
  icon: VizIconName;
  tone: string;
  label: string;
}

const KIND_META: Record<OutlineKind, KindMeta> = {
  program: { icon: 'code', tone: 'indigo', label: '程序' },
  include: { icon: 'file', tone: 'slate', label: '头文件' },
  global: { icon: 'variable', tone: 'sky', label: '全局变量' },
  function: { icon: 'function', tone: 'indigo', label: '函数' },
  class: { icon: 'class', tone: 'violet', label: '类' },
  struct: { icon: 'class', tone: 'violet', label: '结构体' },
  block: { icon: 'code', tone: 'slate', label: '语句块' },
  declaration: { icon: 'variable', tone: 'sky', label: '声明' },
  if: { icon: 'branch', tone: 'amber', label: '分支' },
  loop: { icon: 'loop', tone: 'teal', label: '循环' },
  switch: { icon: 'branch', tone: 'amber', label: '选择' },
  return: { icon: 'return', tone: 'rose', label: '返回' },
  call: { icon: 'call', tone: 'sky', label: '调用' },
  assignment: { icon: 'arrowRight', tone: 'indigo', label: '赋值' },
  other: { icon: 'code', tone: 'slate', label: '其他' },
};

function metaOf(kind: OutlineKind | string): KindMeta {
  return KIND_META[kind as OutlineKind] ?? KIND_META.other;
}

function defaultExpanded(outline: OutlineNode | null | undefined): Set<string> {
  const set = new Set<string>();
  if (!outline) return set;
  set.add(outline.id);
  for (const child of outline.children ?? []) {
    if (child.kind === 'function' || child.kind === 'class' || child.kind === 'struct') {
      set.add(child.id);
      for (const grand of child.children ?? []) {
        if (grand.kind === 'block') set.add(grand.id);
      }
    }
  }
  return set;
}

/** 找到 activeLine 所在的最深节点路径（含自身） */
function findActivePath(node: OutlineNode, activeLine: number, path: string[]): string[] | null {
  const end = Math.max(node.endLine ?? node.line, node.line);
  if (activeLine < node.line || activeLine > end) return null;
  const nextPath = [...path, node.id];
  for (const child of node.children ?? []) {
    const found = findActivePath(child, activeLine, nextPath);
    if (found) return found;
  }
  return nextPath;
}

function countNodes(node: OutlineNode, guard = 0): number {
  if (guard > 200) return 0;
  let total = 1;
  for (const child of node.children ?? []) total += countNodes(child, guard + 1);
  return total;
}

function OutlineRow({
  node,
  expanded,
  hasChildren,
  active,
  compact,
  onToggle,
  onSelectLine,
}: {
  node: OutlineNode;
  expanded: boolean;
  hasChildren: boolean;
  active: boolean;
  compact: boolean;
  onToggle: (id: string) => void;
  onSelectLine?: (line: number) => void;
}) {
  const meta = metaOf(node.kind);
  const clickable = Boolean(onSelectLine) && node.line > 0;
  const accessible = `${meta.label}：${node.label}${node.line > 0 ? `，第 ${node.line} 行` : ''}`;

  return (
    <div
      className={`cvz-outline__row${active ? ' is-active' : ''}${compact ? ' is-compact' : ''}`}
      data-line={node.line}
    >
      <span className="cvz-outline__chevron-slot">
        {hasChildren ? (
          <button
            type="button"
            className={`cvz-outline__chevron${expanded ? ' is-open' : ''}`}
            aria-expanded={expanded}
            aria-label={`${expanded ? '折叠' : '展开'}${node.label}`}
            onClick={() => onToggle(node.id)}
          >
            {compact ? <VizIcon name="chevronRight" size={11} /> : <VizIcon name="chevronRight" size={12} />}
          </button>
        ) : (
          <span className="cvz-outline__chevron-space" aria-hidden="true" />
        )}
      </span>

      {clickable ? (
        <button
          type="button"
          className="cvz-outline__label"
          aria-label={accessible}
          aria-current={active ? 'location' : undefined}
          onClick={() => onSelectLine?.(node.line)}
        >
          <span className={`cvz-outline__icon cvz-outline__icon--${meta.tone}`} aria-hidden="true">
            <VizIcon name={meta.icon} size={compact ? 11 : 12} />
          </span>
          <span className="cvz-outline__text">{node.label}</span>
          {node.detail ? <span className="cvz-outline__detail">{node.detail}</span> : null}
          {node.line > 0 ? <span className="cvz-outline__line">L{node.line}</span> : null}
        </button>
      ) : (
        <span className="cvz-outline__label is-static" title={accessible}>
          <span className={`cvz-outline__icon cvz-outline__icon--${meta.tone}`} aria-hidden="true">
            <VizIcon name={meta.icon} size={compact ? 11 : 12} />
          </span>
          <span className="cvz-outline__text">{node.label}</span>
          {node.detail ? <span className="cvz-outline__detail">{node.detail}</span> : null}
          {node.line > 0 ? <span className="cvz-outline__line">L{node.line}</span> : null}
        </span>
      )}
    </div>
  );
}

function OutlineBranch({
  node,
  depth,
  expanded,
  activeLine,
  compact,
  onToggle,
  onSelectLine,
}: {
  node: OutlineNode;
  depth: number;
  expanded: Set<string>;
  activeLine?: number;
  compact: boolean;
  onToggle: (id: string) => void;
  onSelectLine?: (line: number) => void;
}) {
  const children = node.children ?? [];
  const hasChildren = children.length > 0;
  const open = hasChildren && expanded.has(node.id);
  const nodeEnd = Math.max(node.endLine ?? node.line, node.line);
  const active =
    activeLine !== undefined && activeLine >= node.line && activeLine <= nodeEnd && depth > 0;

  return (
    <li className="cvz-outline__item">
      <OutlineRow
        node={node}
        expanded={open}
        hasChildren={hasChildren}
        active={active}
        compact={compact}
        onToggle={onToggle}
        onSelectLine={onSelectLine}
      />
      {open && depth < 12 ? (
        <ul className="cvz-outline__list">
          {children.map((child) => (
            <OutlineBranch
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              activeLine={activeLine}
              compact={compact}
              onToggle={onToggle}
              onSelectLine={onSelectLine}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function OutlineView({ outline, activeLine, onSelectLine, compact = false }: OutlineViewProps) {
  const initial = useMemo(() => defaultExpanded(outline), [outline]);
  const [expanded, setExpanded] = useState<Set<string>>(initial);

  useEffect(() => {
    setExpanded(initial);
  }, [initial]);

  useEffect(() => {
    if (!outline || activeLine === undefined) return;
    const path = findActivePath(outline, activeLine, []);
    if (!path || path.length === 0) return;
    setExpanded((previous) => {
      let changed = false;
      const next = new Set(previous);
      // 展开当前路径的祖先节点（保留最后一个节点的折叠状态）
      for (let index = 0; index < path.length - 1; index += 1) {
        if (!next.has(path[index])) {
          next.add(path[index]);
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [outline, activeLine]);

  const total = useMemo(() => (outline ? countNodes(outline) : 0), [outline]);

  if (!outline || total === 0 || (outline.children ?? []).length === 0) {
    return (
      <div className={`cvz cvz-outline${compact ? ' is-compact' : ''}`}>
        <VizEmpty
          compact={compact}
          icon="code"
          title="还没有可展示的结构大纲"
          hint="写入 include、全局声明或函数后，这里会按层级列出代码结构。"
        />
      </div>
    );
  }

  const toggle = (id: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className={`cvz cvz-outline${compact ? ' is-compact' : ''}`}>
      <div className="cvz-outline__scroll">
        <ul className="cvz-outline__tree">
          <OutlineBranch
            node={outline}
            depth={0}
            expanded={expanded}
            activeLine={activeLine}
            compact={compact}
            onToggle={toggle}
            onSelectLine={onSelectLine}
          />
        </ul>
      </div>
      {!compact ? (
        <p className="cvz-outline__hint">
          <VizIcon name="target" size={12} />
          点击任意一行可定位源码；展开 / 折叠查看更细的结构。
        </p>
      ) : null}
    </div>
  );
}
