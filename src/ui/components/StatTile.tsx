import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export type StatTone = 'indigo' | 'teal' | 'amber' | 'rose' | 'sky' | 'violet';

export interface StatTileProps {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: IconName;
  tone?: StatTone;
  className?: string;
}

/** 实验室概览里的统计小卡。 */
export function StatTile({ label, value, hint, icon, tone = 'indigo', className }: StatTileProps) {
  const classes = ['stat-tile', `stat-tile--${tone}`];
  if (className) classes.push(className);
  return (
    <div className={classes.join(' ')}>
      <div className="stat-tile__top">
        <span className="stat-tile__label">{label}</span>
        {icon ? (
          <span className="stat-tile__icon" aria-hidden="true">
            <Icon name={icon} size={16} />
          </span>
        ) : null}
      </div>
      <div className="stat-tile__value tabular">{value}</div>
      {hint ? <div className="stat-tile__hint">{hint}</div> : null}
    </div>
  );
}
