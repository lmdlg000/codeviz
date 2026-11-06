/** 临时布局检查（验证后删除） */
import { describe, expect, it } from 'vitest';
import type { FlowchartData, FlowchartNode } from '../../../engine/types';
import { layoutFlowchart } from '../flowLayout';

function block(id: string, line: number, children: FlowchartNode[]): FlowchartNode {
  return { id, kind: 'block', line, label: '', children };
}

const nested: FlowchartData = {
  functionId: 'fn_main',
  functionName: 'main',
  nodeCount: 20,
  entry: block('root', 1, [
    { id: 's', kind: 'start', line: 2, label: '开始' },
    {
      id: 'if1',
      kind: 'decision',
      line: 3,
      label: '判断 a > b',
      condition: 'a > b',
      yes: block('y1', 4, [
        { id: 'p1', kind: 'process', line: 4, label: 'a = a + 1' },
        {
          id: 'if2',
          kind: 'decision',
          line: 5,
          label: 'a > 10',
          condition: 'a > 10',
          yes: block('y2', 6, [
            { id: 'p2', kind: 'output', line: 6, label: '输出 a' },
            { id: 'r1', kind: 'return', line: 7, label: 'return a' },
          ]),
          no: block('n2', 8, [{ id: 'p3', kind: 'process', line: 8, label: 'a = 10' }]),
        },
      ]),
      no: block('n1', 9, [
        { id: 'p4', kind: 'process', line: 9, label: 'b = b - 1' },
        {
          id: 'lp1',
          kind: 'loop',
          line: 10,
          label: 'i++',
          condition: 'i < 100',
          loopKind: 'for',
          body: block('lb1', 11, [
            { id: 'p5', kind: 'call', line: 11, label: '调用 swap(&a, &b)', callName: 'swap' },
            { id: 'c1', kind: 'continue', line: 12, label: 'continue' },
          ]),
        },
      ]),
    },
    {
      id: 'sw1',
      kind: 'switch',
      line: 13,
      label: 'switch (grade)',
      cases: [
        { label: '1', line: 14, body: block('cb1', 14, [{ id: 'p6', kind: 'output', line: 14, label: '输出 优秀' }]) },
        { label: '2', line: 15, body: block('cb2', 15, [{ id: 'p7', kind: 'output', line: 15, label: '输出 良好' }]) },
        { label: 'default', line: 16, isDefault: true, body: block('cb3', 16, [{ id: 'p8', kind: 'process', line: 16, label: '输出 及格' }]) },
      ],
    },
    { id: 'e', kind: 'end', line: 20, label: '结束' },
  ]),
};

const singleYes: FlowchartData = {
  functionId: 'fn_demo',
  functionName: 'demo',
  nodeCount: 6,
  entry: block('r', 1, [
    { id: 's', kind: 'start', line: 2, label: '开始' },
    {
      id: 'd',
      kind: 'decision',
      line: 3,
      label: 'x > 0',
      condition: 'x > 0',
      yes: block('y', 4, [
        { id: 'a', kind: 'process', line: 4, label: 'x = x - 1' },
        { id: 'b', kind: 'process', line: 5, label: 'y = y + 1' },
        { id: 'c', kind: 'input', line: 6, label: '输入 y' },
      ]),
      no: block('n', 7, []),
    },
    { id: 'e', kind: 'end', line: 8, label: '结束' },
  ]),
};

const emptyFn: FlowchartData = {
  functionId: 'fn_noop',
  functionName: 'noop',
  nodeCount: 3,
  entry: block('r', 1, [
    { id: 's', kind: 'start', line: 2, label: '开始' },
    { id: 'p', kind: 'process', line: 3, label: '空函数体' },
    { id: 'e', kind: 'end', line: 4, label: '结束' },
  ]),
};

function expectFinite(layout: ReturnType<typeof layoutFlowchart>): void {
  expect(Number.isFinite(layout.width)).toBe(true);
  expect(Number.isFinite(layout.height)).toBe(true);
  for (const node of layout.nodes) {
    for (const value of [node.x, node.y, node.w, node.h]) expect(Number.isFinite(value)).toBe(true);
    expect(node.x).toBeGreaterThanOrEqual(0);
    expect(node.y).toBeGreaterThanOrEqual(0);
    expect(node.x + node.w).toBeLessThanOrEqual(layout.width + 0.01);
    expect(node.y + node.h).toBeLessThanOrEqual(layout.height + 0.01);
  }
  for (const edge of layout.edges) {
    for (const point of edge.points) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
  }
}

function overlapCount(layout: ReturnType<typeof layoutFlowchart>): number {
  let count = 0;
  for (let i = 0; i < layout.nodes.length; i += 1) {
    for (let j = i + 1; j < layout.nodes.length; j += 1) {
      const a = layout.nodes[i];
      const b = layout.nodes[j];
      const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (overlapX > 2 && overlapY > 2) count += 1;
    }
  }
  return count;
}

describe('flowLayout 布局几何', () => {
  it('nested / single-branch / empty function stay in bounds and do not overlap', () => {
    for (const compact of [false, true]) {
      for (const data of [nested, singleYes, emptyFn]) {
        const layout = layoutFlowchart(data, compact);
        expectFinite(layout);
        expect(overlapCount(layout)).toBe(0);
      }
    }
    const normal = layoutFlowchart(nested, false);
    const compact = layoutFlowchart(nested, true);
    // 打印一次，便于人工检查尺寸是否合理
    console.log('nested normal', normal.width, normal.height, normal.nodes.length, normal.edges.length);
    console.log('nested compact', compact.width, compact.height, compact.nodes.length, compact.edges.length);
    expect(normal.width).toBeLessThan(2400);
    expect(normal.height).toBeLessThan(2400);
  });

  it('single-branch decision leaves room for the empty branch stub', () => {
    const layout = layoutFlowchart(singleYes, false);
    // 找到 if 的 yes 分支节点（x = x - 1）与决策节点，确认空分支折线不会穿过 yes 分支
    const decision = layout.nodes.find((node) => node.shape === 'decision');
    const branchNodes = layout.nodes.filter((node) => node.line >= 4 && node.line <= 6);
    expect(decision).toBeTruthy();
    expect(branchNodes.length).toBe(3);
    expect(layout.width).toBeGreaterThan(decision!.w + 150);
    const emptyBranchEdges = layout.edges.filter((edge) => edge.arrow === false && edge.label?.text === '否');
    expect(emptyBranchEdges.length).toBe(1);
    const stub = emptyBranchEdges[0].points;
    const stubX = stub[stub.length - 2].x;
    // 空分支竖线应位于 yes 分支所有节点的右侧
    const branchRight = Math.max(...branchNodes.map((node) => node.x + node.w));
    expect(stubX).toBeGreaterThan(branchRight);
  });

  it('empty function is compact and centered', () => {
    const layout = layoutFlowchart(emptyFn, true);
    expect(layout.nodes.length).toBe(3);
    expect(layout.width).toBeLessThan(400);
    expect(layout.height).toBeLessThan(400);
  });
});
