import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/** 代码 → 图的空状态插图（纯 SVG，无外链）。 */
export function CodeToDiagramArt() {
  return (
    <svg
      className="empty-state__art-svg"
      viewBox="0 0 180 116"
      width="180"
      height="116"
      fill="none"
      aria-hidden="true"
    >
      <rect x="6" y="10" width="70" height="82" rx="10" className="art-code-frame" />
      <path d="M18 28h28M18 40h40M18 52h22M18 64h32" className="art-code-line" />
      <rect x="104" y="20" width="66" height="24" rx="7" className="art-node art-node--indigo" />
      <rect x="118" y="62" width="52" height="24" rx="7" className="art-node art-node--teal" />
      <path d="M76 40h20" className="art-arrow" />
      <path d="M86 7v86" className="art-arrow art-arrow--dashed" />
      <path d="m80 36 6 6-6 6" className="art-arrow" />
      <circle cx="86" cy="52" r="3" className="art-dot" />
      <path d="M86 80v-6" className="art-arrow" />
      <rect x="30" y="100" width="120" height="10" rx="5" className="art-base" />
    </svg>
  );
}

export interface EmptyStateProps {
  icon?: IconName;
  art?: ReactNode;
  /** 关闭默认插图区域（例如外层已经提供了大插图） */
  showArt?: boolean;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}

export function EmptyState({
  icon = 'sparkle',
  art,
  showArt = true,
  title,
  description,
  action,
  compact = false,
  className,
}: EmptyStateProps) {
  const classes = ['empty-state'];
  if (compact) classes.push('empty-state--compact');
  if (className) classes.push(className);
  return (
    <div className={classes.join(' ')}>
      {showArt ? (
        <div className="empty-state__art" aria-hidden="true">
          {art ?? (
            <span className="empty-state__icon">
              <Icon name={icon} size={30} />
            </span>
          )}
        </div>
      ) : null}
      <h3 className="empty-state__title">{title}</h3>
      {description ? <p className="empty-state__description">{description}</p> : null}
      {action ? <div className="empty-state__action">{action}</div> : null}
    </div>
  );
}
