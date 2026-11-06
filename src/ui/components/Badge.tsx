import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export type BadgeTone =
  | 'neutral'
  | 'indigo'
  | 'teal'
  | 'amber'
  | 'rose'
  | 'sky'
  | 'violet'
  | 'success'
  | 'danger';

export interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  /** 等宽小字（语言、行号等） */
  mono?: boolean;
  icon?: IconName;
  dot?: boolean;
  className?: string;
  title?: string;
}

export function Badge({ children, tone = 'neutral', mono, icon, dot, className, title }: BadgeProps) {
  const classes = ['badge', `badge--${tone}`];
  if (mono) classes.push('badge--mono');
  if (className) classes.push(className);
  return (
    <span className={classes.join(' ')} title={title}>
      {dot ? <span className="badge__dot" aria-hidden="true" /> : null}
      {icon ? <Icon name={icon} size={13} /> : null}
      {children}
    </span>
  );
}
