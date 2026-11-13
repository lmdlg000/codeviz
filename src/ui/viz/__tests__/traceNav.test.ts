import { describe, expect, it } from 'vitest';
import type { TraceStep } from '../../../engine/types';
import { simulate } from '../../../engine';
import { findLineStep, findNextBreakpoint, findStepOut, findStepOver } from '../traceNav';

/** 只关心 line / depth 的最小步；其余字段对导航无意义 */
function step(line: number, depth: number): TraceStep {
  return { line, depth } as unknown as TraceStep;
}

const TRACE: TraceStep[] = [
  step(10, 0), // 0  main 里声明对象
  step(10, 1), // 1    进入构造函数
  step(11, 1), // 2    构造函数内部循环
  step(11, 1), // 3
  step(12, 1), // 4
  step(10, 0), // 5    回到 main（构造完成）
  step(13, 0), // 6    main 下一行
  step(20, 2), // 7    再进两层
  step(21, 2), // 8
  step(22, 1), // 9
  step(14, 0), // 10
];

describe('traceNav：长轨迹跳转计算', () => {
  it('步过会跳过更深的调用，停在同层或更浅的下一步', () => {
    expect(findStepOver(TRACE, 0)).toBe(5);
  });

  it('在纯 main 里步过会跳过被调函数（深度 2 的那几步）', () => {
    expect(findStepOver(TRACE, 6)).toBe(10);
  });

  it('步过走到结尾返回 -1', () => {
    expect(findStepOver(TRACE, 10)).toBe(-1);
  });

  it('跳出直接回到调用者那一层', () => {
    expect(findStepOut(TRACE, 2)).toBe(5);
    expect(findStepOut(TRACE, 7)).toBe(9);
  });

  it('最外层没有可跳出的位置', () => {
    expect(findStepOut(TRACE, 6)).toBe(-1);
  });

  it('继续只认断点行', () => {
    expect(findNextBreakpoint(TRACE, 0, [13])).toBe(6);
    expect(findNextBreakpoint(TRACE, 0, [11])).toBe(2);
    expect(findNextBreakpoint(TRACE, 6, [11])).toBe(-1);
    expect(findNextBreakpoint(TRACE, 0, [])).toBe(-1);
  });

  it('运行到行优先向后，走完了回到该行最后一次执行的位置', () => {
    expect(findLineStep(TRACE, 0, 13)).toBe(6);
    expect(findLineStep(TRACE, 6, 10)).toBe(5);
    expect(findLineStep(TRACE, 6, 999)).toBe(-1);
  });

  it('真实轨迹：在调用行步过，一次跨过构造函数内部的循环', () => {
    const result = simulate(`
#include <iostream>
using namespace std;
class BigInt {
  int len;
public:
  BigInt(int n) { len = 0; while (n > 0) { n /= 10; len++; } }
  int size() { return len; }
};
int main() {
  BigInt a(12345);
  cout << a.size() << endl;
  return 0;
}`);
    expect(result.ok).toBe(true);
    const steps = result.steps;
    // call 事件记在调用者那一层，构造/循环体是 depth 1
    const callStep = steps.findIndex((item) => item.event === 'call' && item.description.includes('BigInt'));
    expect(callStep).toBeGreaterThan(0);
    const over = findStepOver(steps, callStep);
    expect(steps[over].depth).toBe(0);
    expect(over - callStep).toBeGreaterThan(10); // 循环十几步被整段跳过

    // 跳出：从构造函数内部一步回到 main
    const inside = steps.findIndex((item) => item.depth > 0);
    expect(findStepOut(steps, inside)).toBe(over);

    // 运行到「cout << a.size()」那一行
    const coutLine = steps.findIndex((item) => item.description.includes('size()'));
    expect(findLineStep(steps, callStep, steps[coutLine].line)).toBeGreaterThan(callStep);

    // 断点设在 return 行，继续执行能直接命中
    const returnLine = steps[steps.length - 2].line;
    expect(findNextBreakpoint(steps, 0, [returnLine])).toBeGreaterThan(0);
  });
});
