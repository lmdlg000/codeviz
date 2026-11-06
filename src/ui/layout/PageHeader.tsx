import type { ReactNode } from 'react';

export interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
  className?: string;
}

/** 普通页面统一的页头：eyebrow + 标题 + 说明 + 操作区。 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  aside,
  className,
}: PageHeaderProps) {
  const classes = ['page-header'];
  if (aside) classes.push('page-header--with-aside');
  if (className) classes.push(className);
  return (
    <header className={classes.join(' ')}>
      <div className="page-header__main">
        <span className="eyebrow">
          <span className="eyebrow__dot" aria-hidden="true" />
          {eyebrow}
        </span>
        <h1 className="page-header__title">{title}</h1>
        {description ? <p className="page-header__description">{description}</p> : null}
        {actions ? <div className="page-header__actions">{actions}</div> : null}
      </div>
      {aside ? <div className="page-header__aside">{aside}</div> : null}
    </header>
  );
}
