/**
 * CodeViz 引擎公共入口
 * ------------------------------------------------------------------
 * 对外只暴露四个函数（契约见 docs/CONTRACTS.md 第 3 节）：
 *   analyzeCode / simulate / detectLanguage / getEngineInfo
 * 全部纯同步、纯函数、确定性；任何输入都不会抛异常。
 */
import type {
  AnalysisResult,
  AnalyzeOptions,
  EngineInfo,
  SimulateOptions,
  SourceLanguage,
  TraceResult,
} from './types';
import { MAX_CODE_LINES } from './types';
import { tokenize } from './tokenizer';
import { parseTokens } from './parser';
import { analyzeProgram } from './analyzer';
import { simulateProgram } from './interpreter';
import { emptyAnalysis } from './fallback';

export * from './types';

/** 根据文件名与代码特征推断语言 */
export function detectLanguage(code: string, filename?: string): SourceLanguage {
  const name = (filename ?? '').toLowerCase();
  if (/\.(cpp|cc|cxx|c\+\+|hpp|hxx|hh)$/.test(name)) return 'cpp';
  if (name.endsWith('.c')) return 'c';

  const cppPatterns = [
    /\bclass\s+\w+/,
    /\bnamespace\s+\w+/,
    /\btemplate\s*</,
    /\bstd\s*::/,
    /\bcout\b/,
    /\bcin\b/,
    /\bendl\b/,
    /\busing\s+namespace\b/,
    /\b(public|private|protected)\s*:/,
    /\bvirtual\b/,
    /\boverride\b/,
    /\bnew\s+[A-Za-z_]/,
    /\bdelete\s*(\[\s*\])?\s*[A-Za-z_]/,
    /\b(int|void|char|float|double|bool)\s*&/,
    /\bstd::string\b/,
    /\bstring\s+\w+\s*=/,
  ];
  if (cppPatterns.some((pattern) => pattern.test(code))) return 'cpp';
  return 'c';
}

/** 分析一段 C / C++ 代码；永不抛异常，出错时返回带诊断的空结果 */
export function analyzeCode(code: string, options: AnalyzeOptions = {}): AnalysisResult {
  const language = detectLanguage(code, options.filename);
  try {
    const tokenizerResult = tokenize(code);
    const parseResult = parseTokens(tokenizerResult.tokens);
    return analyzeProgram({
      code,
      language,
      program: parseResult.program,
      tokens: tokenizerResult.tokens,
      lexIssues: tokenizerResult.issues,
      lineStats: tokenizerResult.lineStats,
      parserDiagnostics: parseResult.diagnostics,
      options: {
        filename: options.filename,
        maxLines: options.maxLines ?? MAX_CODE_LINES,
      },
    });
  } catch (error) {
    return emptyAnalysis(
      language,
      '分析引擎在处理这段代码时遇到了意外情况。',
      `请尝试简化代码后重试。${error instanceof Error ? `（${error.message}）` : ''}`,
      code.split(/\r\n|\r|\n/).length,
    );
  }
}

/** 单步执行教学子集代码；不支持时返回 supported=false 的友好结果 */
export function simulate(code: string, options: SimulateOptions = {}): TraceResult {
  const maxSteps = Math.min(Math.max(options.maxSteps ?? 3000, 10), 20000);
  try {
    const tokenizerResult = tokenize(code);
    const parseResult = parseTokens(tokenizerResult.tokens);
    return simulateProgram(parseResult.program, { maxSteps, stdin: options.stdin });
  } catch (error) {
    return {
      ok: false,
      supported: false,
      error: {
        message: `执行引擎无法处理这段代码。${error instanceof Error ? `（${error.message}）` : ''}`,
        kind: 'unsupported',
      },
      steps: [],
      output: '',
      truncated: false,
      maxSteps,
    };
  }
}

/** 引擎元信息 */
export function getEngineInfo(): EngineInfo {
  return {
    name: 'CodeViz Engine',
    version: '1.0.0',
    schemaVersion: 1,
    supportedPatterns: [
      '容错词法分析：注释 / 字符串 / 字符 / 数字 / 预处理指令',
      'C 与常见 C++ 教学代码的声明、函数、类、模板前缀',
      '函数流程图（顺序 / 判断 / 循环 / switch / 输入输出 / 调用）',
      '调用图（源码内函数、外部函数、直接与间接递归）',
      '类图（字段 / 方法 / 访问控制 / 继承 / 虚函数）',
      '内存布局（全局区 / 栈帧 / 数组 / 指针 / 堆）',
      '代码画像（行数 / 圈复杂度 / 嵌套深度 / 难度）',
      '中文诊断（分号、返回值、scanf、数组越界等）',
      '教学子集解释器（算术 / 循环 / 递归 / 数组 / 指针 / struct / printf / scanf / cout / cin）',
    ],
  };
}
