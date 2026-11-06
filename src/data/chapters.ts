import type { Chapter } from './types';

/** 章节元数据（固定，由 Lead 维护；课程文件通过 chapterId 归属） */
export const chapters: Chapter[] = [
  {
    id: 'c-basics',
    order: 1,
    title: 'C 语言起步',
    shortTitle: '起步',
    subtitle: '从第一行代码到数据的表达',
    tone: 'indigo',
    icon: 'spark',
  },
  {
    id: 'c-control',
    order: 2,
    title: '控制流程',
    shortTitle: '控制',
    subtitle: '让程序学会选择与重复',
    tone: 'teal',
    icon: 'route',
  },
  {
    id: 'c-data',
    order: 3,
    title: '数据组织',
    shortTitle: '组织',
    subtitle: '数组、函数、指针与结构体',
    tone: 'amber',
    icon: 'layers',
  },
  {
    id: 'cpp-oop',
    order: 4,
    title: 'C++ 面向对象',
    shortTitle: '进阶',
    subtitle: '类、继承、多态与泛型编程',
    tone: 'violet',
    icon: 'cube',
  },
];

export const chapterById = (id: string): Chapter | undefined =>
  chapters.find((chapter) => chapter.id === id);
