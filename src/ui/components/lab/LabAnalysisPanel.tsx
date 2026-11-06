import type { AnalysisResult, SourceLanguage, TraceResult } from '../../../engine/types';
import { SegmentedTabs, type TabItem } from '../Tabs';
import { Button } from '../Button';
import { EmptyState, CodeToDiagramArt } from '../EmptyState';
import { ClassesTab, CallsTab, DiagnosticsTab, FlowTab, MemoryTab } from './GraphTabs';
import { OverviewTab } from './OverviewTab';
import { TraceTab } from './TraceTab';

export type LabTab =
  | 'overview'
  | 'flow'
  | 'calls'
  | 'classes'
  | 'memory'
  | 'trace'
  | 'diagnostics';

export interface LabAnalysisPanelProps {
  analysis: AnalysisResult | null;
  analyzing: boolean;
  code: string;
  language: SourceLanguage;
  activeTab: LabTab;
  onTabChange: (tab: LabTab) => void;
  activeLine: number | null;
  onSelectLine: (line: number) => void;
  onOpenSamplePicker: () => void;
  flowFunctionId: string | null;
  onFlowFunctionChange: (functionId: string) => void;
  trace: TraceResult | null;
  traceLoading: boolean;
  onRunTrace: (stdin: string) => void;
}

function AnalysisEmpty({ onOpenSamplePicker }: { onOpenSamplePicker: () => void }) {
  return (
    <div className="lab-panel-empty">
      <CodeToDiagramArt />
      <EmptyState
        compact
        showArt={false}
        title="分析结果会出现在这里"
        description="点击工具栏的「分析代码」，一次生成概览、流程图、调用图、类图、内存与诊断六种视图。"
        action={
          <>
            <Button variant="secondary" icon="grid" onClick={onOpenSamplePicker}>
              载入一个示例
            </Button>
            <p className="lab-shortcut-hint">
              <kbd>Ctrl</kbd>
              <span>+</span>
              <kbd>Enter</kbd>
              <span>快速分析</span>
            </p>
          </>
        }
      />
    </div>
  );
}

/** 实验室右侧分析面板：分段 tabs + 六类视图。 */
export function LabAnalysisPanel({
  analysis,
  analyzing,
  code,
  language,
  activeTab,
  onTabChange,
  activeLine,
  onSelectLine,
  onOpenSamplePicker,
  flowFunctionId,
  onFlowFunctionChange,
  trace,
  traceLoading,
  onRunTrace,
}: LabAnalysisPanelProps) {
  const tabs: Array<TabItem<LabTab>> = analysis
    ? [
        { id: 'overview', label: '概览', icon: 'grid' },
        { id: 'flow', label: '流程图', icon: 'flow', count: analysis.flowcharts.length },
        { id: 'calls', label: '调用图', icon: 'call', count: analysis.callGraph.nodes.length },
        { id: 'classes', label: '类图', icon: 'class', count: analysis.classes.length },
        { id: 'memory', label: '内存', icon: 'memory' },
        { id: 'trace', label: '单步执行', icon: 'trace' },
        { id: 'diagnostics', label: '诊断', icon: 'warning', count: analysis.diagnostics.length },
      ]
    : [];

  const currentTab = tabs.some((tab) => tab.id === activeTab) ? activeTab : 'overview';

  return (
    <section className="lab-panel" aria-label="代码分析结果">
      {analysis ? (
        <div className="lab-panel__tabs">
          <SegmentedTabs
            items={tabs}
            value={currentTab}
            onChange={onTabChange}
            ariaLabel="分析视图"
            idPrefix="lab-tab"
          />
        </div>
      ) : null}

      <div
        className="lab-panel__content"
        role={analysis ? 'tabpanel' : undefined}
        id={analysis ? `lab-panel-${currentTab}` : undefined}
        aria-labelledby={analysis ? `lab-tab-${currentTab}` : undefined}
      >
        {analyzing ? (
          <div className="lab-panel-loading" role="status">
            <span className="lab-spinner" aria-hidden="true" />
            <p>正在分析代码…</p>
          </div>
        ) : !analysis ? (
          <AnalysisEmpty onOpenSamplePicker={onOpenSamplePicker} />
        ) : currentTab === 'overview' ? (
          <OverviewTab
            analysis={analysis}
            onInspectFunction={(functionId) => {
              onFlowFunctionChange(functionId);
              onTabChange('flow');
            }}
          />
        ) : currentTab === 'flow' ? (
          <FlowTab
            analysis={analysis}
            code={code}
            selectedFunctionId={flowFunctionId}
            onSelectFunction={onFlowFunctionChange}
            activeLine={activeLine}
            onSelectLine={onSelectLine}
          />
        ) : currentTab === 'calls' ? (
          <CallsTab analysis={analysis} onSelectLine={onSelectLine} />
        ) : currentTab === 'classes' ? (
          <ClassesTab analysis={analysis} activeLine={activeLine} onSelectLine={onSelectLine} />
        ) : currentTab === 'memory' ? (
          <MemoryTab analysis={analysis} />
        ) : currentTab === 'trace' ? (
          <TraceTab
            code={code}
            language={language}
            analysis={analysis}
            trace={trace}
            loading={traceLoading}
            onRun={onRunTrace}
          />
        ) : (
          <DiagnosticsTab analysis={analysis} onSelectLine={onSelectLine} />
        )}
      </div>
    </section>
  );
}
