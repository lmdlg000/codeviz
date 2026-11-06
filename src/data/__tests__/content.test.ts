/**
 * 内容一致性测试
 * ------------------------------------------------------------------
 * 课程 / 示例 / 知识图谱 / 覆盖矩阵 / 学习路线是五份互相引用的数据，
 * 改一处很容易漏掉另一处。这里把「引用必须成立」写成测试，避免出现
 * 点进去 404、测验答案越界、路线里放了一节不存在的课这类内容 bug。
 */
import { describe, expect, it } from 'vitest';
import { chapters, conceptGraph, getLessonsByChapter, lessons, samples } from '../index';
import { COVERAGE_ROWS } from '../coverage';
import { LEARNING_PATHS } from '../paths';
import { SELF_CHECK_ITEMS } from '../selfcheck';
import { MAX_CODE_LINES } from '../../engine/types';

const lessonIds = new Set(lessons.map((lesson) => lesson.id));
const sampleIds = new Set(samples.map((sample) => sample.id));
const chapterIds = new Set(chapters.map((chapter) => chapter.id));

describe('课程数据', () => {
  it('id 唯一且非空', () => {
    const ids = lessons.map((lesson) => lesson.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.trim().length > 0)).toBe(true);
  });

  it('每节课都挂在已存在的章节上，章内 order 不重复', () => {
    const seen = new Map<string, Set<number>>();
    for (const lesson of lessons) {
      expect(chapterIds.has(lesson.chapterId)).toBe(true);
      const orders = seen.get(lesson.chapterId) ?? new Set<number>();
      expect(orders.has(lesson.order)).toBe(false);
      orders.add(lesson.order);
      seen.set(lesson.chapterId, orders);
    }
  });

  it('getLessonsByChapter 按 order 升序', () => {
    for (const chapter of chapters) {
      const list = getLessonsByChapter(chapter.id).map((lesson) => lesson.order);
      expect(list).toEqual([...list].sort((a, b) => a - b));
    }
  });

  it('测验选项与答案合法', () => {
    for (const lesson of lessons) {
      expect(lesson.quiz.length).toBeGreaterThan(0);
      for (const question of lesson.quiz) {
        expect(question.question.trim().length).toBeGreaterThan(4);
        expect(question.options.length).toBeGreaterThanOrEqual(2);
        expect(question.options.length).toBeLessThanOrEqual(6);
        expect(Number.isInteger(question.answer)).toBe(true);
        expect(question.answer).toBeGreaterThanOrEqual(0);
        expect(question.answer).toBeLessThan(question.options.length);
        expect(question.explanation.trim().length).toBeGreaterThan(8);
      }
    }
  });

  it('示例、目标、要点都不为空', () => {
    for (const lesson of lessons) {
      if (lesson.labSampleId) expect(sampleIds.has(lesson.labSampleId)).toBe(true);
      expect(lesson.objectives.length).toBeGreaterThanOrEqual(3);
      expect(lesson.keyPoints.length).toBeGreaterThanOrEqual(3);
      expect(lesson.minutes).toBeGreaterThan(0);
    }
  });

  it('代码块不超过行数上限，且没有空代码', () => {
    for (const lesson of lessons) {
      for (const block of lesson.blocks) {
        if (block.type !== 'code') continue;
        const lines = block.code.split('\n').length;
        expect(lines).toBeLessThanOrEqual(MAX_CODE_LINES);
        expect(block.code.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('易错警示条目完整（错在哪 + 为什么）', () => {
    for (const lesson of lessons) {
      for (const block of lesson.blocks) {
        if (block.type !== 'pitfalls') continue;
        expect(block.items.length).toBeGreaterThanOrEqual(2);
        for (const item of block.items) {
          expect(item.mistake.trim().length).toBeGreaterThan(4);
          expect(item.why.trim().length).toBeGreaterThan(8);
          expect(Boolean(item.wrong) || Boolean(item.right)).toBe(true);
        }
      }
    }
  });
});

describe('示例数据', () => {
  it('id 唯一、标签与等级合法', () => {
    const ids = samples.map((sample) => sample.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const sample of samples) {
      expect(sample.tags.length).toBeGreaterThanOrEqual(2);
      expect(sample.tags.length).toBeLessThanOrEqual(4);
      expect([1, 2, 3]).toContain(sample.level);
      expect(sample.code.split('\n').length).toBeLessThanOrEqual(MAX_CODE_LINES);
      expect(sample.code.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('知识图谱', () => {
  it('节点 id 唯一，课程引用成立', () => {
    const ids = conceptGraph.nodes.map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const node of conceptGraph.nodes) {
      expect(chapterIds.has(node.chapterId)).toBe(true);
      if (node.lessonId) expect(lessonIds.has(node.lessonId)).toBe(true);
    }
  });

  it('边的两端都存在，且没有自环', () => {
    const ids = new Set(conceptGraph.nodes.map((node) => node.id));
    for (const edge of conceptGraph.edges) {
      expect(ids.has(edge.from)).toBe(true);
      expect(ids.has(edge.to)).toBe(true);
      expect(edge.from).not.toBe(edge.to);
    }
  });
});

describe('覆盖矩阵与学习路线', () => {
  it('覆盖矩阵引用的课程都存在', () => {
    for (const row of COVERAGE_ROWS) {
      for (const id of row.lessonIds) expect(lessonIds.has(id)).toBe(true);
      if (row.status === 'gap') expect(row.lessonIds).toHaveLength(0);
    }
  });

  it('每条路线只引用存在的课程，且不重复', () => {
    for (const path of LEARNING_PATHS) {
      const all = [...path.core, ...path.optional];
      expect(new Set(all).size).toBe(all.length);
      for (const id of all) expect(lessonIds.has(id)).toBe(true);
      for (const id of path.core) expect(path.optional).not.toContain(id);
    }
  });

  it('每节课至少属于一条路线，C 主线覆盖全部课程', () => {
    for (const lesson of lessons) {
      const covered = LEARNING_PATHS.some(
        (path) => path.core.includes(lesson.id) || path.optional.includes(lesson.id),
      );
      expect(covered).toBe(true);
    }
    const cPath = LEARNING_PATHS.find((path) => path.id === 'c');
    expect(cPath?.core.length).toBe(lessons.length);
    expect(cPath?.optional).toHaveLength(0);
  });

  it('路线的补充提示只挂在存在的课程上', () => {
    for (const path of LEARNING_PATHS) {
      for (const id of Object.keys(path.notes)) expect(lessonIds.has(id)).toBe(true);
    }
  });
});

describe('自查清单', () => {
  it('id 唯一，标题与说明不为空，手动项没有假规则', () => {
    const ids = SELF_CHECK_ITEMS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of SELF_CHECK_ITEMS) {
      expect(item.title.trim().length).toBeGreaterThan(4);
      expect(item.detail.trim().length).toBeGreaterThan(10);
      expect(Array.isArray(item.rules)).toBe(true);
      if (item.lessonId) expect(lessonIds.has(item.lessonId)).toBe(true);
    }
  });
});
