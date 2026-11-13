import { useState } from 'react';
import type { AnalysisResult, SourceLanguage, TraceResult } from '../../../engine/types';
import { TracePlayer } from '../../viz';
import type { Breakpoint } from '../../viz/traceNav';
import { Badge } from '../Badge';
import { Button } from '../Button';
import { EmptyState } from '../EmptyState';
import { Icon } from '../Icon';

export interface TraceTabProps {
  code: string;
  language: SourceLanguage;
  analysis: AnalysisResult;
  trace: TraceResult | null;
  loading: boolean;
  onRun: (stdin: string) => void;
  breakpoints: Breakpoint[];
  onBreakpointsChange: (next: Breakpoint[]) => void;
  resumeIndexRef: { current: number };
}

function StdinField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="lab-stdin">
      <span className="lab-stdin__label">
        <Icon name="code" size={14} />
        输入数据（可选）
      </span>
      <textarea
        className="lab-stdin__input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        spellCheck={false}
        placeholder={'需要 scanf / cin 时填写，用空格或换行分隔，例如：\n3 5'}
      />
      <span className="lab-stdin__hint">按程序需要的顺序输入，执行时会依次消费。</span>
    </label>
  );
}

/** 实验室「单步执行」：说明 → 运行 → 播放器。 */
export function TraceTab({
  code,
  language,
  analysis,
  trace,
  loading,
  onRun,
  breakpoints,
  onBreakpointsChange,
  resumeIndexRef,
}: TraceTabProps) {
  const [stdin, setStdin] = useState('');
  const [showStdin, setShowStdin] = useState(false);

  const run = (): void => {
    onRun(stdin);
  };

  if (loading) {
    return (
      <div className="lab-trace-state">
        <span className="lab-spinner" aria-hidden="true" />
        <h3>正在执行代码…</h3>
        <p>教学子集会逐句运行，最多记录 20000 步；带类与动态内存的示例也能完整跑完。</p>
      </div>
    );
  }

  if (!trace) {
    return (
      <div className="lab-trace-intro">
        <span className="lab-trace-intro__icon" aria-hidden="true">
          <Icon name="trace" size={28} />
        </span>
        <h3 className="lab-trace-intro__title">单步执行，看清每一行</h3>
        <p className="lab-trace-intro__text">
          教学子集解释器会逐句运行代码，同时展示变量、调用栈与输出。支持声明、运算、循环、分支、函数调用、数组、
          printf / cout、类（单继承与多继承、虚函数与多态调用）、函数模板与类模板、std::vector、std::map / std::set /
          std::pair、stack / queue / priority_queue，以及 new / delete 的堆视图。
        </p>

        <div
          className={
            analysis.interpreterSupported
              ? 'lab-trace-support is-supported'
              : 'lab-trace-support is-limited'
          }
        >
          <Icon name={analysis.interpreterSupported ? 'circle-check' : 'info'} size={16} />
          <span>
            {analysis.interpreterSupported
              ? '这段代码在解释器支持范围内。'
              : analysis.interpreterHint ?? '这段代码可能包含解释器未覆盖的语法，运行时会给出说明。'}
          </span>
        </div>

        <div className="lab-trace-actions">
          <Button variant="primary" icon="play" onClick={run}>
            运行追踪
          </Button>
          <Button
            variant="ghost"
            icon={showStdin ? 'chevron-down' : 'code'}
            onClick={() => setShowStdin((current) => !current)}
            aria-expanded={showStdin}
          >
            {showStdin ? '收起输入' : '需要输入数据？'}
          </Button>
        </div>

        {showStdin ? <StdinField value={stdin} onChange={setStdin} /> : null}

        <p className="lab-trace-intro__note">
          程序会从头执行到结束；遇到死循环会在步数或操作数上限处截断。步数很多时用「步过」跳过函数内部，
          点行号打断点后按 F5 继续，鼠标移到某一行还能「运行到此」。
        </p>
      </div>
    );
  }

  if (!trace.ok || !trace.supported) {
    const error = trace.error;
    const kindLabel =
      error?.kind === 'unsupported'
        ? '语法超出支持范围'
        : error?.kind === 'syntax'
          ? '语法无法解析'
          : error?.kind === 'limit'
            ? '执行被截断'
            : '运行时错误';
    return (
      <div className="lab-trace-error">
        <span className="lab-trace-error__icon" aria-hidden="true">
          <Icon name="warning" size={24} />
        </span>
        <h3 className="lab-trace-error__title">这段代码暂时无法单步执行</h3>
        <p className="lab-trace-error__kind">{kindLabel}</p>
        <p className="lab-trace-error__message">{error?.message ?? '解释器没有返回可用的执行步骤。'}</p>
        {typeof error?.line === 'number' ? (
          <span className="lab-trace-error__line mono">第 {error.line} 行</span>
        ) : null}
        <p className="lab-trace-error__suggestion">
          可以试着把代码简化到解释器子集：基础类型、循环、分支、数组、函数调用与 printf。
        </p>
        <div className="lab-trace-actions">
          <Button variant="primary" icon="reset" onClick={run}>
            重新运行
          </Button>
          <Button
            variant="ghost"
            icon={showStdin ? 'chevron-down' : 'code'}
            onClick={() => setShowStdin((current) => !current)}
            aria-expanded={showStdin}
          >
            {showStdin ? '收起输入' : '输入数据'}
          </Button>
        </div>
        {showStdin ? <StdinField value={stdin} onChange={setStdin} /> : null}
      </div>
    );
  }

  if (trace.steps.length === 0) {
    return (
      <EmptyState
        icon="trace"
        title="没有产生执行步骤"
        description="代码可能只有声明，或在执行前就结束了。检查入口函数与语句后重试。"
        action={
          <Button variant="secondary" icon="reset" onClick={run}>
            重新运行
          </Button>
        }
      />
    );
  }

  return (
    <div className="lab-trace">
      <div className="lab-trace__bar">
        <div className="lab-trace__summary">
          <Badge tone="teal" icon="trace">
            第 1 – {trace.steps.length} 步
          </Badge>
          {trace.truncated ? <Badge tone="amber">已截断</Badge> : null}
          {trace.stdinConsumed ? (
            <span className="lab-trace__stdin mono">已读取输入：{trace.stdinConsumed}</span>
          ) : null}
        </div>
        <div className="lab-trace__actions">
          <Button
            variant="ghost"
            size="sm"
            icon={showStdin ? 'chevron-down' : 'code'}
            onClick={() => setShowStdin((current) => !current)}
            aria-expanded={showStdin}
          >
            {showStdin ? '收起输入' : '输入数据'}
          </Button>
          <Button variant="secondary" size="sm" icon="reset" onClick={run}>
            重新运行
          </Button>
        </div>
      </div>

      {showStdin ? <StdinField value={stdin} onChange={setStdin} /> : null}

      <div className="lab-trace__player">
        <TracePlayer
          code={code}
          trace={trace}
          language={language}
          autoplay={false}
          breakpoints={breakpoints}
          onBreakpointsChange={onBreakpointsChange}
          resumeIndexRef={resumeIndexRef}
        />
      </div>

      {trace.interpreterNote ? <p className="lab-inline-note">{trace.interpreterNote}</p> : null}
    </div>
  );
}
