/**
 * 长轨迹的跳转计算（纯函数，便于单测）
 * ------------------------------------------------------------------
 * 轨迹是预先算好的：每一步都带 depth（调用深度）与 line（源码行号），
 * 所以「步过 / 跳出 / 继续到断点 / 运行到行」都只是在数组里找下标，
 * 不需要重新执行代码，也不受步数规模影响。
 */
import type { TraceStep } from '../../engine/types';
import { conditionMatches } from './breakpointCondition';

/** 找不到时统一返回 -1 */
const NOT_FOUND = -1;

/** 断点：行号 + 可选条件（`i == 10` 这种，命中时才停） */
export interface Breakpoint {
  line: number;
  condition?: string;
}

export function depthAt(steps: TraceStep[], position: number): number {
  return steps[position]?.depth ?? 0;
}

/**
 * 步过：从 from 往后找第一个「深度不超过当前」的步。
 * 当前行若调用了函数，这一段更深的步会被整段跳过，停在调用返回后的那一行。
 */
export function findStepOver(steps: TraceStep[], from: number): number {
  const depth = depthAt(steps, from);
  for (let i = from + 1; i < steps.length; i++) {
    if (depthAt(steps, i) <= depth) return i;
  }
  return NOT_FOUND;
}

/** 跳出：从 from 往后找第一个「深度更小」的步，即当前函数返回后的位置 */
export function findStepOut(steps: TraceStep[], from: number): number {
  const depth = depthAt(steps, from);
  if (depth <= 0) return NOT_FOUND;
  for (let i = from + 1; i < steps.length; i++) {
    if (depthAt(steps, i) < depth) return i;
  }
  return NOT_FOUND;
}

/**
 * 继续：从 from 往后第一个「命中断点」的步。
 * 带条件的断点只在该步的变量快照满足条件时才算命中。
 */
export function findNextBreakpoint(
  steps: TraceStep[],
  from: number,
  breakpoints: Breakpoint[],
): number {
  if (breakpoints.length === 0) return NOT_FOUND;
  const byLine = new Map<number, Breakpoint[]>();
  for (const breakpoint of breakpoints) {
    const list = byLine.get(breakpoint.line) ?? [];
    list.push(breakpoint);
    byLine.set(breakpoint.line, list);
  }
  for (let i = from + 1; i < steps.length; i++) {
    const candidates = byLine.get(steps[i].line);
    if (!candidates) continue;
    for (const breakpoint of candidates) {
      if (conditionMatches(breakpoint.condition, steps[i])) return i;
    }
  }
  return NOT_FOUND;
}

/** 运行到行：优先向后找；整段都走完了就回到该行最后一次执行的位置 */
export function findLineStep(steps: TraceStep[], from: number, line: number): number {
  for (let i = from + 1; i < steps.length; i++) {
    if (steps[i].line === line) return i;
  }
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].line === line) return i;
  }
  return NOT_FOUND;
}

/** 这一行在整次执行里有没有被执行过（用于给「没经过」的提示） */
export function lineEverExecuted(steps: TraceStep[], line: number): boolean {
  return steps.some((step) => step.line === line);
}
