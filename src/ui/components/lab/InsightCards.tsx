import { STDLIB_GROUPS, STDLIB_TRACE_NAMES } from '../../../engine/stdlib';
import type { AnalysisResult, Diagnostic } from '../../../engine/types';
import { SELF_CHECK_ITEMS } from '../../../data/selfcheck';
import { hrefFor, lessonHref } from '../../lib/router';
import { Badge } from '../Badge';
import { Icon } from '../Icon';

/* ----------------------------- 标准库覆盖 ------------------------------ */

export function StdlibCard({ analysis }: { analysis: AnalysisResult }) {
  const used = new Set(analysis.callGraph.externalCalls);
  const traced = [...used].filter((name) => STDLIB_TRACE_NAMES.has(name));
  const staticOnly = [...used].filter(
    (name) => !STDLIB_TRACE_NAMES.has(name) && STDLIB_GROUPS.some((group) => group.entries.some((entry) => entry.name === name)),
  );
  const total = STDLIB_GROUPS.reduce((sum, group) => sum + group.entries.length, 0);

  return (
    <section className="lab-card" aria-labelledby="lab-stdlib-title">
      <header className="lab-card__head">
        <h3 className="lab-card__title" id="lab-stdlib-title">
          标准库覆盖
        </h3>
        <span className="lab-card__count tabular">
          {traced.length} / {used.size} 个可单步执行
        </span>
      </header>
      <p className="lab-card__hint">
        共收录 {total} 个常用函数。本段代码调用的外部函数里，
        <strong className="mono"> {traced.length} </strong> 个可以逐步执行
        {staticOnly.length > 0 ? `，${staticOnly.length} 个只能静态分析（${staticOnly.join('、')}）` : ''}。
      </p>
      <div className="lab-stdlib">
        {STDLIB_GROUPS.map((group) => {
          const hitCount = group.entries.filter((entry) => used.has(entry.name)).length;
          return (
            <details
              className="lab-stdlib__group"
              key={group.id}
              open={hitCount > 0}
            >
              <summary className="lab-stdlib__summary">
                <span className="lab-stdlib__header mono">{group.header}</span>
                <span className="lab-stdlib__title">{group.title}</span>
                {hitCount > 0 ? <Badge tone="teal">本段用到 {hitCount}</Badge> : null}
                <span className="lab-stdlib__count tabular">{group.entries.length}</span>
              </summary>
              <ul className="lab-stdlib__list">
                {group.entries.map((entry) => (
                  <li
                    className={
                      used.has(entry.name) ? 'lab-stdlib__item is-used' : 'lab-stdlib__item'
                    }
                    key={entry.name}
                  >
                    <span className="lab-stdlib__name mono">{entry.name}</span>
                    <span className="lab-stdlib__sig mono">{entry.signature}</span>
                    <span className="lab-stdlib__note">{entry.note}</span>
                    <span
                      className={
                        entry.support === 'trace'
                          ? 'lab-stdlib__tag lab-stdlib__tag--trace'
                          : 'lab-stdlib__tag'
                      }
                    >
                      {entry.support === 'trace' ? '可执行' : '仅静态'}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------ 自查清单 ------------------------------- */

type CheckStatus = 'pass' | 'issue' | 'manual';

const STATUS_META: Record<CheckStatus, { label: string; tone: 'teal' | 'rose' | 'amber' }> = {
  pass: { label: '自动通过', tone: 'teal' },
  issue: { label: '待修', tone: 'rose' },
  manual: { label: '需人工确认', tone: 'amber' },
};

export function SelfCheckCard({ analysis }: { analysis: AnalysisResult }) {
  const diagnostics = analysis.diagnostics;
  const rows = SELF_CHECK_ITEMS.map((item) => {
    const hits: Diagnostic[] = item.rules.length
      ? diagnostics.filter((diagnostic) => item.rules.includes(diagnostic.rule ?? ''))
      : [];
    const status: CheckStatus = item.rules.length === 0 ? 'manual' : hits.length > 0 ? 'issue' : 'pass';
    return { item, hits, status };
  });
  const issueCount = rows.filter((row) => row.status === 'issue').length;
  const manualCount = rows.filter((row) => row.status === 'manual').length;
  const passCount = rows.filter((row) => row.status === 'pass').length;

  return (
    <section className="lab-card" aria-labelledby="lab-selfcheck-title">
      <header className="lab-card__head">
        <h3 className="lab-card__title" id="lab-selfcheck-title">
          自查清单
        </h3>
        <span className="lab-card__count tabular">
          {issueCount === 0 ? `${passCount} 项通过` : `${issueCount} 项待修`}
        </span>
      </header>
      <p className="lab-card__hint">
        初学者最常踩的 {rows.length} 个坑：{passCount} 项由引擎自动核对通过，{manualCount} 项需要你自己看一眼。
      </p>
      <ul className="lab-check">
        {rows.map(({ item, hits, status }) => (
          <li className={`lab-check__item is-${status}`} key={item.id}>
            <span className={`lab-check__box lab-check__box--${status}`} aria-hidden="true">
              {status === 'issue' ? '!' : status === 'manual' ? '?' : '✓'}
            </span>
            <div className="lab-check__body">
              <div className="lab-check__head">
                <span className="lab-check__title">{item.title}</span>
                <Badge tone={STATUS_META[status].tone}>{STATUS_META[status].label}</Badge>
              </div>
              <p className="lab-check__detail">{item.detail}</p>
              {hits.length > 0 ? (
                <p className="lab-check__hits mono">
                  第 {hits.map((hit) => hit.line).join('、')} 行有相关提示
                </p>
              ) : null}
              {item.lessonId ? (
                <a className="lab-check__link" href={lessonHref(item.lessonId)}>
                  复习这一节
                  <Icon name="arrow-right" size={13} />
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <p className="lab-inline-note">
        <Icon name="info" size={14} />
        清单只覆盖常见错误，边界条件仍建议用 n = 0 / n = 1 手算一遍。
        <a className="lab-check__link" href={hrefFor('/map')}>
          查看知识图谱
        </a>
      </p>
    </section>
  );
}
