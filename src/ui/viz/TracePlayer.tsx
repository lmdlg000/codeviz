/**
 * 单步执行播放器
 * ------------------------------------------------------------------
 * 左：自研高亮的 C/C++ 代码（React span 渲染，无 innerHTML），当前行高亮 + 自动滚动；
 * 右：步骤描述 / 事件徽章 / 变量监视（变化高亮）/ 调用栈 chips / 输出控制台；
 * 底：首、上一步、播放暂停、下一步、末 + 进度滑块 + 速度 0.5×/1×/2×。
 * compact 模式压缩状态区与控制条；autoplay 与平滑滚动尊重 prefers-reduced-motion。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { DataCategory, TraceEvent, TraceResult, TraceStep } from '../../engine/types';
import { guessLanguage, highlightCode } from './codeHighlight';
import { VizIcon } from './icons';
import { VizEmpty } from './feedback';

export interface TracePlayerProps {
  code: string;
  trace: TraceResult;
  language?: 'c' | 'cpp';
  autoplay?: boolean;
  compact?: boolean;
  onLineChange?: (line: number) => void;
}

const EVENT_META: Record<TraceEvent, { label: string; tone: string }> = {
  start: { label: '开始', tone: 'indigo' },
  step: { label: '执行', tone: 'slate' },
  declare: { label: '声明', tone: 'sky' },
  assign: { label: '赋值', tone: 'indigo' },
  branch: { label: '判断', tone: 'amber' },
  loop: { label: '循环', tone: 'teal' },
  call: { label: '调用', tone: 'sky' },
  return: { label: '返回', tone: 'violet' },
  output: { label: '输出', tone: 'rose' },
  break: { label: '中断', tone: 'amber' },
  continue: { label: '继续', tone: 'teal' },
  end: { label: '结束', tone: 'slate' },
  error: { label: '错误', tone: 'danger' },
};

const VAR_TONE: Record<DataCategory, string> = {
  int: 'indigo',
  float: 'sky',
  double: 'sky',
  char: 'amber',
  bool: 'rose',
  void: 'slate',
  string: 'teal',
  pointer: 'violet',
  array: 'teal',
  struct: 'violet',
  class: 'violet',
  unknown: 'slate',
};

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const handleChange = () => setReduced(query.matches);
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);
  return reduced;
}

function safeSteps(trace: TraceResult | null | undefined): TraceStep[] {
  if (!trace || !Array.isArray(trace.steps)) return [];
  return trace.steps.filter((step) => step && typeof step === 'object');
}

export function TracePlayer({
  code,
  trace,
  language,
  autoplay = false,
  compact = false,
  onLineChange,
}: TracePlayerProps) {
  const detected = useMemo<'c' | 'cpp'>(() => language ?? guessLanguage(code ?? ''), [language, code]);
  const highlighted = useMemo(() => highlightCode(code ?? '', detected), [code, detected]);
  const steps = useMemo(() => safeSteps(trace), [trace]);
  const reduced = useReducedMotion();

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const codeScrollRef = useRef<HTMLDivElement | null>(null);
  const outputRef = useRef<HTMLPreElement | null>(null);
  const lineRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const lastLineRef = useRef<number | undefined>(undefined);

  const stepsKey = useMemo(
    () => `${trace?.ok ?? false}|${trace?.error?.message ?? ''}|${steps.length}|${code.length}`,
    [trace, steps.length, code.length],
  );

  // 代码 / 追踪结果变化时回到第一步
  useEffect(() => {
    setIndex(0);
    setPlaying(Boolean(autoplay) && steps.length > 1 && !reduced);
    lastLineRef.current = undefined;
  }, [stepsKey, autoplay, reduced, steps.length]);

  const current = steps.length > 0 ? steps[Math.min(index, steps.length - 1)] : undefined;
  const currentLine = current?.line;

  // 自动播放
  useEffect(() => {
    if (!playing || steps.length === 0) return;
    if (index >= steps.length - 1) {
      setPlaying(false);
      return;
    }
    const delay = Math.round(760 / Math.max(0.5, speed));
    const timer = window.setTimeout(() => {
      setIndex((value) => Math.min(value + 1, steps.length - 1));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [playing, index, speed, steps.length]);

  // 当前行变化通知外层
  useEffect(() => {
    if (currentLine === undefined || currentLine <= 0) return;
    if (lastLineRef.current === currentLine) return;
    lastLineRef.current = currentLine;
    onLineChange?.(currentLine);
  }, [currentLine, onLineChange]);

  // 代码区自动滚动到当前行
  useEffect(() => {
    const container = codeScrollRef.current;
    if (!container || currentLine === undefined) return;
    const row = lineRefs.current.get(currentLine);
    if (!row) return;
    const desired = row.offsetTop - container.clientHeight / 2 + row.clientHeight / 2;
    const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
    const target = Math.max(0, Math.min(desired, maxTop));
    if (Math.abs(container.scrollTop - target) < 2) return;
    if (typeof container.scrollTo === 'function') {
      try {
        container.scrollTo({ top: target, behavior: reduced ? 'auto' : 'smooth' });
      } catch {
        container.scrollTop = target;
      }
    } else {
      container.scrollTop = target;
    }
  }, [currentLine, reduced]);

  // 输出控制台滚动到底部
  useEffect(() => {
    const element = outputRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [current?.stdout, compact]);

  const goTo = (value: number) => {
    setPlaying(false);
    if (steps.length === 0) return;
    setIndex(Math.max(0, Math.min(value, steps.length - 1)));
  };

  const stepBy = (delta: number) => {
    goTo((steps.length > 0 ? Math.min(index, steps.length - 1) : 0) + delta);
  };

  const togglePlay = () => {
    if (steps.length === 0) return;
    if (playing) {
      setPlaying(false);
      return;
    }
    if (index >= steps.length - 1) setIndex(0);
    setPlaying(true);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName ?? '';
    if (/^(BUTTON|INPUT|TEXTAREA|SELECT|A)$/.test(tag)) return;
    if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      togglePlay();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      stepBy(1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      stepBy(-1);
    }
  };

  // ---------- 空 / 不支持状态 ----------
  if (!trace || steps.length === 0) {
    const error = trace?.error;
    const unsupported = trace?.supported === false || Boolean(error);
    const title = unsupported ? '这段代码暂不支持单步执行' : '还没有可播放的执行步骤';
    const hint =
      error?.message ??
      (trace?.interpreterNote ??
        '点击「运行追踪」，把代码一步一步跑起来；也可以先在实验室里换一个简单示例。');
    return (
      <div
        className={`cvz cvz-trace${compact ? ' is-compact' : ''}`}
        role="region"
        aria-label="单步执行播放器"
      >
        <VizEmpty compact={compact} icon="trace" title={title} hint={hint}>
          {error?.line ? <p className="cvz-trace__error-line">第 {error.line} 行</p> : null}
          {unsupported ? (
            <p className="cvz-trace__error-tip">
              建议：把代码简化到变量、分支、循环、函数、数组与 printf 等教学子集内。
            </p>
          ) : null}
        </VizEmpty>
      </div>
    );
  }

  const eventMeta = EVENT_META[current?.event ?? 'step'] ?? EVENT_META.step;
  const vars = current?.vars ?? [];
  const shownVars = compact ? vars.slice(0, 8) : vars;
  const hiddenVars = vars.length - shownVars.length;
  const callStack = current?.callStack ?? [];
  const heap = current?.heap ?? [];
  const liveHeap = heap.filter((block) => !block.freed);
  const heapIssues = trace.heapIssues ?? [];
  const heapLeaks = heapIssues.filter((issue) => issue.kind === 'leak');
  const stdout = current?.stdout ?? '';
  const outputLines = stdout.length === 0 ? 0 : stdout.split('\n').length;
  const stepNumber = Math.min(index, steps.length - 1) + 1;

  return (
    <div
      className={`cvz cvz-trace${compact ? ' is-compact' : ''}`}
      role="region"
      aria-label="单步执行播放器"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {trace.error ? (
        <div className="cvz-trace__banner cvz-trace__banner--error" role="status">
          <VizIcon name="warning" size={14} />
          <span>执行中断：{trace.error.message}</span>
          {trace.error.line ? <span className="cvz-trace__banner-line">L{trace.error.line}</span> : null}
        </div>
      ) : trace.truncated ? (
        <div className="cvz-trace__banner" role="status">
          <VizIcon name="info" size={14} />
          <span>执行步数达到上限，后续步骤已截断。</span>
        </div>
      ) : null}

      <div className="cvz-trace__body">
        <section className="cvz-trace__pane cvz-trace__pane--code" aria-label="源代码">
          <div className="cvz-trace__code-head">
            <span className={`cvz-trace__lang${detected === 'cpp' ? ' is-cpp' : ''}`}>
              {detected === 'cpp' ? 'C++' : 'C'}
            </span>
            <span className="cvz-trace__code-meta">
              {!compact ? (
                <span className="cvz-trace__code-hint" title="代码区支持横向滚动，长行不会丢失">
                  ↔ 长行可横向滚动
                </span>
              ) : null}
              <span className="cvz-trace__code-position">
                {currentLine !== undefined ? `第 ${currentLine} 行` : '等待执行'}
              </span>
            </span>
          </div>
          <div className="cvz-trace__code" ref={codeScrollRef}>
            {highlighted.map((line, lineIndex) => {
              const lineNumber = lineIndex + 1;
              const active = currentLine === lineNumber;
              return (
                <div
                  key={lineNumber}
                  className={`cvz-trace__line${active ? ' is-active' : ''}`}
                  aria-current={active ? 'step' : undefined}
                  ref={(node) => {
                    if (node) lineRefs.current.set(lineNumber, node);
                    else lineRefs.current.delete(lineNumber);
                  }}
                >
                  <span className="cvz-trace__gutter" aria-hidden="true">
                    {lineNumber}
                  </span>
                  <span className="cvz-trace__code-text">
                    {line.tokens.length === 0
                      ? ' '
                      : line.tokens.map((token, tokenIndex) =>
                          token.kind === 'plain' ? (
                            token.text
                          ) : (
                            <span key={tokenIndex} className={`cvz-tok cvz-tok--${token.kind}`}>
                              {token.text}
                            </span>
                          ),
                        )}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="cvz-trace__pane cvz-trace__pane--state" aria-label="执行状态">
          <div className="cvz-trace__step">
            <div className="cvz-trace__step-top">
              <span className={`cvz-badge cvz-badge--${eventMeta.tone}`}>{eventMeta.label}</span>
              {current?.functionName ? (
                <span className="cvz-trace__step-fn">{current.functionName}()</span>
              ) : null}
              <span className="cvz-trace__step-depth">深度 {current?.depth ?? 0}</span>
            </div>
            <p className="cvz-trace__desc">
              {current?.description || '点击播放，观察变量与输出的变化。'}
            </p>
            <div className="cvz-trace__step-meta">
              {current?.conditionResult !== undefined ? (
                <span className={`cvz-trace__cond${current.conditionResult ? ' is-true' : ' is-false'}`}>
                  条件结果：{current.conditionResult ? '真' : '假'}
                </span>
              ) : null}
              {current?.outputChunk ? (
                <span className="cvz-trace__chunk">本步输出：{JSON.stringify(current.outputChunk)}</span>
              ) : null}
            </div>
          </div>

          <div className="cvz-trace__section">
            <div className="cvz-trace__section-head">
              <span>变量监视</span>
              <span className="cvz-trace__count">{vars.length}</span>
            </div>
            {shownVars.length === 0 ? (
              <p className="cvz-trace__muted">当前作用域还没有变量</p>
            ) : (
              <div className="cvz-trace__vars-scroll">
                <table className="cvz-trace__vars">
                  <thead>
                    <tr>
                      <th scope="col">变量</th>
                      <th scope="col" className="cvz-trace__col-type">
                        类型
                      </th>
                      <th scope="col">值</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownVars.map((variable) => (
                      <tr
                        key={`${variable.name}-${stepNumber}`}
                        className={variable.changed ? 'is-changed' : undefined}
                      >
                        <td>
                          <span className="cvz-trace__var-name">
                            <i
                              className={`cvz-trace__var-dot cvz-trace__var-dot--${
                                VAR_TONE[variable.category] ?? 'slate'
                              }`}
                              aria-hidden="true"
                            />
                            {variable.name}
                          </span>
                        </td>
                        <td className="cvz-trace__col-type">{variable.typeText}</td>
                        <td className="cvz-trace__var-value" title={variable.valueText}>
                          {variable.pointerTarget && !variable.valueText.includes('→')
                            ? `→ ${variable.pointerTarget}`
                            : variable.valueText || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {hiddenVars > 0 ? (
                  <p className="cvz-trace__muted">还有 {hiddenVars} 个变量未显示</p>
                ) : null}
              </div>
            )}
          </div>

          <div className="cvz-trace__section">
            <div className="cvz-trace__section-head">
              <span>调用栈</span>
              <span className="cvz-trace__count">{callStack.length}</span>
            </div>
            <div className="cvz-trace__chips">
              {callStack.length === 0 ? (
                <span className="cvz-trace__muted">无</span>
              ) : (
                callStack.map((frame, frameIndex) => (
                  <span
                    key={`${frame.functionName}-${frameIndex}`}
                    className={`cvz-chip cvz-chip--sky${
                      frameIndex === callStack.length - 1 ? ' is-current' : ''
                    }`}
                  >
                    {frame.functionName}()
                    <span className="cvz-chip__meta">L{frame.line}</span>
                  </span>
                ))
              )}
            </div>
          </div>

          {heap.length > 0 ? (
            <div className="cvz-trace__section">
              <div className="cvz-trace__section-head">
                <span>堆</span>
                <span className="cvz-trace__count">
                  {liveHeap.length} 块在用 / 共 {heap.length} 块
                </span>
              </div>
              <div className="cvz-heap">
                {heap.map((block) => (
                  <div
                    className={`cvz-heap__block${block.freed ? ' is-freed' : ''}`}
                    key={block.id}
                  >
                    <div className="cvz-heap__head">
                      <span className="cvz-heap__label">{block.label}</span>
                      <span className="cvz-heap__type">
                        {block.elemType}
                        {block.isArray ? `[${block.length}]` : ''}
                      </span>
                      {block.freed ? (
                        <span className="cvz-heap__state cvz-heap__state--freed">已释放</span>
                      ) : block.owners.length === 0 ? (
                        <span className="cvz-heap__state cvz-heap__state--orphan">无指针引用</span>
                      ) : (
                        <span className="cvz-heap__state">在用</span>
                      )}
                    </div>
                    <div className="cvz-heap__cells" aria-label={`${block.label} 的元素`}>
                      {block.values.map((value, valueIndex) => (
                        <span className="cvz-heap__cell" key={valueIndex}>
                          <span className="cvz-heap__cell-index">{valueIndex}</span>
                          <span className="cvz-heap__cell-value">{value}</span>
                        </span>
                      ))}
                      {block.hidden > 0 ? (
                        <span className="cvz-heap__more">+{block.hidden}</span>
                      ) : null}
                    </div>
                    <div className="cvz-heap__meta">
                      <span className="cvz-heap__line">L{block.line} new</span>
                      <span className="cvz-heap__owners">
                        {block.owners.length > 0 ? `← ${block.owners.join(', ')}` : '没有变量指向它'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="cvz-trace__section cvz-trace__output">
            <div className="cvz-trace__section-head">
              <span>输出</span>
              {current?.outputChunk ? <span className="cvz-trace__new-output">有新输出</span> : null}
            </div>
            {compact ? (
              <details className="cvz-trace__console-details">
                <summary>查看输出（{outputLines} 行）</summary>
                <pre className="cvz-trace__console" ref={outputRef}>
                  {stdout || '（程序还没有输出）'}
                </pre>
              </details>
            ) : (
              <pre className="cvz-trace__console" ref={outputRef}>
                {stdout || '（程序还没有输出）'}
              </pre>
            )}
          </div>
          {heapIssues.length > 0 ? (
            <div className="cvz-trace__section cvz-trace__heap-issues">
              <div className="cvz-trace__section-head">
                <span>堆内存检查</span>
                <span className="cvz-trace__count">
                  {heapLeaks.length > 0 ? `${heapLeaks.length} 处泄漏` : `${heapIssues.length} 条`}
                </span>
              </div>
              <ul className="cvz-heap-issues">
                {heapIssues.map((issue, issueIndex) => (
                  <li
                    className={`cvz-heap-issues__item cvz-heap-issues__item--${issue.kind}`}
                    key={`${issue.kind}-${issueIndex}`}
                  >
                    <span className="cvz-heap-issues__kind">
                      {issue.kind === 'leak'
                        ? '泄漏'
                        : issue.kind === 'double-free'
                          ? '重复释放'
                          : issue.kind === 'use-after-free'
                            ? '释放后使用'
                            : '非法释放'}
                    </span>
                    <span className="cvz-heap-issues__text">{issue.message}</span>
                  </li>
                ))}
              </ul>
              {heapLeaks.length > 0 ? (
                <p className="cvz-heap-issues__hint">
                  程序已经结束，但这些内存还在堆上。C++ 不会自动回收 new 出来的内存，记得配对写 delete。
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

      <div className="cvz-trace__controls">
        <div className="cvz-trace__buttons">
          {!compact ? (
            <button
              type="button"
              className="cvz-iconbtn"
              onClick={() => goTo(0)}
              disabled={stepNumber <= 1}
              aria-label="跳到第一步"
              title="第一步"
            >
              <VizIcon name="skipStart" size={15} />
            </button>
          ) : null}
          <button
            type="button"
            className="cvz-iconbtn"
            onClick={() => stepBy(-1)}
            disabled={stepNumber <= 1}
            aria-label="上一步"
            title="上一步（←）"
          >
            <VizIcon name="stepBack" size={15} />
          </button>
          <button
            type="button"
            className="cvz-iconbtn cvz-iconbtn--primary"
            onClick={togglePlay}
            aria-label={playing ? '暂停' : '播放'}
            aria-pressed={playing}
            title={playing ? '暂停（空格）' : '播放（空格）'}
          >
            <VizIcon name={playing ? 'pause' : 'play'} size={16} />
          </button>
          <button
            type="button"
            className="cvz-iconbtn"
            onClick={() => stepBy(1)}
            disabled={stepNumber >= steps.length}
            aria-label="下一步"
            title="下一步（→）"
          >
            <VizIcon name="stepForward" size={15} />
          </button>
          {!compact ? (
            <button
              type="button"
              className="cvz-iconbtn"
              onClick={() => goTo(steps.length - 1)}
              disabled={stepNumber >= steps.length}
              aria-label="跳到末一步"
              title="最后一步"
            >
              <VizIcon name="skipEnd" size={15} />
            </button>
          ) : null}
        </div>

        <input
          type="range"
          className="cvz-trace__slider"
          min={0}
          max={Math.max(0, steps.length - 1)}
          step={1}
          value={Math.min(index, steps.length - 1)}
          onChange={(event) => goTo(Number(event.target.value))}
          aria-label="执行进度"
        />

        <span className="cvz-trace__counter" aria-live="polite">
          {stepNumber} / {steps.length}
        </span>

        {!compact ? (
          <div className="cvz-trace__speed" role="group" aria-label="播放速度">
            {[0.5, 1, 2].map((value) => (
              <button
                key={value}
                type="button"
                className={`cvz-trace__speed-btn${speed === value ? ' is-active' : ''}`}
                onClick={() => setSpeed(value)}
                aria-pressed={speed === value}
              >
                {value}×
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
