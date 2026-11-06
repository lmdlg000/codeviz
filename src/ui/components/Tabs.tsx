import { useRef, type KeyboardEvent } from 'react';
import { Icon, type IconName } from './Icon';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  count?: number;
  icon?: IconName;
}

export interface SegmentedTabsProps<T extends string> {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
  className?: string;
  idPrefix?: string;
}

/** 分段式 tabs：方向键 / Home / End 可在选项间移动，选中项才进入 Tab 序列。 */
export function SegmentedTabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  className,
  idPrefix = 'tab',
}: SegmentedTabsProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectAt = (index: number): void => {
    const item = items[index];
    if (!item) return;
    onChange(item.id);
    refs.current[index]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const activeIndex = items.findIndex((item) => item.id === value);
    if (activeIndex < 0) return;
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (activeIndex + 1) % items.length;
    else if (event.key === 'ArrowLeft') nextIndex = (activeIndex - 1 + items.length) % items.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = items.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    selectAt(nextIndex);
  };

  return (
    <div
      className={className ? `segmented ${className}` : 'segmented'}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
    >
      {items.map((item, index) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-${item.id}`}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={selected ? 'segmented__tab is-active' : 'segmented__tab'}
            onClick={() => onChange(item.id)}
          >
            {item.icon ? <Icon name={item.icon} size={15} /> : null}
            <span>{item.label}</span>
            {typeof item.count === 'number' ? (
              <span className="segmented__count tabular">{item.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
