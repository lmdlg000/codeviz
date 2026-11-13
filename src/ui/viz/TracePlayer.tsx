/**
 * 单步执行播放器
 * ------------------------------------------------------------------
 * 左：自研高亮的 C/C++ 代码（React span 渲染，无 innerHTML），当前行高亮 + 自动滚动；
 * 右：步骤描述 / 事件徽章 / 变量监视（变化高亮）/ 调用栈 chips / 输出控制台；
 * 底：首、上一步、播放暂停、下一步、末 + 进度滑块 + 速度 0.5×/1×/2×。
 * compact 模式压缩状态区与控制条；autoplay 与平滑滚动尊重 prefers-reduced-motion。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DataCategory, TraceEvent, TraceResult, TraceStep } from '../../engine/types';
import { guessLanguage, highlightCode } from './codeHighlight';
import { validateCondition } from './breakpointCondition';
import { findLineStep, findNextBreakpoint, findStepOut, findStepOver, type Breakpoint } from './traceNav';
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

/** 超过这个步数就不自动播放，交给用户手动「单步 / 跳到末尾」 */
const AUTOPLAY_MAX_STEPS = 600;

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
  // 几千步的长轨迹不自动播放：否则页面会自己闪好几分钟
  const canAutoplay = Boolean(autoplay) && steps.length > 1 && steps.length <= AUTOPLAY_MAX_STEPS && !reduced;

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  /** 断点：行号 + 可选条件。点到没执行过的行也不会命中，符合直觉。 */
  const [breakpoints, setBreakpoints] = useState<Breakpoint[]>([]);
  /** 断点列表面板（点「断点 N 个」展开，里面可以写条件） */
  const [breakpointPanelOpen, setBreakpointPanelOpen] = useState(false);
  /** 悬停的行：Alt+F9 运行到悬停行时用 */
  const [hoverLine, setHoverLine] = useState<number | undefined>(undefined);
  /** 一次性提示（如「这一行这次执行没经过」） */
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef<number | null>(null);
  /** 停留点历史：大步跳转后可以「回退」到上一个停留位置 */
  const jumpHistory = useRef<number[]>([]);
  const [historySize, setHistorySize] = useState(0);

  const say = (text: string): void => {
    setNotice(text);
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 3200);
  };

  useEffect(
    () => () => {
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    },
    [],
  );

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
    setPlaying(canAutoplay);
    lastLineRef.current = undefined;
    jumpHistory.current = [];
    setHistorySize(0);
  }, [stepsKey, canAutoplay, steps.length]);

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

  /** 大步跳转：先把当前停留点记进历史，「回退」才能一步退回来 */
  const jumpTo = (target: number) => {
    if (steps.length === 0) return;
    const clamped = Math.max(0, Math.min(target, steps.length - 1));
    if (clamped !== currentIndex) {
      jumpHistory.current.push(currentIndex);
      if (jumpHistory.current.length > 60) jumpHistory.current.shift();
      setHistorySize(jumpHistory.current.length);
    }
    goTo(clamped);
  };

  /** 回退：回到上一次跳转前停留的位置 */
  const undoJump = () => {
    const previous = jumpHistory.current.pop();
    setHistorySize(jumpHistory.current.length);
    if (previous === undefined) return;
    goTo(previous);
  };

  const stepBy = (delta: number) => {
    goTo((steps.length > 0 ? Math.min(index, steps.length - 1) : 0) + delta);
  };

  const currentIndex = steps.length > 0 ? Math.min(index, steps.length - 1) : 0;

  /**
   * 步过：跳到「深度不超过当前」的下一个步，也就是把被调函数的内部一次性跑完。
   * 轨迹里每一步都带 depth，所以这一步不用重新执行代码。
   */
  const stepOver = () => {
    const target = findStepOver(steps, currentIndex);
    if (target < 0) {
      say('已经到程序结尾');
      jumpTo(steps.length - 1);
      return;
    }
    jumpTo(target);
  };

  /** 跳出：跳到深度更小的一步，即当前函数返回后的第一行 */
  const stepOut = () => {
    const target = findStepOut(steps, currentIndex);
    if (target < 0) {
      say((current?.depth ?? 0) <= 0 ? '已经在最外层，没有可以跳出的函数' : '后面没有可跳出的位置了');
      return;
    }
    jumpTo(target);
  };

  /** 继续到断点：命中下一个断点就停；没有断点或后面没有了就跑到结尾 */
  const resume = () => {
    if (breakpoints.length === 0) {
      jumpTo(steps.length - 1);
      say('没有设置断点，直接执行到结尾');
      return;
    }
    const target = findNextBreakpoint(steps, currentIndex, breakpoints);
    if (target < 0) {
      jumpTo(steps.length - 1);
      say('后面没有命中的断点了，执行到结尾');
      return;
    }
    jumpTo(target);
    const hit = breakpoints.find((item) => item.line === steps[target].line);
    if (hit?.condition) say(`第 ${hit.line} 行断点命中（${hit.condition}）`);
  };

  /** 运行到指定行：优先向后找；走完了就回到该行最后一次执行的位置 */
  const runToLine = (line: number) => {
    const target = findLineStep(steps, currentIndex, line);
    if (target >= 0) {
      jumpTo(target);
      return;
    }
    say(`第 ${line} 行这次执行没有经过（注释、声明或没走到的分支）`);
  };

  const toggleBreakpoint = (line: number) => {
    setBreakpoints((current) => {
      if (current.some((item) => item.line === line)) {
        return current.filter((item) => item.line !== line);
      }
      return [...current, { line }].sort((left, right) => left.line - right.line);
    });
  };

  const setBreakpointCondition = (line: number, condition: string) => {
    setBreakpoints((current) =>
      current.map((item) => (item.line === line ? { ...item, condition } : item)),
    );
  };

  const breakpointAt = (line: number): Breakpoint | undefined =>
    breakpoints.find((item) => item.line === line);

  /** 断点条件写错时在面板里直接提示，别等到按 F5 才发现不命中 */
  const conditionError = useMemo(() => {
    for (const breakpoint of breakpoints) {
      const error = validateCondition(breakpoint.condition ?? '');
      if (error) return `L${breakpoint.line} ${error}`;
    }
    return null;
  }, [breakpoints]);

  const togglePlay = () => {
    if (steps.length === 0) return;
    if (playing) {
      setPlaying(false);
      return;
    }
    if (index >= steps.length - 1) setIndex(0);
    setPlaying(true);
  };

  /**
   * 快捷键走页面级监听：调试时焦点可能在按钮、代码区或页面上任何地方，
   * 只依赖容器焦点会出现「点了回退按钮之后 F5 就不响应」这种坑。
   * 代码编辑器（CodeMirror）和输入框里不抢键。
   */
  const keyHandlerRef = useRef<(event: KeyboardEvent) => void>(() => {});
  keyHandlerRef.current = (event: KeyboardEvent) => {
    if (steps.length === 0) return;
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName ?? '';
    const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(tag) || Boolean(target?.isContentEditable);
    // 代码编辑器里键盘属于编辑器，全部让行
    if (target?.closest?.('.cm-editor')) return;

    // 功能键不影响打字，输入框（如断点条件）里也照常生效
    if (event.key === 'F5') {
      event.preventDefault();
      resume();
      return;
    }
    if (event.key === 'F10') {
      event.preventDefault();
      stepOver();
      return;
    }
    if (event.key === 'F11') {
      event.preventDefault();
      if (event.shiftKey) stepOut();
      else stepBy(1);
      return;
    }
    if (event.altKey && event.key === 'F9') {
      if (hoverLine !== undefined) {
        event.preventDefault();
        runToLine(hoverLine);
      }
      return;
    }

    // 剩下的是「打字语义」的键：输入框里让给原生行为
    if (inField) return;

    // 按钮、链接上的空格 / 方向键走原生行为
    if (event.key === ' ' || event.key === 'Spacebar') {
      if (/^(BUTTON|A)$/.test(tag)) return;
      event.preventDefault();
      togglePlay();
      return;
    }
    if (event.key === 'ArrowRight') {
      if (/^(BUTTON|A)$/.test(tag)) return;
      event.preventDefault();
      stepBy(1);
      return;
    }
    if (event.key === 'ArrowLeft') {
      if (event.altKey) {
        event.preventDefault();
        undoJump();
        return;
      }
      if (/^(BUTTON|A)$/.test(tag)) return;
      event.preventDefault();
      stepBy(-1);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      undoJump();
    }
  };

  useEffect(() => {
    const listener = (event: KeyboardEvent): void => keyHandlerRef.current(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

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
          <div className="cvz-trace__code-wrap">
          <div className="cvz-trace__code" ref={codeScrollRef} onMouseLeave={() => setHoverLine(undefined)}>
            {highlighted.map((line, lineIndex) => {
              const lineNumber = lineIndex + 1;
              const active = currentLine === lineNumber;
              const hasBreakpoint = breakpointAt(lineNumber);
              return (
                <div
                  key={lineNumber}
                  className={`cvz-trace__line${active ? ' is-active' : ''}${
                    hasBreakpoint ? ' has-bp' : ''
                  }${hasBreakpoint?.condition ? ' has-bp-cond' : ''}`}
                  aria-current={active ? 'step' : undefined}
                  onMouseEnter={() => setHoverLine(lineNumber)}
                  onClick={(event) => {
                    // Alt + 点击某行 = 运行到这一行，习惯与 IDE 的 Alt+F9 一致
                    if (event.altKey) runToLine(lineNumber);
                  }}
                  ref={(node) => {
                    if (node) lineRefs.current.set(lineNumber, node);
                    else lineRefs.current.delete(lineNumber);
                  }}
                >
                  <button
                    type="button"
                    className="cvz-trace__gutter"
                    onClick={() => toggleBreakpoint(lineNumber)}
                    onContextMenu={(event) => {
                      // 右键行号：给这一行加 / 改条件（没断点就先打上）
                      event.preventDefault();
                      if (!hasBreakpoint) toggleBreakpoint(lineNumber);
                      setBreakpointPanelOpen(true);
                    }}
                    aria-label={`${hasBreakpoint ? '取消' : '设置'}第 ${lineNumber} 行的断点`}
                    aria-pressed={Boolean(hasBreakpoint)}
                    title={
                      hasBreakpoint
                        ? hasBreakpoint.condition
                          ? `条件断点：${hasBreakpoint.condition}（右键改条件）`
                          : '取消断点（右键加条件）'
                        : '点击设置断点，右键设置条件断点'
                    }
                  >
                    <i className="cvz-trace__bp" aria-hidden="true" />
                    {lineNumber}
                  </button>
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
          {hoverLine !== undefined ? (
            <div className="cvz-trace__hoverbar" role="group" aria-label={`第 ${hoverLine} 行的操作`}>
              <span className="cvz-trace__hoverbar-line mono">L{hoverLine}</span>
              <button
                type="button"
                className="cvz-jump cvz-jump--mini"
                onClick={() => runToLine(hoverLine)}
                title={`运行到第 ${hoverLine} 行（Alt+F9，或 Alt+点击该行）`}
              >
                <VizIcon name="play" size={9} />
                运行到此
              </button>
              <button
                type="button"
                className="cvz-jump cvz-jump--mini"
                onClick={() => toggleBreakpoint(hoverLine)}
                title={
                  breakpointAt(hoverLine)
                    ? '取消这一行的断点（右键行号可以改条件）'
                    : '在这一行打断点（右键行号可设条件断点）'
                }
              >
                <span className="cvz-trace__bp cvz-trace__bp--inline" aria-hidden="true" />
                {breakpointAt(hoverLine) ? '取消断点' : '打断点'}
              </button>
            </div>
          ) : null}
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

      {/* 导航与控制条吸附在面板底部：长轨迹下状态区再长，也不会把它们顶出视野 */}
      <div className="cvz-trace__dock">
      <div className="cvz-trace__nav">
        <div className="cvz-trace__jumps">
          <button
            type="button"
            className="cvz-jump"
            onClick={undoJump}
            disabled={historySize === 0}
            title="回退到上一次跳转前停留的位置（Ctrl+Z / Alt+←）"
          >
            <VizIcon name="reset" size={12} />
            回退
            <kbd>Ctrl+Z</kbd>
          </button>
          <button
            type="button"
            className="cvz-jump cvz-jump--primary"
            onClick={resume}
            disabled={stepNumber >= steps.length}
            title={
              breakpoints.length > 0
                ? '继续执行到下一个命中的断点（F5）'
                : '当前没有断点：直接执行到程序结尾（F5）'
            }
          >
            <VizIcon name="continue" size={12} />
            {breakpoints.length > 0 ? '继续到断点' : '运行到结束'}
            <kbd>F5</kbd>
          </button>
          <button
            type="button"
            className="cvz-jump"
            onClick={stepOver}
            disabled={stepNumber >= steps.length}
            title="步过：把当前这一行里的函数调用（含成员函数）一次性跑完，停到下一行（F10）"
          >
            <VizIcon name="stepOver" size={12} />
            步过
            <kbd>F10</kbd>
          </button>
          <button
            type="button"
            className="cvz-jump"
            onClick={stepOut}
            disabled={stepNumber >= steps.length || (current?.depth ?? 0) <= 0}
            title="跳出：跑完当前函数，回到调用它的那一行（Shift+F11）"
          >
            <VizIcon name="stepOut" size={12} />
            跳出
            <kbd>⇧F11</kbd>
          </button>
          <button
            type="button"
            className={`cvz-jump cvz-jump--bp${breakpointPanelOpen ? ' is-open' : ''}`}
            onClick={() => setBreakpointPanelOpen((open) => !open)}
            aria-expanded={breakpointPanelOpen}
            title="查看 / 编辑断点，可以给断点加条件（如 i == 10）"
          >
            <span className="cvz-trace__bp cvz-trace__bp--inline" aria-hidden="true" />
            {breakpoints.length > 0 ? `断点 ${breakpoints.length}` : '断点'}
            {breakpoints.some((item) => item.condition) ? (
              <span className="cvz-trace__bp-cond-mark" title="含条件断点">
                条件
              </span>
            ) : null}
          </button>
        </div>
        {notice ? (
          <span className="cvz-trace__notice" role="status">
            {notice}
          </span>
        ) : null}
      </div>

      {breakpointPanelOpen ? (
        <div className="cvz-trace__bp-panel">
          {breakpoints.length === 0 ? (
            <p className="cvz-trace__bp-empty">
              点代码行号就能打断点；右键行号可以直接加条件。按 F5 会跑到下一个命中的断点。
            </p>
          ) : (
            <ul className="cvz-trace__bp-list">
              {breakpoints.map((breakpoint) => (
                <li key={breakpoint.line} className="cvz-trace__bp-row">
                  <button
                    type="button"
                    className="cvz-trace__bp-line"
                    onClick={() => runToLine(breakpoint.line)}
                    title={`运行到第 ${breakpoint.line} 行`}
                  >
                    L{breakpoint.line}
                  </button>
                  <input
                    className="cvz-trace__bp-cond"
                    value={breakpoint.condition ?? ''}
                    placeholder="条件（可选），如 i == 10"
                    spellCheck={false}
                    onChange={(event) => setBreakpointCondition(breakpoint.line, event.target.value)}
                    aria-label={`第 ${breakpoint.line} 行断点的条件`}
                  />
                  <button
                    type="button"
                    className="cvz-trace__bp-remove"
                    onClick={() => toggleBreakpoint(breakpoint.line)}
                    aria-label={`删除第 ${breakpoint.line} 行的断点`}
                    title="删除这个断点"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="cvz-trace__bp-foot">
            {conditionError ? (
              <span className="cvz-trace__bp-error">条件有误：{conditionError}</span>
            ) : (
              <span className="cvz-trace__bp-hint">
                条件支持 == ≠ &lt; &lt;= &gt; &gt;= &amp;&amp; || ! 和括号，变量取自「变量监视」里的名字
              </span>
            )}
            {breakpoints.length > 0 ? (
              <button
                type="button"
                className="cvz-jump cvz-jump--ghost"
                onClick={() => setBreakpoints([])}
                title="清除全部断点"
              >
                清除全部
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

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
    </div>
  );
}
