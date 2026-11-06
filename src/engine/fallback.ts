/**
 * 引擎兜底结果
 * ------------------------------------------------------------------
 * 当分析过程中出现意外内部错误时，仍然返回结构完整的 AnalysisResult，
 * 保证 UI 不会因为缺少字段而崩溃。
 */
import type { AnalysisResult, SourceLanguage } from './types';

export function emptyAnalysis(
  language: SourceLanguage,
  message: string,
  hint: string,
  totalLines: number,
): AnalysisResult {
  return {
    ok: false,
    language,
    stats: {
      totalLines: Math.max(1, totalLines),
      codeLines: 0,
      commentLines: 0,
      blankLines: Math.max(0, totalLines),
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
      cyclomaticComplexity: 1,
      difficulty: '入门',
    },
    diagnostics: [
      {
        severity: 'error',
        message,
        hint,
        line: 1,
        rule: 'engine-error',
      },
    ],
    includes: [],
    functions: [],
    globals: [],
    classes: [],
    flowcharts: [],
    callGraph: {
      nodes: [],
      edges: [],
      roots: [],
      hasRecursion: false,
      externalCalls: [],
      maxDepth: 0,
    },
    outline: { id: 'outline_root', kind: 'program', label: '程序', line: 1, children: [] },
    memory: { globals: [], stack: [], heap: [], notes: [], totalBytes: 0 },
    interpreterSupported: false,
    interpreterHint: '分析未完成，暂时无法单步执行。',
    parseErrors: 0,
  };
}
