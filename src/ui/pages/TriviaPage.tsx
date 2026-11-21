import { useState } from 'react';
import { PageHeader } from '../layout/PageHeader';
import { SiteFooter } from '../layout/Footer';
import { Badge } from '../components/Badge';
import { ButtonLink } from '../components/Button';
import { Card } from '../components/Card';
import { CodeBlock } from '../components/CodeBlock';
import { Icon } from '../components/Icon';
import { hrefFor } from '../lib/router';
import { TRIVIA_ITEMS, type TriviaItem, type TriviaTone } from '../../data/trivia';

const TONE_LABEL: Record<TriviaTone, string> = {
  amber: '冷门',
  rose: '不支持',
  sky: '进阶',
  violet: '工程向',
};

function TriviaCard({ item, index }: { item: TriviaItem; index: number }) {
  return (
    <Card tone={item.tone} className="trivia-card" padded={false}>
      <div className="trivia-card__head">
        <span className="trivia-card__index" aria-hidden="true">
          {String(index + 1).padStart(2, '0')}
        </span>
        <div className="trivia-card__title-group">
          <h3 className="trivia-card__title">{item.title}</h3>
          <p className="trivia-card__teaser">{item.teaser}</p>
        </div>
        <Badge tone={item.tone === 'rose' ? 'rose' : item.tone === 'amber' ? 'amber' : 'sky'}>
          {TONE_LABEL[item.tone]}
        </Badge>
      </div>

      <div className="trivia-card__tags">
        {item.tags.map((tag) => (
          <span key={tag} className="trivia-card__tag">
            {tag}
          </span>
        ))}
      </div>

      <CodeBlock
        code={item.code}
        language={item.language}
        title={item.language === 'cpp' ? 'snippet.cpp' : 'snippet.c'}
        compact
        maxHeight={280}
      />

      <div className="trivia-card__body">
        <p>{item.explain}</p>
        <div className="trivia-card__why">
          <Icon name="flask" size={15} />
          <span>
            <strong>实验室为什么不做：</strong>
            {item.whyNot}
          </span>
        </div>
        <div className="trivia-card__local">
          <Icon name="play" size={15} />
          <span>
            <strong>本机验证：</strong>
            {item.local}
          </span>
        </div>
        {item.catch ? (
          <div className="trivia-card__catch">
            <Icon name="lightbulb" size={15} />
            <span>
              <strong>考点 / 坑：</strong>
              {item.catch}
            </span>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

export function TriviaPage() {
  const [filter, setFilter] = useState<TriviaTone | 'all'>('all');
  const items =
    filter === 'all' ? TRIVIA_ITEMS : TRIVIA_ITEMS.filter((item) => item.tone === filter);
  const filters: Array<{ value: TriviaTone | 'all'; label: string }> = [
    { value: 'all', label: `全部 ${TRIVIA_ITEMS.length}` },
    { value: 'rose', label: '不支持' },
    { value: 'amber', label: '冷门' },
    { value: 'sky', label: '进阶' },
    { value: 'violet', label: '工程向' },
  ];

  return (
    <div className="page trivia-page">
      <PageHeader
        eyebrow="BEYOND THE SYLLABUS"
        title="趣谈：那些教程没讲、实验室也不跑的操作"
        description="考试里偶尔冒出来、教材一笔带过、工程上天天见的写法。这里把它们收在一起，说清楚为什么教学解释器不模拟，以及你在自己电脑上怎么验证。"
        actions={
          <div className="trivia-hero-actions">
            <ButtonLink href={hrefFor('/learn')} variant="secondary" icon="book">
              回到教程
            </ButtonLink>
            <ButtonLink href={hrefFor('/lab')} variant="primary" icon="flask">
              打开实验室
            </ButtonLink>
          </div>
        }
      />

      <div className="trivia-notice">
        <Icon name="info" size={17} />
        <span>
          这些代码只用于阅读和本机编译验证。粘进实验室会收到<strong>明确的不支持提示</strong>
          ——这是刻意的，不会假装跑出一个结果。
        </span>
      </div>

      <div className="trivia-filters" role="group" aria-label="按类别筛选">
        {filters.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`trivia-filter${filter === option.value ? ' is-active' : ''}`}
            onClick={() => setFilter(option.value)}
            aria-pressed={filter === option.value}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="trivia-grid">
        {items.map((item) => (
          <TriviaCard key={item.id} item={item} index={TRIVIA_ITEMS.indexOf(item)} />
        ))}
      </div>

      <SiteFooter />
    </div>
  );
}
