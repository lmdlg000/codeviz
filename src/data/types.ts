/**
 * CodeViz 教程内容数据契约
 * ------------------------------------------------------------------
 * 所有课程内容都是纯数据（TypeScript 对象），由 src/data/lessons/*.ts 提供，
 * 通过 src/data/index.ts 中的 import.meta.glob 自动汇总。
 * 内容作者只改 src/data/lessons/** 与 src/data/samples/**。
 */

export type ContentLanguage = 'c' | 'cpp';

export type ChapterTone = 'indigo' | 'teal' | 'amber' | 'rose' | 'sky' | 'violet';

export type ChapterIcon = 'spark' | 'route' | 'layers' | 'cube' | 'rocket';

export interface Chapter {
  id: string;
  order: number;
  title: string;
  shortTitle: string;
  subtitle: string;
  tone: ChapterTone;
  icon: ChapterIcon;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  /** 正确选项下标（0 开始） */
  answer: number;
  explanation: string;
}

export interface CodePane {
  title: string;
  language?: ContentLanguage;
  code: string;
}

/**
 * 内嵌图表的代码会交给引擎现场分析，渲染真实的流程图 / 调用图 / 类图 / 内存图 / 单步执行。
 * - flow：默认分析第一个非 main 函数；也可用 functionName 指定
 * - trace：会显示一个迷你单步执行播放器
 */
export type DiagramSpec =
  | { kind: 'flow'; code: string; functionName?: string }
  | { kind: 'calls'; code: string }
  | { kind: 'classes'; code: string }
  | { kind: 'memory'; code: string }
  | { kind: 'trace'; code: string; autoplay?: boolean };

export type LessonBlock =
  | { type: 'text'; body: string }
  | { type: 'heading'; text: string }
  | { type: 'list'; ordered?: boolean; items: string[] }
  | { type: 'note'; tone: 'tip' | 'info' | 'warn' | 'danger'; title: string; body: string }
  | {
      type: 'code';
      language?: ContentLanguage;
      code: string;
      title?: string;
      caption?: string;
      /** 高亮行号（1-based），用于强调关键语句 */
      highlights?: number[];
      /** 是否显示「在实验室打开」按钮，默认 true */
      runnable?: boolean;
    }
  | { type: 'diagram'; diagram: DiagramSpec; title?: string; caption?: string }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'steps'; items: { title: string; body: string }[] }
  | { type: 'compare'; left: CodePane; right: CodePane; caption?: string }
  | { type: 'try'; language?: ContentLanguage; code: string; prompt: string };

export interface Lesson {
  id: string;
  chapterId: string;
  /** 章节内顺序，从 1 开始 */
  order: number;
  title: string;
  subtitle: string;
  /** 一句话说明，用于课程卡片 */
  description: string;
  difficulty: 1 | 2 | 3;
  minutes: number;
  objectives: string[];
  blocks: LessonBlock[];
  keyPoints: string[];
  quiz: QuizQuestion[];
  /** 可在实验室打开的示例代码 id（对应 CodeSample.id） */
  labSampleId?: string;
}

export interface CodeSample {
  id: string;
  title: string;
  description: string;
  language: ContentLanguage;
  code: string;
  tags: string[];
  level: 1 | 2 | 3;
  /** 该示例最能展示的图形能力 */
  focus: 'flow' | 'calls' | 'classes' | 'memory' | 'trace' | 'diagnostics';
}

export interface ConceptNode {
  id: string;
  label: string;
  /** 分组：basics / control / data / cpp */
  group: 'basics' | 'control' | 'data' | 'cpp';
  chapterId: string;
  lessonId?: string;
  /** 纵向层级，0 在最上方；用于稳定布局 */
  tier: number;
  description: string;
}

export interface ConceptEdge {
  from: string;
  to: string;
  label?: string;
}

export interface ConceptGraphData {
  nodes: ConceptNode[];
  edges: ConceptEdge[];
}

export interface GlossaryItem {
  term: string;
  en?: string;
  definition: string;
  lessonId?: string;
}
