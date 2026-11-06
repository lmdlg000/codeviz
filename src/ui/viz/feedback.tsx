/**
 * 可视化组件共用的小反馈件：空状态、代码片段条。
 */
import type { ReactNode } from 'react';
import { VizIcon, type VizIconName } from './icons';

export interface VizEmptyProps {
  title: string;
  hint?: string;
  icon?: VizIconName;
  compact?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  children?: ReactNode;
}

export function VizEmpty({
  title,
  hint,
  icon = 'sparkle',
  compact = false,
  actionLabel,
  onAction,
  children,
}: VizEmptyProps) {
  return (
    <div className={`cvz-empty${compact ? ' is-compact' : ''}`}>
      <span className="cvz-empty__icon" aria-hidden="true">
        <VizIcon name={icon} size={compact ? 24 : 30} />
      </span>
      <p className="cvz-empty__title">{title}</p>
      {hint ? <p className="cvz-empty__hint">{hint}</p> : null}
      {children}
      {actionLabel && onAction ? (
        <button type="button" className="cvz-btn cvz-btn--soft" onClick={onAction}>
          <VizIcon name="flask" size={14} />
          <span>{actionLabel}</span>
        </button>
      ) : null}
    </div>
  );
}

export interface VizSnippetProps {
  line: number;
  code: string;
  label?: string;
  onClear?: () => void;
}

/** 图表节点被选中后，在图表下方展示对应的源码片段（等宽小条）。 */
export function VizSnippet({ line, code, label, onClear }: VizSnippetProps) {
  const text = code.replace(/\s+$/, '');
  return (
    <div className="cvz-snippet" role="status">
      <span className="cvz-snippet__line">L{line}</span>
      <code className="cvz-snippet__code" title={text}>
        {text || '（空行）'}
      </code>
      {label ? <span className="cvz-snippet__label">{label}</span> : null}
      {onClear ? (
        <button type="button" className="cvz-snippet__close" onClick={onClear} aria-label="收起代码片段">
          <VizIcon name="chevronDown" size={13} />
        </button>
      ) : null}
    </div>
  );
}
