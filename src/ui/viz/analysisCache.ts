/**
 * 分析结果缓存与 React hooks
 * ------------------------------------------------------------------
 * 设计要点：
 * - 引擎分析是同步纯函数，但可能被同一段代码在多次 render 中重复触发，
 *   因此用模块级 Map 缓存；UI 侧再用 useMemo 保证同一 code 只查一次。
 * - 缓存按插入顺序淘汰（简单的 LRU 近似），避免实验室反复粘贴长代码时无限增长。
 * - 引擎承诺不抛异常；这里仍做最后一道保护，任何异常都退化为空结果 + 中文提示，
 *   绝不让可视化组件因数据问题崩溃。
 */
import { useMemo } from 'react';
import { analyzeCode, simulate } from '../../engine';
import { DEFAULT_MAX_STEPS } from '../../engine/types';
import type { AnalysisResult, CodeStats, SimulateOptions, TraceResult } from '../../engine/types';

const MAX_ANALYSIS_ENTRIES = 24;
const MAX_TRACE_ENTRIES = 16;

const analysisCache = new Map<string, AnalysisResult>();
const traceCache = new Map<string, TraceResult>();

const EMPTY_STATS: CodeStats = {
  totalLines: 0,
  codeLines: 0,
  commentLines: 0,
  blankLines: 0,
  characters: 0,
  tokenCount: 0,
  functions: 0,
  loops: 0,
  branches: 0,
  declarations: 0,
  pointers: 0,
  arrays: 0,
  structs: 0,
  classes: 0,
  maxNesting: 0,
  cyclomaticComplexity: 0,
  difficulty: '入门',
};

function analyzeFailure(code: string): AnalysisResult {
  const lineCount = code.length > 0 ? code.split(/\r?\n/).length : 0;
  return {
    ok: false,
    language: 'c',
    stats: { ...EMPTY_STATS, totalLines: lineCount },
    diagnostics: [
      {
        severity: 'error',
        message: '分析这段代码时出现了异常，已跳过。',
        hint: '可以试试精简代码，或换一个课程示例再分析。',
        line: 1,
        rule: 'viz-analysis-failed',
      },
    ],
    includes: [],
    functions: [],
    globals: [],
    classes: [],
    flowcharts: [],
    callGraph: { nodes: [], edges: [], roots: [], hasRecursion: false, externalCalls: [], maxDepth: 0 },
    outline: { id: 'outline-root', kind: 'program', label: '程序', line: 1, children: [] },
    memory: { globals: [], stack: [], heap: [], notes: [], totalBytes: 0 },
    interpreterSupported: false,
    interpreterHint: '分析暂时不可用。',
    parseErrors: 0,
  };
}

function traceFailure(): TraceResult {
  return {
    ok: false,
    supported: false,
    error: {
      message: '单步执行暂时不可用。',
      kind: 'unsupported',
    },
    steps: [],
    output: '',
    truncated: false,
    maxSteps: DEFAULT_MAX_STEPS,
  };
}

const EMPTY_TRACE: TraceResult = {
  ok: true,
  supported: true,
  steps: [],
  output: '',
  truncated: false,
  maxSteps: DEFAULT_MAX_STEPS,
};

function remember<T>(map: Map<string, T>, key: string, value: T, limit: number): T {
  if (map.has(key)) map.delete(key);
  map.set(key, value);
  while (map.size > limit) {
    const oldest = map.keys().next();
    if (oldest.done) break;
    map.delete(oldest.value);
  }
  return value;
}

function analysisKey(code: string, filename?: string): string {
  return `${filename ?? ''}\u0000${code}`;
}

function traceKey(code: string, options?: SimulateOptions): string {
  return `${options?.stdin ?? ''}\u0000${options?.maxSteps ?? ''}\u0000${code}`;
}

/** 带缓存的分析（同步）。UI 非 hook 场景也可以直接调用。 */
export function analyzeCached(code: string, filename?: string): AnalysisResult {
  const key = analysisKey(code, filename);
  const hit = analysisCache.get(key);
  if (hit) {
    // 命中后移动到末尾，近似 LRU
    analysisCache.delete(key);
    analysisCache.set(key, hit);
    return hit;
  }
  let result: AnalysisResult;
  try {
    result = analyzeCode(code, filename ? { filename } : undefined);
  } catch {
    result = analyzeFailure(code);
  }
  return remember(analysisCache, key, result, MAX_ANALYSIS_ENTRIES);
}

/** 带缓存的单步执行（同步）。stdin / maxSteps 不同则分别缓存。 */
export function simulateCached(code: string, options?: SimulateOptions): TraceResult {
  const key = traceKey(code, options);
  const hit = traceCache.get(key);
  if (hit) {
    traceCache.delete(key);
    traceCache.set(key, hit);
    return hit;
  }
  let result: TraceResult;
  try {
    result = simulate(code, options);
  } catch {
    result = traceFailure();
  }
  return remember(traceCache, key, result, MAX_TRACE_ENTRIES);
}

/** React hook：同一段代码在一次渲染内只查一次缓存。 */
export function useAnalysis(code: string, filename?: string): AnalysisResult {
  return useMemo(() => analyzeCached(code, filename), [code, filename]);
}

/**
 * React hook：单步执行结果。
 * enabled=false 时不会调用引擎（例如当前视图不是追踪），返回空的成功结果。
 */
export function useTrace(code: string, options?: SimulateOptions, enabled = true): TraceResult {
  const stdin = options?.stdin;
  const maxSteps = options?.maxSteps;
  return useMemo(() => {
    if (!enabled || code.trim().length === 0) return EMPTY_TRACE;
    return simulateCached(code, { stdin, maxSteps });
  }, [code, stdin, maxSteps, enabled]);
}

/** 清空缓存（调试或内存敏感场景用）。 */
export function clearVizCaches(): void {
  analysisCache.clear();
  traceCache.clear();
}

export const VIZ_CACHE_LIMITS = { analysis: MAX_ANALYSIS_ENTRIES, trace: MAX_TRACE_ENTRIES };
