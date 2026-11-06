import type { HTMLAttributes, ReactNode } from 'react';

export type CardTone = 'default' | 'indigo' | 'teal' | 'amber' | 'rose' | 'sky' | 'violet';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  tone?: CardTone;
  interactive?: boolean;
  padded?: boolean;
}

export function Card({
  children,
  tone = 'default',
  interactive = false,
  padded = true,
  className,
  ...rest
}: CardProps) {
  const classes = ['card', `card--${tone}`];
  if (padded) classes.push('card--padded');
  if (interactive) classes.push('card--interactive');
  if (className) classes.push(className);
  return (
    <div className={classes.join(' ')} {...rest}>
      {children}
    </div>
  );
}
