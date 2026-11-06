import type { AnalysisResult } from '../../../engine/types';
import { Badge } from '../Badge';
import { Icon } from '../Icon';
import { ProgressBar } from '../Progress';
import { StatTile } from '../StatTile';
import { SelfCheckCard, StdlibCard } from './InsightCards';

const DIFFICULTY_TONE: Record<AnalysisResult['stats']['difficulty'], 'teal' | 'indigo' | 'amber' | 'rose'> = {
  入门: 'teal',
  基础: 'indigo',
  进阶: 'amber',
  挑战: 'rose',
};

export interface OverviewTabProps {
  analysis: AnalysisResult;
  onInspectFunction: (functionId: string) => void;
}

/** 实验室「概览」：代码画像 + 函数列表 + 调用摘要。 */
export function OverviewTab({ analysis, onInspectFunction }: OverviewTabProps) {
  const { stats, diagnostics, functions, callGraph } = analysis;
  const errorCount = diagnostics.filter((item) => item.severity === 'error').length;
  const warningCount = diagnostics.filter((item) => item.severity === 'warning').length;
  const entryNames = callGraph.roots
    .map((id) => callGraph.nodes.find((node) => node.id === id)?.name)
    .filter((name): name is string => Boolean(name));

  return (
    <div className="lab-overview">
      <div className="lab-stat-grid">
        <StatTile
          label="代码行数"
          value={stats.totalLines}
          hint={`${stats.codeLines} 行有效代码`}
          icon="file"
          tone="indigo"
        />
        <StatTile
          label="函数"
          value={stats.functions}
          hint={`${stats.branches} 个分支 · ${stats.loops} 个循环`}
          icon="call"
          tone="sky"
        />
        <StatTile
          label="循环"
          value={stats.loops}
          hint={`最大嵌套 ${stats.maxNesting} 层`}
          icon="reset"
          tone="teal"
        />
        <StatTile
          label="诊断"
          value={diagnostics.length}
          hint={`${errorCount} 错误 · ${warningCount} 警告`}
          icon="warning"
          tone={diagnostics.length > 0 ? 'amber' : 'rose'}
        />
      </div>

      <section className="lab-card" aria-labelledby="lab-profile-title">
        <header className="lab-card__head">
          <h3 className="lab-card__title" id="lab-profile-title">
            代码画像
          </h3>
          <Badge tone={DIFFICULTY_TONE[stats.difficulty] ?? 'indigo'}>{stats.difficulty}</Badge>
        </header>
        <dl className="lab-metrics">
          <div className="lab-metric">
            <dt>圈复杂度</dt>
            <dd className="tabular">{stats.cyclomaticComplexity}</dd>
          </div>
          <div className="lab-metric">
            <dt>最大嵌套</dt>
            <dd className="tabular">{stats.maxNesting} 层</dd>
          </div>
          <div className="lab-metric">
            <dt>声明</dt>
            <dd className="tabular">{stats.declarations}</dd>
          </div>
          <div className="lab-metric">
            <dt>指针 / 数组</dt>
            <dd className="tabular">
              {stats.pointers} / {stats.arrays}
            </dd>
          </div>
        </dl>
        <ProgressBar
          value={Math.min(stats.cyclomaticComplexity, Math.max(10, stats.cyclomaticComplexity))}
          total={Math.max(10, stats.cyclomaticComplexity)}
          tone="indigo"
          size="sm"
          label={`圈复杂度 ${stats.cyclomaticComplexity}`}
        />
        <p className="lab-card__hint">
          圈复杂度越高，独立路径越多。入门代码通常在 1–4 之间。
        </p>
      </section>

      <section className="lab-card" aria-labelledby="lab-functions-title">
        <header className="lab-card__head">
          <h3 className="lab-card__title" id="lab-functions-title">
            函数列表
          </h3>
          <span className="lab-card__count tabular">{functions.length} 个</span>
        </header>
        {functions.length === 0 ? (
          <p className="lab-empty-line">这段代码里没有识别到函数定义。</p>
        ) : (
          <ul className="lab-function-list">
            {functions.map((fn) => (
              <li key={fn.id}>
                <button
                  type="button"
                  className="lab-function"
                  onClick={() => onInspectFunction(fn.id)}
                  aria-label={`查看函数 ${fn.name} 的流程图`}
                >
                  <span className="lab-function__main">
                    <span className="lab-function__name mono">{fn.name}</span>
                    <span className="lab-function__meta">
                      <span>
                        L{fn.span.startLine}–{fn.span.endLine}
                      </span>
                      <span>·</span>
                      <span>{fn.lineCount} 行</span>
                      {fn.isRecursive ? (
                        <Badge tone="amber" icon="reset">
                          递归
                        </Badge>
                      ) : null}
                    </span>
                  </span>
                  <span className="lab-function__side">
                    <span className="lab-function__complexity tabular">复杂度 {fn.complexity}</span>
                    <Icon name="chevron-right" size={15} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="lab-card" aria-labelledby="lab-calls-title">
        <header className="lab-card__head">
          <h3 className="lab-card__title" id="lab-calls-title">
            调用摘要
          </h3>
        </header>
        <div className="lab-call-summary">
          <div className="lab-call-summary__row">
            <span className="lab-call-summary__label">入口</span>
            <span className="lab-call-summary__value mono">
              {entryNames.length > 0 ? entryNames.join(' / ') : '未找到入口函数'}
            </span>
          </div>
          <div className="lab-call-summary__row">
            <span className="lab-call-summary__label">调用关系</span>
            <span className="lab-call-summary__value tabular">
              {callGraph.nodes.length} 个节点 · {callGraph.edges.length} 条边 · 最大深度{' '}
              {callGraph.maxDepth}
            </span>
          </div>
          <div className="lab-call-summary__row lab-call-summary__row--wrap">
            <span className="lab-call-summary__label">外部函数</span>
            <span className="lab-chip-row">
              {callGraph.externalCalls.length === 0 ? (
                <span className="muted">没有外部调用</span>
              ) : (
                callGraph.externalCalls.map((name) => (
                  <span className="lab-code-chip mono" key={name}>
                    {name}
                  </span>
                ))
              )}
            </span>
          </div>
        </div>
      </section>

      {analysis.parseErrors > 0 ? (
        <p className="lab-inline-note">
          <Icon name="info" size={14} />
          有 {analysis.parseErrors} 处语法未能完整解析，图表可能不包含全部语句。
        </p>
      ) : null}

      <SelfCheckCard analysis={analysis} />

      <StdlibCard analysis={analysis} />

      <p className="lab-inline-note">
        <Icon name="target" size={14} />
        点击函数或图表节点，可以在编辑器中定位对应代码行。
      </p>
    </div>
  );
}
