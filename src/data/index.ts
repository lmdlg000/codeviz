import type {
  Chapter,
  CodeSample,
  ConceptGraphData,
  GlossaryItem,
  Lesson,
} from './types';
import { chapters } from './chapters';
import { conceptGraph, glossary } from './concepts';

export * from './types';
export { chapters, chapterById } from './chapters';
export { conceptGraph, glossary } from './concepts';

/* ------------------------------------------------------------------
 * 课程与示例通过文件名自动汇总：
 *   src/data/lessons/*.ts  -> default export Lesson
 *   src/data/samples/*.ts  -> default export CodeSample[]
 * 新增内容无需修改本文件。
 * ------------------------------------------------------------------ */

const lessonModules = import.meta.glob<{ default: Lesson }>('./lessons/*.ts', {
  eager: true,
});

const sampleModules = import.meta.glob<{ default: CodeSample[] }>('./samples/*.ts', {
  eager: true,
});

const chapterOrder = new Map(chapters.map((chapter) => [chapter.id, chapter.order]));

export const lessons: Lesson[] = Object.values(lessonModules)
  .map((module) => module.default)
  .filter((lesson): lesson is Lesson => Boolean(lesson?.id))
  .sort((a, b) => {
    const chapterDiff =
      (chapterOrder.get(a.chapterId) ?? 99) - (chapterOrder.get(b.chapterId) ?? 99);
    return chapterDiff !== 0 ? chapterDiff : a.order - b.order;
  });

export const samples: CodeSample[] = Object.values(sampleModules)
  .flatMap((module) => (Array.isArray(module.default) ? module.default : []))
  .filter((sample): sample is CodeSample => Boolean(sample?.id));

export const lessonMap: Map<string, Lesson> = new Map(
  lessons.map((lesson) => [lesson.id, lesson]),
);

export const sampleMap: Map<string, CodeSample> = new Map(
  samples.map((sample) => [sample.id, sample]),
);

export function getLesson(id: string | undefined): Lesson | undefined {
  return id ? lessonMap.get(id) : undefined;
}

export function getSample(id: string | undefined): CodeSample | undefined {
  return id ? sampleMap.get(id) : undefined;
}

export function getLessonsByChapter(chapterId: string): Lesson[] {
  return lessons.filter((lesson) => lesson.chapterId === chapterId);
}

export function getChapterOfLesson(lesson: Lesson | undefined): Chapter | undefined {
  return lesson ? chapters.find((chapter) => chapter.id === lesson.chapterId) : undefined;
}

export function getLessonNeighbors(id: string): {
  previous?: Lesson;
  next?: Lesson;
} {
  const index = lessons.findIndex((lesson) => lesson.id === id);
  if (index < 0) return {};
  return { previous: lessons[index - 1], next: lessons[index + 1] };
}

export function getConceptsForLesson(lessonId: string): ConceptGraphData['nodes'] {
  return conceptGraph.nodes.filter((node) => node.lessonId === lessonId);
}

export function getQuizCount(): number {
  return lessons.reduce((total, lesson) => total + lesson.quiz.length, 0);
}

export type { Chapter, CodeSample, ConceptGraphData, GlossaryItem, Lesson };
