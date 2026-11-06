/**
 * CodeViz 可视化组件公共入口
 * ------------------------------------------------------------------
 * 契约见 docs/CONTRACTS.md 第 5 节；视觉规范见 docs/DESIGN_BRIEF.md 第 8 节。
 * ui-dev 只从本文件导入，组件实现可独立演进而不改变这些入口。
 *
 * 组件：
 * - AnalyzedDiagram：代码 → 自动分析 → 六种视图之一（含函数切换 / 空错状态 / 在实验室打开）
 * - FlowchartView / CallGraphView / ClassDiagramView / MemoryView / OutlineView
 * - TracePlayer / DiagnosticsView
 * 工具：
 * - useAnalysis / useTrace / analyzeCached / simulateCached：按 code 缓存的分析入口
 */
import './viz.css';

export { AnalyzedDiagram } from './AnalyzedDiagram';
export type { AnalyzedDiagramProps } from './AnalyzedDiagram';
export { FlowchartView } from './FlowchartView';
export type { FlowchartViewProps } from './FlowchartView';
export { CallGraphView } from './CallGraphView';
export type { CallGraphViewProps } from './CallGraphView';
export { ClassDiagramView } from './ClassDiagramView';
export type { ClassDiagramViewProps } from './ClassDiagramView';
export { MemoryView } from './MemoryView';
export type { MemoryViewProps } from './MemoryView';
export { OutlineView } from './OutlineView';
export type { OutlineViewProps } from './OutlineView';
export { TracePlayer } from './TracePlayer';
export type { TracePlayerProps } from './TracePlayer';
export { DiagnosticsView } from './DiagnosticsView';
export type { DiagnosticsViewProps } from './DiagnosticsView';

export {
  analyzeCached,
  simulateCached,
  useAnalysis,
  useTrace,
  clearVizCaches,
  VIZ_CACHE_LIMITS,
} from './analysisCache';
