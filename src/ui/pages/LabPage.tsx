import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { getSample, samples } from '../../data';
import type { CodeSample } from '../../data/types';
import { detectLanguage } from '../../engine';
import type { AnalysisResult, SourceLanguage, TraceResult } from '../../engine/types';
import { analyzeCached, simulateCached } from '../viz/analysisCache';
import { useToast } from '../hooks/useToast';
import {
  FILE_ACCEPT,
  MAX_CODE_LINES,
  countCodeLines,
  loadCodeFile,
} from '../lib/files';
import {
  DEFAULT_LAB_CODE,
  DEFAULT_LAB_FILENAME,
  clearHandoff,
  loadDraft,
  peekHandoff,
  saveDraft,
} from '../lib/lab';
import { PageHeader } from '../layout/PageHeader';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { SamplePicker } from '../components/SamplePicker';
import { LabEditor, type LabEditorHandle } from '../components/lab/LabEditor';
import { LabAnalysisPanel, type LabTab } from '../components/lab/LabAnalysisPanel';

interface InitialState {
  code: string;
  filename: string;
  autoAnalyze: boolean;
  handoff: boolean;
  sampleId: string | null;
}

function sampleFilename(sample: CodeSample): string {
  return `${sample.id}.${sample.language === 'cpp' ? 'cpp' : 'c'}`;
}

function resolveInitial(search: string): InitialState {
  const handoff = peekHandoff();
  if (handoff) {
    return {
      code: handoff.code,
      filename: handoff.filename ?? 'from-lesson.c',
      autoAnalyze: true,
      handoff: true,
      sampleId: null,
    };
  }

  const params = new URLSearchParams(search);
  const sample = getSample(params.get('sample') ?? undefined);
  if (sample) {
    return {
      code: sample.code,
      filename: sampleFilename(sample),
      autoAnalyze: true,
      handoff: false,
      sampleId: sample.id,
    };
  }

  const codeParam = params.get('code');
  if (codeParam && codeParam.trim().length > 0) {
    return {
      code: codeParam,
      filename: params.get('filename') ?? 'pasted.c',
      autoAnalyze: true,
      handoff: false,
      sampleId: null,
    };
  }

  const draft = loadDraft();
  if (draft) {
    return {
      code: draft.code,
      filename: draft.filename,
      autoAnalyze: false,
      handoff: false,
      sampleId: null,
    };
  }

  const firstSample = getSample('bubble-sort') ?? samples[0];
  if (firstSample) {
    return {
      code: firstSample.code,
      filename: sampleFilename(firstSample),
      autoAnalyze: false,
      handoff: false,
      sampleId: firstSample.id,
    };
  }

  return {
    code: DEFAULT_LAB_CODE,
    filename: DEFAULT_LAB_FILENAME,
    autoAnalyze: false,
    handoff: false,
    sampleId: null,
  };
}

export interface LabPageProps {
  /** hash query（不含 ?），来自 App 的当前路由 */
  search: string;
}

export function LabPage({ search }: LabPageProps) {
  const [initial] = useState<InitialState>(() => resolveInitial(search));
  const [code, setCode] = useState(initial.code);
  const [filename, setFilename] = useState(initial.filename);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analyzed, setAnalyzed] = useState<{ code: string; filename: string } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState<LabTab>('overview');
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [flowFunctionId, setFlowFunctionId] = useState<string | null>(null);
  const [trace, setTrace] = useState<TraceResult | null>(null);
  const [traceCode, setTraceCode] = useState<string | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);
  const [sampleOpen, setSampleOpen] = useState(false);

  const editorRef = useRef<LabEditorHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const analysisTimer = useRef<number | null>(null);
  const traceTimer = useRef<number | null>(null);
  const latestSource = useRef({ code, filename });
  latestSource.current = { code, filename };
  const lastSearch = useRef(search);
  const booted = useRef(false);
  const overLimitRef = useRef(false);
  const { pushToast } = useToast();

  const language: SourceLanguage = useMemo(
    () => detectLanguage(code, filename),
    [code, filename],
  );
  const lineCount = useMemo(() => countCodeLines(code), [code]);
  const overLimit = lineCount > MAX_CODE_LINES;

  const runAnalysisOn = useCallback(
    (targetCode: string, targetFilename: string) => {
      if (targetCode.trim().length === 0) {
        pushToast('请先输入或载入一段代码', 'error');
        return;
      }
      const targetLines = countCodeLines(targetCode);
      if (targetLines > MAX_CODE_LINES) {
        pushToast(`代码有 ${targetLines} 行，超过 ${MAX_CODE_LINES} 行上限，请精简后再分析。`, 'error');
        return;
      }

      if (analysisTimer.current !== null) window.clearTimeout(analysisTimer.current);
      setAnalyzing(true);
      setActiveLine(null);
      setTrace(null);
      setTraceCode(null);
      analysisTimer.current = window.setTimeout(() => {
        const result = analyzeCached(targetCode, targetFilename);
        setAnalysis(result);
        setAnalyzed({ code: targetCode, filename: targetFilename });
        setAnalyzing(false);
        setActiveTab('overview');
        setFlowFunctionId((previous) => {
          if (previous && result.flowcharts.some((chart) => chart.functionId === previous)) {
            return previous;
          }
          return result.flowcharts[0]?.functionId ?? null;
        });
        const errors = result.diagnostics.filter((item) => item.severity === 'error').length;
        pushToast(
          errors > 0
            ? `分析完成：${result.functions.length} 个函数，${errors} 个错误`
            : `分析完成：${result.functions.length} 个函数，没有发现错误`,
          errors > 0 ? 'info' : 'success',
        );
      }, 40);
    },
    [pushToast],
  );

  const runTraceOn = useCallback(
    (targetCode: string, stdin: string) => {
      if (targetCode.trim().length === 0) {
        pushToast('请先输入或载入一段代码', 'error');
        return;
      }
      if (countCodeLines(targetCode) > MAX_CODE_LINES) {
        pushToast(`代码超过 ${MAX_CODE_LINES} 行上限，无法运行追踪。`, 'error');
        return;
      }

      if (traceTimer.current !== null) window.clearTimeout(traceTimer.current);
      setActiveTab('trace');
      setTraceLoading(true);
      setTrace(null);
      setTraceCode(null);
      traceTimer.current = window.setTimeout(() => {
        const result = simulateCached(targetCode, stdin.trim().length > 0 ? { stdin } : undefined);
        setTrace(result);
        setTraceCode(targetCode);
        setTraceLoading(false);
        if (!result.ok || !result.supported) {
          pushToast('单步执行未能完成，详情见分析面板', 'error');
        }
      }, 40);
    },
    [pushToast],
  );

  const loadSample = useCallback(
    (sample: CodeSample) => {
      const nextFilename = sampleFilename(sample);
      setCode(sample.code);
      setFilename(nextFilename);
      setActiveLine(null);
      setSampleOpen(false);
      pushToast(`已载入示例「${sample.title}」`, 'success');
      runAnalysisOn(sample.code, nextFilename);
    },
    [pushToast, runAnalysisOn],
  );

  const importFile = useCallback(
    async (file: File) => {
      const result = await loadCodeFile(file);
      if (!result.ok) {
        pushToast(result.message, 'error');
        return;
      }
      setCode(result.code);
      setFilename(result.filename);
      setActiveLine(null);
      pushToast(`已载入 ${result.filename}（${result.lineCount} 行）`, 'success');
      runAnalysisOn(result.code, result.filename);
    },
    [pushToast, runAnalysisOn],
  );

  // 首次挂载：处理课程页交接 / URL 中的示例与代码
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    if (initial.handoff) {
      clearHandoff();
      pushToast('已从课程页载入代码', 'info');
    }
    if (initial.autoAnalyze) {
      runAnalysisOn(initial.code, initial.filename);
    }
    // 只在挂载时执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 同一路由下 query 变化时载入新的示例
  useEffect(() => {
    if (search === lastSearch.current) return;
    lastSearch.current = search;
    const params = new URLSearchParams(search);
    const sample = getSample(params.get('sample') ?? undefined);
    if (sample) {
      loadSample(sample);
      return;
    }
    const codeParam = params.get('code');
    if (codeParam && codeParam.trim().length > 0) {
      const nextFilename = params.get('filename') ?? 'pasted.c';
      setCode(codeParam);
      setFilename(nextFilename);
      setActiveLine(null);
      runAnalysisOn(codeParam, nextFilename);
    }
  }, [search, loadSample, runAnalysisOn]);

  // 草稿：800ms 防抖写入；离开页面时立即保存
  useEffect(() => {
    const timer = window.setTimeout(() => saveDraft(code, filename), 800);
    return () => window.clearTimeout(timer);
  }, [code, filename]);

  useEffect(() => {
    const onPageHide = (): void => saveDraft(latestSource.current.code, latestSource.current.filename);
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, []);

  // 行数超过上限时提示一次
  useEffect(() => {
    if (lineCount > MAX_CODE_LINES && !overLimitRef.current) {
      pushToast(`代码有 ${lineCount} 行，超过 ${MAX_CODE_LINES} 行上限，请精简后再分析。`, 'error');
    }
    overLimitRef.current = lineCount > MAX_CODE_LINES;
  }, [lineCount, pushToast]);

  useEffect(() => {
    return () => {
      if (analysisTimer.current !== null) window.clearTimeout(analysisTimer.current);
      if (traceTimer.current !== null) window.clearTimeout(traceTimer.current);
    };
  }, []);

  const handleCodeChange = useCallback((next: string) => {
    setCode(next);
    setActiveLine(null);
  }, []);

  const handleSelectLine = useCallback((line: number) => {
    setActiveLine(line);
    editorRef.current?.scrollToLine(line);
  }, []);

  const handleQuickTrace = useCallback(() => {
    runTraceOn(code, '');
  }, [code, runTraceOn]);

  const activeTrace = trace && traceCode === code ? trace : null;
  const canAnalyze = code.trim().length > 0 && !overLimit;
  const status = useMemo(() => {
    if (overLimit) return { tone: 'warning', text: `代码超过 ${MAX_CODE_LINES} 行上限，请精简后再分析` };
    if (analyzing) return { tone: 'analyzing', text: '正在分析代码…' };
    if (!analysis) return { tone: 'idle', text: '尚未分析，点击「分析代码」生成视图' };
    if (!analyzed || analyzed.code !== code || analyzed.filename !== filename) {
      return { tone: 'stale', text: '代码已修改 · 重新分析可刷新图表' };
    }
    const errorCount = analysis.diagnostics.filter((item) => item.severity === 'error').length;
    return {
      tone: errorCount > 0 ? 'warning' : 'success',
      text: `已分析 · ${analysis.functions.length} 个函数 · ${errorCount} 个错误`,
    };
  }, [overLimit, analyzing, analysis, analyzed, code, filename]);

  const onFileInput = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void importFile(file);
  };

  return (
    <div className="page page--lab lab-page">
      <PageHeader
        eyebrow="LABORATORY"
        title="代码实验室"
        description={
          <>
            粘贴或上传不超过 {MAX_CODE_LINES} 行的 C/C++ 代码，从流程图、调用图、类图、内存与单步执行等视角拆解它。
            所有分析都在本地浏览器完成。
          </>
        }
        aside={
          <div className="lab-header-actions">
            <Button variant="secondary" icon="grid" onClick={() => setSampleOpen(true)}>
              示例库
            </Button>
            <Button variant="primary" icon="upload" onClick={() => fileInputRef.current?.click()}>
              上传代码
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={FILE_ACCEPT}
              onChange={onFileInput}
              className="lab-file-input"
              aria-label="上传代码文件"
              tabIndex={-1}
            />
          </div>
        }
      />

      <div className="lab-toolbar">
        <div className="lab-file-chip">
          <span className={`lab-file-chip__lang lab-file-chip__lang--${language}`}>
            {language === 'cpp' ? 'C++' : 'C'}
          </span>
          <span className="lab-file-chip__name mono" title={filename}>
            {filename}
          </span>
          <span
            className={
              overLimit ? 'lab-file-chip__lines tabular is-over' : 'lab-file-chip__lines tabular'
            }
          >
            {lineCount} / {MAX_CODE_LINES} 行
          </span>
        </div>

        <div className={`lab-status lab-status--${status.tone}`} role="status" aria-live="polite">
          <span className="lab-status__dot" aria-hidden="true" />
          <span>{status.text}</span>
        </div>

        <div className="lab-toolbar__actions">
          <Button
            variant="secondary"
            icon="play"
            onClick={handleQuickTrace}
            disabled={!canAnalyze}
            title="Ctrl/Cmd + Shift + Enter"
          >
            执行追踪
          </Button>
          <Button
            variant="primary"
            icon="sparkle"
            loading={analyzing}
            disabled={!canAnalyze}
            onClick={() => runAnalysisOn(code, filename)}
            title="Ctrl/Cmd + Enter"
          >
            分析代码
          </Button>
        </div>
      </div>

      <div className="lab-workspace">
        <section className="lab-editor-card" aria-label="代码编辑器">
          <div className="lab-editor-card__head">
            <span className="window-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className="lab-editor-card__file">
              <Icon name="code" size={14} />
              <span className="mono">{filename}</span>
            </span>
            <span className={overLimit ? 'lab-editor-card__count is-over' : 'lab-editor-card__count'}>
              {lineCount} 行
            </span>
          </div>

          <div className="lab-editor-card__body">
            <LabEditor
              ref={editorRef}
              value={code}
              filename={filename}
              language={language}
              onChange={handleCodeChange}
              onAnalyze={() => runAnalysisOn(code, filename)}
              onTrace={handleQuickTrace}
              onDropFile={(file) => void importFile(file)}
              onLimitExceeded={() =>
                pushToast(
                  `粘贴内容会让代码超过 ${MAX_CODE_LINES} 行上限，已拒绝本次输入。`,
                  'error',
                )
              }
            />
          </div>

          <div className="lab-editor-card__foot">
            <span className="lab-editor-card__hint">
              <kbd>Ctrl</kbd>
              <span>+</span>
              <kbd>Enter</kbd>
              <span>分析</span>
            </span>
            <span className="lab-editor-card__hint">
              <Icon name="upload" size={13} />
              支持拖拽 .c / .cpp / .h 文件
            </span>
            <span className="lab-editor-card__draft">
              <Icon name="check" size={12} />
              草稿自动保存
            </span>
          </div>
        </section>

        <LabAnalysisPanel
          analysis={analysis}
          analyzing={analyzing}
          code={code}
          language={language}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          activeLine={activeLine}
          onSelectLine={handleSelectLine}
          onOpenSamplePicker={() => setSampleOpen(true)}
          flowFunctionId={flowFunctionId}
          onFlowFunctionChange={setFlowFunctionId}
          trace={activeTrace}
          traceLoading={traceLoading}
          onRunTrace={(stdin) => runTraceOn(code, stdin)}
        />
      </div>

      <SamplePicker
        open={sampleOpen}
        onClose={() => setSampleOpen(false)}
        samples={samples}
        onSelect={loadSample}
      />
    </div>
  );
}
