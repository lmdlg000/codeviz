/**
 * 引擎公共入口（占位实现）。
 * engine-dev 将替换本文件为真实实现；UI 已按这些签名开发。
 */
import type {
  AnalysisResult,
  AnalyzeOptions,
  EngineInfo,
  SimulateOptions,
  TraceResult,
  SourceLanguage,
} from './types';

export * from './types';

export function detectLanguage(code: string, filename?: string): SourceLanguage {
  const name = (filename ?? '').toLowerCase();
  if (name.endsWith('.cpp') || name.endsWith('.cc') || name.endsWith('.cxx') || name.endsWith('.hpp')) {
    return 'cpp';
  }
  if (/\b(class|namespace|template|std::|cout|cin|using\s+namespace)\b/.test(code)) {
    return 'cpp';
  }
  return 'c';
}

export function analyzeCode(code: string, options: AnalyzeOptions = {}): AnalysisResult {
  const totalLines = code.split(/\r?\n/).length;
  const language = detectLanguage(code, options.filename);
  return {
    ok: true,
    language,
    stats: {
      totalLines,
      codeLines: code.split(/\r?\n/).filter((line) => line.trim().length > 0).length,
      commentLines: 0,
      blankLines: 0,
      characters: code.length,
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
    },
    diagnostics: [
      {
        severity: 'info',
        message: '分析引擎尚未接入。',
        hint: '等待 engine-dev 完成 src/engine 实现。',
        line: 1,
        rule: 'engine-pending',
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
    interpreterHint: '分析引擎尚未接入。',
    parseErrors: 0,
  };
}

export function simulate(_code: string, options: SimulateOptions = {}): TraceResult {
  return {
    ok: false,
    supported: false,
    error: {
      message: '分析引擎尚未接入。',
      kind: 'unsupported',
    },
    steps: [],
    output: '',
    truncated: false,
    maxSteps: options.maxSteps ?? 3000,
    interpreterNote: '等待 engine-dev 完成 src/engine 实现。',
  };
}

export function getEngineInfo(): EngineInfo {
  return {
    name: 'CodeViz Engine',
    version: '0.0.0-placeholder',
    schemaVersion: 1,
    supportedPatterns: [],
  };
}
