import { useMemo, useRef, useState } from 'react';
import type { CodeSample } from '../../data/types';
import { Modal } from './Modal';
import { Badge } from './Badge';
import { EmptyState } from './EmptyState';
import { Icon, type IconName } from './Icon';

const FOCUS_META: Record<CodeSample['focus'], { label: string; icon: IconName }> = {
  flow: { label: '流程图', icon: 'flow' },
  calls: { label: '调用图', icon: 'call' },
  classes: { label: '类图', icon: 'class' },
  memory: { label: '内存', icon: 'memory' },
  trace: { label: '单步执行', icon: 'trace' },
  diagnostics: { label: '代码体检', icon: 'warning' },
};

const LEVEL_LABEL: Record<CodeSample['level'], string> = {
  1: '入门',
  2: '进阶',
  3: '挑战',
};

type LanguageFilter = 'all' | 'c' | 'cpp';

export interface SamplePickerProps {
  open: boolean;
  onClose: () => void;
  samples: CodeSample[];
  onSelect: (sample: CodeSample) => void;
}

/** 示例库：搜索 + 语言筛选 + 标签筛选。 */
export function SamplePicker({ open, onClose, samples, onSelect }: SamplePickerProps) {
  const [query, setQuery] = useState('');
  const [language, setLanguage] = useState<LanguageFilter>('all');
  const [tag, setTag] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const tags = useMemo(() => {
    const counter = new Map<string, number>();
    samples.forEach((sample) => {
      sample.tags.forEach((item) => counter.set(item, (counter.get(item) ?? 0) + 1));
    });
    return [...counter.entries()].sort((a, b) => b[1] - a[1]).map(([item]) => item);
  }, [samples]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return samples.filter((sample) => {
      if (language !== 'all' && sample.language !== language) return false;
      if (tag && !sample.tags.includes(tag)) return false;
      if (!keyword) return true;
      const haystack = [sample.title, sample.description, ...sample.tags].join(' ').toLowerCase();
      return haystack.includes(keyword);
    });
  }, [samples, language, tag, query]);

  const changeLanguage = (next: LanguageFilter): void => {
    setLanguage(next);
    setTag(null);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="示例库"
      subtitle={`挑一段代码，立刻从流程图、调用图、内存等视角拆解它。共 ${samples.length} 个示例。`}
      size="lg"
      initialFocusRef={searchRef}
      className="sample-modal"
    >
      <div className="sample-picker">
        <div className="sample-picker__toolbar">
          <div className="search-field" role="search">
            <Icon name="search" size={16} />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索标题、说明或标签"
              className="search-field__input"
              aria-label="搜索示例"
            />
            {query ? (
              <button
                type="button"
                className="search-field__clear"
                onClick={() => setQuery('')}
                aria-label="清空搜索"
              >
                <Icon name="close" size={14} />
              </button>
            ) : null}
          </div>

          <div className="sample-picker__filters" role="group" aria-label="按语言筛选">
            {(
              [
                ['all', '全部'],
                ['c', 'C'],
                ['cpp', 'C++'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={language === value ? 'filter-chip is-active' : 'filter-chip'}
                aria-pressed={language === value}
                onClick={() => changeLanguage(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {tags.length > 0 ? (
          <div className="sample-picker__tags" role="group" aria-label="按标签筛选">
            <button
              type="button"
              className={tag === null ? 'filter-chip filter-chip--soft is-active' : 'filter-chip filter-chip--soft'}
              aria-pressed={tag === null}
              onClick={() => setTag(null)}
            >
              全部标签
            </button>
            {tags.map((item) => (
              <button
                key={item}
                type="button"
                className={
                  tag === item ? 'filter-chip filter-chip--soft is-active' : 'filter-chip filter-chip--soft'
                }
                aria-pressed={tag === item}
                onClick={() => setTag(tag === item ? null : item)}
              >
                {item}
              </button>
            ))}
          </div>
        ) : null}

        {filtered.length === 0 ? (
          <EmptyState
            compact
            icon="search"
            title="没有找到匹配的示例"
            description="换个关键词，或把语言筛选切回「全部」。"
          />
        ) : (
          <ul className="sample-grid">
            {filtered.map((sample) => {
              const focus = FOCUS_META[sample.focus];
              return (
                <li key={sample.id}>
                  <button
                    type="button"
                    className="sample-card"
                    onClick={() => onSelect(sample)}
                    aria-label={`载入示例：${sample.title}`}
                  >
                    <div className="sample-card__top">
                      <Badge tone={sample.language === 'cpp' ? 'violet' : 'indigo'} mono>
                        {sample.language === 'cpp' ? 'C++' : 'C'}
                      </Badge>
                      <span className="sample-card__level">L{sample.level} · {LEVEL_LABEL[sample.level]}</span>
                    </div>
                    <h3 className="sample-card__title">{sample.title}</h3>
                    <p className="sample-card__desc">{sample.description}</p>
                    <div className="sample-card__foot">
                      <span className="sample-card__focus">
                        <Icon name={focus.icon} size={14} />
                        {focus.label}
                      </span>
                      <span className="sample-card__tags">
                        {sample.tags.slice(0, 3).map((item) => (
                          <span key={item} className="sample-card__tag">
                            {item}
                          </span>
                        ))}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
