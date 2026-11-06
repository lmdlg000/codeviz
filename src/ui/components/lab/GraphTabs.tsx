import { useState } from 'react';
import type { AnalysisResult, Diagnostic } from '../../../engine/types';
import {
  CallGraphView,
  ClassDiagramView,
  DiagnosticsView,
  FlowchartView,
  MemoryView,
} from '../../viz';
import { Badge } from '../Badge';
import { Button } from '../Button';
import { EmptyState } from '../EmptyState';
import { Icon } from '../Icon';

/* ------------------------------- 流程图 -------------------------------- */

export interface FlowTabProps {
  analysis: AnalysisResult;
  code: string;
  selectedFunctionId: string | null;
  onSelectFunction: (functionId: string) => void;
  activeLine: number | null;
  onSelectLine: (line: number) => void;
}

export function FlowTab({
  analysis,
  code,
  selectedFunctionId,
  onSelectFunction,
  activeLine,
  onSelectLine,
}: FlowTabProps) {
  const charts = analysis.flowcharts;
  if (charts.length === 0) {
    return (
      <EmptyState
        icon="flow"
        title="没有可绘制的函数流程图"
        description="这段代码里没有找到带控制流的函数。可以打开一个示例，看看完整的讲解图。"
      />
    );
  }

  const current = charts.find((chart) => chart.functionId === selectedFunctionId) ?? charts[0];
  const snippet = activeLine
    ? code.split(/\r?\n/)[activeLine - 1]?.trim() ?? ''
    : '';

  return (
    <div className="lab-flow">
      <div className="lab-fn-chips" role="group" aria-label="选择函数">
        {charts.map((chart) => (
          <button
            key={chart.functionId}
            type="button"
            className={
              chart.functionId === current.functionId ? 'lab-fn-chip is-active' : 'lab-fn-chip'
            }
            aria-pressed={chart.functionId === current.functionId}
            onClick={() => onSelectFunction(chart.functionId)}
          >
            <span className="mono">{chart.functionName}</span>
            <span className="lab-fn-chip__count tabular">{chart.nodeCount}</span>
          </button>
        ))}
      </div>

      {activeLine ? (
        <div className="lab-code-snippet">
          <span className="lab-code-snippet__line mono tabular">L{activeLine}</span>
          <code className="lab-code-snippet__text">{snippet || '（该行为空）'}</code>
        </div>
      ) : (
        <p className="lab-graph-hint">
          <Icon name="target" size={14} />
          点击图中节点可定位代码行，点击函数标签切换流程图。
        </p>
      )}

      <div className="lab-graph">
        <FlowchartView
          data={current}
          activeLine={activeLine ?? undefined}
          onSelectLine={onSelectLine}
        />
      </div>
    </div>
  );
}

/* ------------------------------- 调用图 -------------------------------- */

const FUNCTION_KIND_LABEL: Record<string, string> = {
  main: '入口函数',
  function: '函数',
  method: '成员函数',
  constructor: '构造函数',
  destructor: '析构函数',
  operator: '运算符重载',
};

export interface CallsTabProps {
  analysis: AnalysisResult;
  onSelectLine: (line: number) => void;
}

export function CallsTab({ analysis, onSelectLine }: CallsTabProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const graph = analysis.callGraph;

  if (graph.nodes.length === 0) {
    return (
      <EmptyState
        icon="call"
        title="没有可展示的调用关系"
        description="这段代码还没有定义函数，或函数之间没有形成调用。"
      />
    );
  }

  const selectedNode = selectedId ? graph.nodes.find((node) => node.id === selectedId) : undefined;
  const selectedFn = selectedId
    ? analysis.functions.find((fn) => fn.id === selectedId || fn.name === selectedNode?.name)
    : undefined;
  const callsFromSelected = selectedNode
    ? graph.edges.filter((edge) => edge.from === selectedNode.id)
    : [];

  const handleSelect = (id: string): void => {
    setSelectedId(id);
    const node = graph.nodes.find((item) => item.id === id);
    const fn = analysis.functions.find((item) => item.id === id || item.name === node?.name);
    if (fn) onSelectLine(fn.span.startLine);
  };

  return (
    <div className="lab-calls">
      <div className="lab-graph lab-graph--calls">
        <CallGraphView graph={graph} activeFunctionId={selectedId ?? undefined} onSelectFunction={handleSelect} />
      </div>

      <aside className="lab-detail-card" aria-label="函数详情">
        <h3 className="lab-detail-card__title">
          {selectedNode ? '函数详情' : '调用图说明'}
        </h3>
        {selectedNode ? (
          <>
            <p className="lab-detail-card__name mono">{selectedFn?.signature ?? selectedNode.name}</p>
            <dl className="lab-detail-list">
              <div>
                <dt>类型</dt>
                <dd>{FUNCTION_KIND_LABEL[selectedNode.kind] ?? selectedNode.kind}</dd>
              </div>
              <div>
                <dt>位置</dt>
                <dd className="tabular">第 {selectedFn?.span.startLine ?? selectedNode.line} 行</dd>
              </div>
              <div>
                <dt>圈复杂度</dt>
                <dd className="tabular">{selectedNode.complexity}</dd>
              </div>
              <div>
                <dt>调用深度</dt>
                <dd className="tabular">{selectedNode.depth}</dd>
              </div>
              <div>
                <dt>直接调用</dt>
                <dd className="tabular">{callsFromSelected.length} 处</dd>
              </div>
            </dl>
            {selectedNode.recursive ? (
              <Badge tone="amber" icon="reset">
                递归函数
              </Badge>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              icon="target"
              block
              onClick={() => {
                if (selectedFn) onSelectLine(selectedFn.span.startLine);
              }}
            >
              在编辑器中定位
            </Button>
          </>
        ) : (
          <p className="lab-detail-card__guide">
            节点代表源码中的函数，箭头表示调用方向。点击任一节点查看签名、复杂度与调用深度，并定位到代码。
          </p>
        )}

        <div className="lab-detail-card__external">
          <span className="lab-detail-card__label">外部函数</span>
          <div className="lab-chip-row">
            {graph.externalCalls.length === 0 ? (
              <span className="muted">没有</span>
            ) : (
              graph.externalCalls.map((name) => (
                <span className="lab-code-chip mono" key={name}>
                  {name}
                </span>
              ))
            )}
          </div>
        </div>

        <div className="lab-legend">
          <span className="lab-legend__item">
            <span className="lab-legend__swatch lab-legend__swatch--indigo" />
            入口
          </span>
          <span className="lab-legend__item">
            <span className="lab-legend__swatch lab-legend__swatch--amber" />
            递归
          </span>
          <span className="lab-legend__item">
            <span className="lab-legend__swatch lab-legend__swatch--line" />
            调用
          </span>
        </div>
      </aside>
    </div>
  );
}

/* -------------------------------- 类图 --------------------------------- */

export interface ClassesTabProps {
  analysis: AnalysisResult;
  activeLine: number | null;
  onSelectLine: (line: number) => void;
}

export function ClassesTab({ analysis, activeLine, onSelectLine }: ClassesTabProps) {
  if (analysis.classes.length === 0) {
    return (
      <EmptyState
        icon="class"
        title="这段代码还没有定义 class / struct"
        description="类图会展示字段、方法、访问控制与继承关系。C++ 示例里的 Rectangle 与 Shape 能直接看到效果。"
      />
    );
  }

  return (
    <div className="lab-classes">
      <p className="lab-graph-hint">
        <Icon name="target" size={14} />
        字段、方法与继承关系按 UML 样式排布，点击成员可定位代码。
      </p>
      <div className="lab-graph">
        <ClassDiagramView classes={analysis.classes} activeLine={activeLine ?? undefined} onSelectLine={onSelectLine} />
      </div>
    </div>
  );
}

/* ------------------------------- 内存布局 ------------------------------- */

export function MemoryTab({ analysis }: { analysis: AnalysisResult }) {
  const { memory } = analysis;
  const hasData = memory.globals.length + memory.stack.length + memory.heap.length > 0;

  if (!hasData) {
    return (
      <EmptyState
        icon="memory"
        title="暂时没有可展示的内存布局"
        description="没有识别到全局变量或局部变量。可以试试包含数组、结构体或指针的示例。"
      />
    );
  }

  return (
    <div className="lab-memory">
      <MemoryView memory={memory} />
      <p className="lab-inline-note lab-inline-note--memory">
        <Icon name="info" size={14} />
        {memory.notes.length > 0
          ? memory.notes.join(' ')
          : '内存按定义静态估算，不是运行期真实地址。'}
      </p>
    </div>
  );
}

/* -------------------------------- 诊断 --------------------------------- */

const SEVERITY_RANK: Record<Diagnostic['severity'], number> = {
  error: 0,
  warning: 1,
  info: 2,
};

const SEVERITY_LABEL: Record<Diagnostic['severity'], string> = {
  error: '错误',
  warning: '警告',
  info: '提示',
};

export function DiagnosticsTab({
  analysis,
  onSelectLine,
}: {
  analysis: AnalysisResult;
  onSelectLine: (line: number) => void;
}) {
  const sorted = [...analysis.diagnostics].sort((a, b) => {
    const rank = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    return rank !== 0 ? rank : a.line - b.line;
  });

  if (sorted.length === 0) {
    return (
      <EmptyState
        icon="circle-check"
        title="很好，没有发现明显问题"
        description="引擎没有报告语法或常见错误。复杂逻辑仍建议补上边界测试，再运行单步执行观察。"
      />
    );
  }

  const counts = {
    error: sorted.filter((item) => item.severity === 'error').length,
    warning: sorted.filter((item) => item.severity === 'warning').length,
    info: sorted.filter((item) => item.severity === 'info').length,
  };

  return (
    <div className="lab-diagnostics">
      <div className="lab-diagnostics__summary" aria-label="诊断统计">
        {(['error', 'warning', 'info'] as const).map((severity) => (
          <span key={severity} className={`lab-severity lab-severity--${severity}`}>
            <span className="lab-severity__dot" aria-hidden="true" />
            {SEVERITY_LABEL[severity]} {counts[severity]}
          </span>
        ))}
        <span className="lab-diagnostics__hint">点击任一条可定位到代码行</span>
      </div>
      <div className="lab-graph lab-graph--diagnostics">
        <DiagnosticsView diagnostics={sorted} onSelectLine={onSelectLine} />
      </div>
    </div>
  );
}
