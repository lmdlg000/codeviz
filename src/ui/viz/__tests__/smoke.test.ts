/**
 * 临时冒烟测试（验证后删除，不随仓库交付）。
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type {
  CallGraph,
  ClassInfo,
  Diagnostic,
  FlowchartData,
  MemoryModel,
  OutlineNode,
  TraceResult,
} from '../../../engine/types';
import { layoutFlowchart } from '../flowLayout';
import { highlightCode, guessLanguage } from '../codeHighlight';
import { analyzeCode, simulate } from '../../../engine';
import {
  CallGraphView,
  ClassDiagramView,
  DiagnosticsView,
  FlowchartView,
  MemoryView,
  OutlineView,
  TracePlayer,
  AnalyzedDiagram,
} from '../index';

const flow: FlowchartData = {
  functionId: 'fn_main',
  functionName: 'main',
  nodeCount: 12,
  entry: {
    id: 'b0',
    kind: 'block',
    line: 1,
    label: '函数体',
    children: [
      { id: 's', kind: 'start', line: 3, label: '开始' },
      { id: 'p1', kind: 'process', line: 4, label: 'int sum = 0' },
      {
        id: 'd1',
        kind: 'decision',
        line: 5,
        label: 'i < n?',
        condition: 'i < n',
        yes: {
          id: 'yb',
          kind: 'block',
          line: 6,
          label: '是分支',
          children: [
            { id: 'p2', kind: 'process', line: 6, label: 'sum = sum + i' },
            {
              id: 'lp',
              kind: 'loop',
              line: 7,
              label: 'i++',
              condition: 'i < n',
              loopKind: 'for',
              body: {
                id: 'lb',
                kind: 'block',
                line: 8,
                label: '循环体',
                children: [{ id: 'p3', kind: 'call', line: 8, label: '调用 printf', callName: 'printf' }],
              },
            },
            { id: 'r1', kind: 'output', line: 9, label: '输出 sum' },
          ],
        },
        no: {
          id: 'nb',
          kind: 'block',
          line: 10,
          label: '否分支',
          children: [{ id: 'sw', kind: 'switch', line: 10, label: 'switch 选择', cases: [
            { label: '1', line: 11, body: { id: 'cb1', kind: 'block', line: 11, label: '', children: [{ id: 'c1', kind: 'process', line: 11, label: '结果为 1' }, { id: 'br1', kind: 'break', line: 11, label: 'break' }] } },
            { label: 'default', line: 12, isDefault: true, body: { id: 'cb2', kind: 'block', line: 12, label: '', children: [{ id: 'c2', kind: 'return', line: 12, label: 'return 0' }] } },
          ] }],
        },
      },
      { id: 'loop2', kind: 'loop', line: 13, label: '倒计时', condition: 'n > 0', loopKind: 'while', body: { id: 'lb2', kind: 'block', line: 14, label: '', children: [{ id: 'p4', kind: 'input', line: 14, label: '输入 n' }] } },
      { id: 'loop3', kind: 'loop', line: 15, label: '至少执行一次', condition: 'x > 0', loopKind: 'do', testAfter: true, body: { id: 'lb3', kind: 'block', line: 16, label: '', children: [{ id: 'p5', kind: 'process', line: 16, label: 'x = x - 1' }] } },
      { id: 'e', kind: 'end', line: 17, label: '结束' },
    ],
  },
};

const callGraph: CallGraph = {
  nodes: [
    { id: 'fn_main', name: 'main', kind: 'main', line: 3, recursive: false, external: false, complexity: 4, depth: 0 },
    { id: 'fn_fact', name: 'factorial', kind: 'function', line: 10, recursive: true, external: false, complexity: 2, depth: 1 },
    { id: 'fn_helper', name: 'helper', kind: 'function', line: 20, recursive: false, external: false, complexity: 1, depth: 1 },
    { id: 'fn_deep', name: 'Rectangle::area', kind: 'method', className: 'Rectangle', line: 30, recursive: false, external: false, complexity: 3, depth: 2 },
  ],
  edges: [
    { from: 'fn_main', to: 'fn_fact', line: 5, count: 2 },
    { from: 'fn_fact', to: 'fn_fact', line: 11, count: 1 },
    { from: 'fn_main', to: 'fn_helper', line: 6, count: 1 },
    { from: 'fn_helper', to: 'fn_main', line: 21, count: 1 },
    { from: 'fn_helper', to: 'fn_deep', line: 22, count: 3 },
  ],
  roots: ['fn_main'],
  hasRecursion: true,
  externalCalls: ['printf', 'sqrt'],
  maxDepth: 2,
};

const classes: ClassInfo[] = [
  {
    id: 'cls_shape',
    name: 'Shape',
    kind: 'class',
    bases: [],
    fields: [{ name: 'name', typeText: 'std::string', category: 'string', access: 'protected', line: 3, isStatic: false, isConst: false }],
    methods: [
      { name: 'area', signature: 'double area() const', returnType: 'double', access: 'public', line: 5, kind: 'method', isVirtual: true, isPureVirtual: true, isConst: true, params: [] },
      { name: '~Shape', signature: '~Shape()', returnType: 'void', access: 'public', line: 6, kind: 'destructor', isVirtual: true, params: [] },
    ],
    line: 2,
    span: { startLine: 2, startColumn: 1, endLine: 7, endColumn: 2 },
    isAbstract: true,
  },
  {
    id: 'cls_circle',
    name: 'Circle',
    kind: 'class',
    bases: ['Shape'],
    fields: [{ name: 'r', typeText: 'double', category: 'double', access: 'private', line: 11, isStatic: false, isConst: false }],
    methods: [
      { name: 'Circle', signature: 'Circle(double r)', returnType: 'void', access: 'public', line: 13, kind: 'constructor', params: [{ name: 'r', typeText: 'double', category: 'double', isPointer: false, isReference: false, line: 13 }] },
      { name: 'area', signature: 'double area() const override', returnType: 'double', access: 'public', line: 14, kind: 'method', isVirtual: true, isConst: true, params: [] },
    ],
    line: 10,
    span: { startLine: 10, startColumn: 1, endLine: 16, endColumn: 2 },
    isAbstract: false,
  },
];

const memory: MemoryModel = {
  globals: [
    { id: 'g1', name: 'count', typeText: 'int', category: 'int', bytes: 4, value: '3', line: 3 },
  ],
  stack: [
    {
      functionId: 'fn_main',
      functionName: 'main',
      line: 12,
      cells: [
        { id: 's1', name: 'sum', typeText: 'int', category: 'int', bytes: 4, value: '42', line: 13 },
        { id: 's2', name: 'a', typeText: 'int[4]', category: 'array', bytes: 16, arrayDims: [4], arrayValues: ['1', '2', '3', '4'], line: 14 },
        { id: 's3', name: 'p', typeText: 'int *', category: 'pointer', bytes: 8, value: '0x1000', pointerTarget: 'sum', line: 15 },
      ],
    },
  ],
  heap: [
    { id: 'h1', name: 'node', typeText: 'Node *', category: 'pointer', bytes: 8, value: '0x2000', line: 20 },
  ],
  notes: ['地址为教学示意。'],
  totalBytes: 28,
};

const outline: OutlineNode = {
  id: 'root',
  kind: 'program',
  label: '程序',
  line: 1,
  children: [
    { id: 'inc', kind: 'include', label: '#include <stdio.h>', line: 1 },
    {
      id: 'fn',
      kind: 'function',
      label: 'main',
      detail: 'int main()',
      line: 3,
      endLine: 20,
      children: [
        {
          id: 'blk',
          kind: 'block',
          label: '函数体',
          line: 4,
          endLine: 20,
          children: [
            { id: 'decl', kind: 'declaration', label: 'int sum = 0', line: 4 },
            {
              id: 'lp',
              kind: 'loop',
              label: 'for (int i = 0; i < n; i++)',
              line: 5,
              endLine: 8,
              children: [{ id: 'as', kind: 'assignment', label: 'sum += i', line: 6 }],
            },
            { id: 'ret', kind: 'return', label: 'return 0', line: 19 },
          ],
        },
      ],
    },
  ],
};

const trace: TraceResult = {
  ok: true,
  supported: true,
  steps: [
    {
      index: 0,
      line: 3,
      functionName: 'main',
      depth: 0,
      event: 'start',
      description: '程序开始执行',
      vars: [],
      callStack: [{ functionName: 'main', line: 3 }],
      stdout: '',
    },
    {
      index: 1,
      line: 4,
      functionName: 'main',
      depth: 0,
      event: 'declare',
      description: '声明变量 sum，初值为 0',
      vars: [{ name: 'sum', typeText: 'int', valueText: '0', category: 'int', changed: true }],
      callStack: [{ functionName: 'main', line: 4 }],
      stdout: '',
    },
    {
      index: 2,
      line: 5,
      functionName: 'main',
      depth: 0,
      event: 'branch',
      description: '判断 i < n，结果为真',
      vars: [{ name: 'sum', typeText: 'int', valueText: '0', category: 'int', changed: false }],
      callStack: [{ functionName: 'main', line: 5 }],
      stdout: '',
      conditionResult: true,
    },
    {
      index: 3,
      line: 6,
      functionName: 'main',
      depth: 0,
      event: 'output',
      description: '输出 sum = 0',
      vars: [{ name: 'sum', typeText: 'int', valueText: '0', category: 'int', changed: false }],
      callStack: [{ functionName: 'main', line: 6 }],
      stdout: 'sum = 0\n',
      outputChunk: 'sum = 0\n',
    },
    {
      index: 4,
      line: 20,
      functionName: 'main',
      depth: 0,
      event: 'end',
      description: '程序结束',
      vars: [],
      callStack: [],
      stdout: 'sum = 0\n',
    },
  ],
  output: 'sum = 0\n',
  truncated: false,
  maxSteps: 3000,
};

const code = `#include <stdio.h>

int main() {
  int sum = 0; // 累计和
  for (int i = 0; i < 5; i++) {
    sum += i;
    printf("%d\\n", sum);
  }
  return 0;
}
`;

const diagnostics: Diagnostic[] = [
  { severity: 'warning', message: 'if 条件里误用了赋值', hint: '应写成 x == 0', line: 5, rule: 'assign-in-condition' },
  { severity: 'error', message: '缺少分号', hint: '在第 6 行末尾补上 ;', line: 6, rule: 'missing-semicolon' },
  { severity: 'info', message: '未使用的局部变量 temp', line: 9, rule: 'unused-variable' },
];

function render(element: ReturnType<typeof createElement>): string {
  const markup = renderToStaticMarkup(element);
  expect(markup).not.toContain('NaN');
  expect(markup).not.toContain('Infinity');
  return markup;
}

describe('viz 冒烟测试', () => {
  it('highlights C/C++ tokens', () => {
    const lang = guessLanguage(code);
    expect(lang).toBe('c');
    const lines = highlightCode(code, lang);
    expect(lines.length).toBe(code.split('\n').length);
    expect(lines[0].tokens[0].kind).toBe('preprocessor');
    const joined = lines.map((line) => line.tokens.map((token) => token.text).join('')).join('\n');
    expect(joined).toBe(code);
    const kinds = new Set(lines.flatMap((line) => line.tokens.map((token) => token.kind)));
    expect(kinds.has('keyword')).toBe(true);
    expect(kinds.has('type')).toBe(true);
    expect(kinds.has('comment')).toBe(true);
    expect(kinds.has('string')).toBe(true);
    expect(kinds.has('number')).toBe(true);
  });

  it('handles multi-line comments and escapes', () => {
    const src = '/* a\n b */ int x = "a\\"b"; // end\n';
    const lines = highlightCode(src, 'c');
    expect(lines[0].tokens[0].kind).toBe('comment');
    expect(lines[1].tokens[0].kind).toBe('comment');
    const all = lines.flatMap((line) => line.tokens);
    expect(all.some((token) => token.kind === 'string' && token.text.includes('a\\"b'))).toBe(true);
  });

  it('lays out a complex flowchart within the canvas', () => {
    for (const compact of [false, true]) {
      const layout = layoutFlowchart(flow, compact);
      expect(layout.width).toBeGreaterThan(200);
      expect(layout.height).toBeGreaterThan(200);
      expect(layout.nodes.length).toBeGreaterThan(10);
      expect(layout.edges.length).toBeGreaterThan(10);
      for (const node of layout.nodes) {
        expect(Number.isFinite(node.x)).toBe(true);
        expect(Number.isFinite(node.y)).toBe(true);
        expect(node.x).toBeGreaterThanOrEqual(0);
        expect(node.y).toBeGreaterThanOrEqual(0);
        expect(node.x + node.w).toBeLessThanOrEqual(layout.width + 0.5);
        expect(node.y + node.h).toBeLessThanOrEqual(layout.height + 0.5);
      }
      for (const edge of layout.edges) {
        for (const point of edge.points) {
          expect(Number.isFinite(point.x)).toBe(true);
          expect(Number.isFinite(point.y)).toBe(true);
        }
      }
    }
  });

  it('renders FlowchartView and handles empty data', () => {
    const markup = render(createElement(FlowchartView, { data: flow, activeLine: 6 }));
    expect(markup).toContain('流程图');
    expect(markup).toContain('role="button"');
    expect(markup).toContain('第 6 行');
    const empty = render(createElement(FlowchartView, {
      data: { functionId: 'f', functionName: 'f', nodeCount: 0, entry: { id: 'b', kind: 'block', line: 1, label: '', children: [] } },
    }));
    expect(empty).toContain('暂无可绘制的流程图');
  });

  it('renders CallGraphView, ClassDiagramView, MemoryView', () => {
    const calls = render(createElement(CallGraphView, { graph: callGraph, activeFunctionId: 'fn_fact' }));
    expect(calls).toContain('factorial');
    expect(calls).toContain('递归');
    expect(calls).toContain('printf');

    const klass = render(createElement(ClassDiagramView, { classes, activeLine: 14 }));
    expect(klass).toContain('Shape');
    expect(klass).toContain('Circle');
    expect(klass).toContain('virtual');

    const mem = render(createElement(MemoryView, { memory }));
    expect(mem).toContain('栈区');
    expect(mem).toContain('a');
    expect(mem).toContain('教学示意');
  });

  it('renders OutlineView and TracePlayer', () => {
    const tree = render(createElement(OutlineView, { outline, activeLine: 6 }));
    expect(tree).toContain('main');
    expect(tree).toContain('#include');
    expect(tree).toContain('L4');
    expect(tree).toContain('for (int i = 0; i');

    const player = render(createElement(TracePlayer, { code, trace }));
    expect(player).toContain('变量监视');
    expect(player).toContain('sum');
    expect(player).toContain('程序开始执行');
    expect(player).toContain('（程序还没有输出）');
  });

  it('renders TracePlayer error state', () => {
    const markup = render(createElement(TracePlayer, {
      code: 'int main() { return 0; }',
      trace: { ok: false, supported: false, error: { message: '不支持的语法', kind: 'unsupported', line: 2 }, steps: [], output: '', truncated: false, maxSteps: 3000 },
    }));
    expect(markup).toContain('暂不支持单步执行');
    expect(markup).toContain('第 2 行');
  });

  it('renders DiagnosticsView states', () => {
    const list = render(createElement(DiagnosticsView, { diagnostics }));
    expect(list).toContain('缺少分号');
    expect(list).toContain('L6');
    const empty = render(createElement(DiagnosticsView, { diagnostics: [] }));
    expect(empty).toContain('没有发现明显问题');
  });

  it('renders AnalyzedDiagram without crashing on empty data', () => {
    const empty = render(createElement(AnalyzedDiagram, { kind: 'flow', code: '' }));
    expect(empty).toContain('还没有可以分析的代码');
    const flow = render(createElement(AnalyzedDiagram, { kind: 'flow', code: 'int main(){return 0;}' }));
    expect(flow).toContain('main');
    const traceEmpty = render(createElement(AnalyzedDiagram, { kind: 'trace', code: 'int main(){return 0;}' }));
    expect(traceEmpty).toContain('单步执行');
  });

  it('renders all views from real engine output', () => {
    const program = `#include <stdio.h>

int add(int a, int b) {
  return a + b;
}

int main() {
  int i, sum = 0;
  for (i = 0; i < 3; i++) {
    sum = add(sum, i);
    printf("%d\\n", sum);
  }
  if (sum > 5) {
    printf("big\\n");
  }
  return 0;
}
`;
    const analysis = analyzeCode(program);
    console.log(
      'engine:',
      analysis.ok,
      'functions',
      analysis.functions.length,
      'flowcharts',
      analysis.flowcharts.length,
      'classes',
      analysis.classes.length,
      'diagnostics',
      analysis.diagnostics.length,
    );
    expect(analysis.flowcharts.length).toBeGreaterThan(0);
    expect(analysis.callGraph.nodes.length).toBeGreaterThan(0);

    const flowMarkup = render(
      createElement(FlowchartView, { data: analysis.flowcharts[0], activeLine: analysis.flowcharts[0].entry.line }),
    );
    expect(flowMarkup).toContain('svg');
    expect(flowMarkup).toContain('流程图');
    for (const chart of analysis.flowcharts) {
      const layout = layoutFlowchart(chart, false);
      console.log(
        'flow layout',
        chart.functionName,
        layout.width,
        layout.height,
        layout.nodes.length,
        layout.edges.length,
        layout.nodes.map((node) => `${node.shape}@${Math.round(node.x)},${Math.round(node.y)}`).join(' '),
        layout.edges.filter((edge) => edge.dashed).length,
      );
    }

    const callsMarkup = render(createElement(CallGraphView, { graph: analysis.callGraph }));
    expect(callsMarkup).toContain('add');

    const outlineMarkup = render(
      createElement(OutlineView, { outline: analysis.outline, activeLine: 9 }),
    );
    expect(outlineMarkup).toContain('main');

    const memoryMarkup = render(createElement(MemoryView, { memory: analysis.memory, compact: true }));
    expect(memoryMarkup).toBeTruthy();

    const diagMarkup = render(createElement(DiagnosticsView, { diagnostics: analysis.diagnostics }));
    expect(diagMarkup).toBeTruthy();

    const traceResult = simulate(program);
    console.log(
      'trace:',
      traceResult.ok,
      traceResult.supported,
      'steps',
      traceResult.steps.length,
      'error',
      traceResult.error?.message,
    );
    if (traceResult.steps.length > 0) {
      const playerMarkup = render(
        createElement(TracePlayer, { code: program, trace: traceResult, compact: true }),
      );
      expect(playerMarkup).toContain('变量监视');
    }

    const cppProgram = `#include <iostream>
class Shape {
public:
  virtual double area() const = 0;
  virtual ~Shape() {}
};
class Circle : public Shape {
  double r;
public:
  Circle(double radius) : r(radius) {}
  double area() const override { return 3.14 * r * r; }
};
int main() {
  Circle c(2.0);
  std::cout << c.area() << std::endl;
  return 0;
}
`;
    const cpp = analyzeCode(cppProgram);
    console.log('cpp classes:', cpp.classes.length, cpp.classes.map((item) => `${item.name}:${item.bases.join(',')}`).join(' '));
    console.log(
      'call graph:',
      analysis.callGraph.nodes.map((node) => `${node.name}@${node.depth}${node.recursive ? '*' : ''}`).join(' '),
      'edges',
      analysis.callGraph.edges.length,
      'external',
      analysis.callGraph.externalCalls.join(','),
    );
    console.log(
      'memory:',
      analysis.memory.globals.length,
      analysis.memory.stack.map((frame) => `${frame.functionName}(${frame.cells.length})`).join(' '),
      analysis.memory.heap.length,
    );
    if (cpp.classes.length > 0) {
      const classMarkup = render(
        createElement(ClassDiagramView, { classes: cpp.classes, activeLine: cpp.classes[0].line }),
      );
      expect(classMarkup).toContain('Shape');
      expect(classMarkup).toContain('Circle');
      expect(classMarkup).toContain('继承自');
      const boxes = Array.from(
        classMarkup.matchAll(
          /<rect class="cvz-class__box" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g,
        ),
      ).map((match) => match.slice(1).map(Number));
      console.log('class boxes', boxes, 'inherits', (classMarkup.match(/cvz-class__inherit"/g) ?? []).length);
    }

    const ctrlProgram = `#include <stdio.h>
int main() {
  int x = 2;
  switch (x) {
    case 1:
      printf("one");
      break;
    default:
      printf("other");
  }
  do {
    x--;
  } while (x > 0);
  while (x < 3) { x++; }
  return 0;
}
`;
    const ctrl = analyzeCode(ctrlProgram);
    for (const chart of ctrl.flowcharts) {
      const layout = layoutFlowchart(chart, false);
      let overlaps = 0;
      for (let a = 0; a < layout.nodes.length; a += 1) {
        for (let b = a + 1; b < layout.nodes.length; b += 1) {
          const left = layout.nodes[a];
          const right = layout.nodes[b];
          const overlapX = Math.min(left.x + left.w, right.x + right.w) - Math.max(left.x, right.x);
          const overlapY = Math.min(left.y + left.h, right.y + right.h) - Math.max(left.y, right.y);
          if (overlapX > 2 && overlapY > 2) overlaps += 1;
        }
      }
      console.log(
        'ctrl flow',
        chart.functionName,
        layout.width,
        layout.height,
        layout.nodes.map((node) => node.shape).join(','),
        'dashed',
        layout.edges.filter((edge) => edge.dashed).length,
        'overlaps',
        overlaps,
      );
      expect(overlaps).toBe(0);
      const markup = render(createElement(FlowchartView, { data: chart }));
      expect(markup).toContain('svg');
      expect(markup).toContain('case 1:');
    }

    const recProgram = `#include <stdio.h>
int fact(int n) {
  if (n <= 1) return 1;
  return n * fact(n - 1);
}
int main() {
  int r = fact(5);
  printf("%d\\n", r);
  return 0;
}
`;
    const rec = analyzeCode(recProgram);
    console.log(
      'recursive graph:',
      rec.callGraph.nodes.map((node) => `${node.name}${node.recursive ? '*' : ''}@${node.depth}`).join(' '),
      rec.callGraph.edges.map((edge) => `${edge.from}>${edge.to}`).join(' '),
    );
    const recMarkup = render(createElement(CallGraphView, { graph: rec.callGraph }));
    expect(recMarkup).toContain('fact');
    expect(recMarkup).toContain('递归');
    const recTrace = simulate(recProgram);
    if (recTrace.steps.length > 0) {
      const recPlayer = render(createElement(TracePlayer, { code: recProgram, trace: recTrace }));
      expect(recPlayer).toContain('变量监视');
      expect(recPlayer).toContain('调用栈');
    }
    const analyzedClass = render(createElement(AnalyzedDiagram, { kind: 'classes', code: cppProgram }));
    expect(analyzedClass).toBeTruthy();
  });
});
