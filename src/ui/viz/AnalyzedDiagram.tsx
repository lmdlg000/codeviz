/**
 * 一体化图表组件：传入代码，内部完成分析 / 追踪、缓存、函数切换与空状态。
 * ------------------------------------------------------------------
 * 课程内嵌图卡直接使用：
 * - flow：默认展示第一个非 main 函数，可用 functionName 指定，并提供函数 chips；
 * - calls / classes / memory：分别渲染调用图、类图、内存布局；
 * - trace：渲染单步执行播放器（autoplay 可选）。
 * 点击图内元素会在下方显示对应源码片段；外层不再重复标题。
 */
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { CallGraphNode, FunctionInfo, MemoryModel } from '../../engine/types';
import { useAnalysis, useTrace } from './analysisCache';
import { FlowchartView } from './FlowchartView';
import { CallGraphView } from './CallGraphView';
import { ClassDiagramView } from './ClassDiagramView';
import { MemoryView } from './MemoryView';
import { TracePlayer } from './TracePlayer';
import { VizEmpty, VizSnippet } from './feedback';
import { VizIcon } from './icons';

export interface AnalyzedDiagramProps {
  kind: 'flow' | 'calls' | 'classes' | 'memory' | 'trace';
  code: string;
  functionName?: string;
  autoplay?: boolean;
  onOpenLab?: () => void;
  /** 可选扩展：课程内嵌卡片使用紧凑尺寸（契约外新增的可选属性，向后兼容） */
  compact?: boolean;
}

const KIND_HINT: Record<AnalyzedDiagramProps['kind'], string> = {
  flow: '点击节点可定位代码行',
  calls: '点击函数节点查看签名与复杂度',
  classes: '点击类或成员定位代码行',
  memory: '按定义静态估算，非运行期真实地址',
  trace: '空格播放 / 暂停，← → 单步',
};

function memoryIsEmpty(memory: MemoryModel | undefined): boolean {
  if (!memory) return true;
  return (
    (memory.globals?.length ?? 0) === 0 &&
    (memory.stack?.length ?? 0) === 0 &&
    (memory.heap?.length ?? 0) === 0
  );
}

export function AnalyzedDiagram({
  kind,
  code,
  functionName,
  autoplay = false,
  onOpenLab,
  compact = false,
}: AnalyzedDiagramProps) {
  const safeCode = code ?? '';
  const analysis = useAnalysis(safeCode);
  const trace = useTrace(safeCode, undefined, kind === 'trace');

  const [selectedFunctionId, setSelectedFunctionId] = useState<string | null>(null);
  const [selectedLine, setSelectedLine] = useState<number | null>(null);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedFunctionId(null);
    setSelectedLine(null);
    setSelectedCallId(null);
  }, [safeCode, functionName, kind]);

  const flowcharts = analysis.flowcharts ?? [];
  const functions = analysis.functions ?? [];
  const codeLines = useMemo(() => safeCode.replace(/\r\n?/g, '\n').split('\n'), [safeCode]);

  const activeChart = useMemo(() => {
    if (flowcharts.length === 0) return undefined;
    if (selectedFunctionId) {
      const hit = flowcharts.find((chart) => chart.functionId === selectedFunctionId);
      if (hit) return hit;
    }
    if (functionName) {
      const exact = flowcharts.find((chart) => chart.functionName === functionName);
      if (exact) return exact;
      const bySuffix = flowcharts.find(
        (chart) => chart.functionName.split('::').pop() === functionName,
      );
      if (bySuffix) return bySuffix;
    }
    return flowcharts.find((chart) => chart.functionName !== 'main') ?? flowcharts[0];
  }, [flowcharts, selectedFunctionId, functionName]);

  const callNode: CallGraphNode | undefined = useMemo(() => {
    if (!selectedCallId) return undefined;
    return (analysis.callGraph?.nodes ?? []).find((node) => node.id === selectedCallId);
  }, [analysis.callGraph, selectedCallId]);

  const callFunction: FunctionInfo | undefined = useMemo(() => {
    if (!callNode) return undefined;
    return functions.find((fn) => fn.id === callNode.id || fn.name === callNode.name);
  }, [callNode, functions]);

  if (safeCode.trim().length === 0) {
    return (
      <div className={`cvz cvz-diagram${compact ? ' is-compact' : ''}`}>
        <VizEmpty
          compact={compact}
          icon="flask"
          title="还没有可以分析的代码"
          hint="把一段 C/C++ 代码粘贴到实验室，或从课程示例开始。"
          actionLabel={onOpenLab ? '在实验室打开' : undefined}
          onAction={onOpenLab}
        />
      </div>
    );
  }

  const flowEmpty = kind === 'flow' && !activeChart;
  const snippetLine = selectedLine ?? 0;
  const snippetCode = snippetLine > 0 ? (codeLines[snippetLine - 1] ?? '') : '';
  const showSnippet = (kind === 'flow' || kind === 'classes') && snippetLine > 0;

  let body: ReactNode = null;
  switch (kind) {
    case 'flow':
      body = activeChart ? (
        <FlowchartView
          data={activeChart}
          activeLine={selectedLine ?? undefined}
          onSelectLine={setSelectedLine}
          compact={compact}
        />
      ) : (
        <VizEmpty
          compact={compact}
          icon="flow"
          title="这段代码还没有可绘制的流程图"
          hint="在函数里写几条语句或控制结构，这里就会出现流程图。"
          actionLabel={onOpenLab ? '在实验室打开' : undefined}
          onAction={onOpenLab}
        />
      );
      break;
    case 'calls':
      body = (
        <CallGraphView
          graph={analysis.callGraph}
          activeFunctionId={selectedCallId ?? undefined}
          onSelectFunction={(id) => setSelectedCallId(id)}
          compact={compact}
        />
      );
      break;
    case 'classes':
      body = (
        <ClassDiagramView
          classes={analysis.classes ?? []}
          activeLine={selectedLine ?? undefined}
          onSelectLine={setSelectedLine}
          compact={compact}
        />
      );
      break;
    case 'memory':
      body = <MemoryView memory={analysis.memory} compact={compact} showNotes />;
      break;
    case 'trace':
      body = (
        <TracePlayer
          code={safeCode}
          trace={trace}
          language={analysis.language}
          autoplay={autoplay}
          compact={compact}
        />
      );
      break;
    default:
      body = (
        <VizEmpty
          compact={compact}
          icon="sparkle"
          title="未知的图表类型"
          hint="请选择流程图、调用图、类图、内存布局或单步执行。"
        />
      );
  }

  return (
    <div className={`cvz cvz-diagram${compact ? ' is-compact' : ''}`}>
      {kind === 'flow' && flowcharts.length > 1 ? (
        <div className="cvz-diagram__chips" role="group" aria-label="选择要查看的函数">
          {flowcharts.map((chart) => {
            const active = chart.functionId === activeChart?.functionId;
            return (
              <button
                key={chart.functionId}
                type="button"
                className={`cvz-chipbtn${active ? ' is-active' : ''}`}
                aria-pressed={active}
                title={chart.functionName}
                onClick={() => {
                  setSelectedFunctionId(chart.functionId);
                  setSelectedLine(null);
                }}
              >
                {chart.functionName}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="cvz-diagram__body">{body}</div>

      {kind === 'calls' && callNode ? (
        <div className="cvz-diagram__detail" role="status">
          <div className="cvz-diagram__detail-head">
            <code className="cvz-diagram__sig">{callFunction?.signature ?? `${callNode.name}()`}</code>
            {callNode.recursive ? <span className="cvz-chip cvz-chip--amber">递归</span> : null}
            {analysis.callGraph?.roots?.includes(callNode.id) ? (
              <span className="cvz-chip cvz-chip--indigo">入口</span>
            ) : null}
          </div>
          <div className="cvz-diagram__detail-meta">
            第 {callNode.line} 行 · 圈复杂度 {callNode.complexity}
            {callNode.className ? ` · ${callNode.className}` : ''}
            {callNode.kind === 'method' ? ' · 成员函数' : ''}
          </div>
        </div>
      ) : null}

      {showSnippet ? (
        <VizSnippet
          line={snippetLine}
          code={snippetCode}
          label={kind === 'classes' ? '类 / 成员' : activeChart?.functionName}
          onClear={() => setSelectedLine(null)}
        />
      ) : null}

      <div className="cvz-diagram__foot">
        <span className="cvz-diagram__hint">
          {flowEmpty && kind === 'flow' ? '把代码补全后即可生成流程图' : KIND_HINT[kind]}
          {kind === 'memory' && memoryIsEmpty(analysis.memory) ? ' · 暂未识别到变量' : ''}
        </span>
        {onOpenLab ? (
          <button type="button" className="cvz-btn cvz-btn--soft" onClick={onOpenLab}>
            <VizIcon name="flask" size={14} />
            在实验室打开
          </button>
        ) : null}
      </div>
    </div>
  );
}
