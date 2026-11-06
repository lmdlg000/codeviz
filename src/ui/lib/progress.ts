/**
 * 学习进度与测验答案的本地存储。
 * 用一个极小的外部 store 让侧栏、课程页共享同一份进度；
 * 其它标签页写入时通过 storage 事件同步。
 */
import { STORAGE_KEYS, readJson, writeJson } from './storage';
import { subscribeStorageKey } from './storage';

export interface QuizRecord {
  /** questionId -> 选择的下标 */
  answers: Record<string, number>;
  /** 是否已经「查看答案」 */
  revealed: boolean;
}

type Listener = () => void;

let completedSnapshot: ReadonlySet<string> | null = null;
const listeners = new Set<Listener>();
let detachStorage: (() => void) | null = null;

function readCompletedFromStorage(): ReadonlySet<string> {
  const raw = readJson<unknown>(STORAGE_KEYS.lessons, []);
  if (!Array.isArray(raw)) return new Set<string>();
  return new Set(raw.filter((item): item is string => typeof item === 'string'));
}

function notify(): void {
  listeners.forEach((listener) => listener());
}

function invalidate(): void {
  completedSnapshot = null;
  notify();
}

function ensureStorageBridge(): void {
  if (detachStorage) return;
  detachStorage = subscribeStorageKey(STORAGE_KEYS.lessons, invalidate);
}

export function subscribeProgress(listener: Listener): () => void {
  ensureStorageBridge();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCompletedLessons(): ReadonlySet<string> {
  if (completedSnapshot === null) {
    completedSnapshot = readCompletedFromStorage();
  }
  return completedSnapshot;
}

function writeCompleted(next: Set<string>): void {
  writeJson(STORAGE_KEYS.lessons, [...next]);
  invalidate();
}

export function setLessonComplete(lessonId: string, completed: boolean): void {
  const next = new Set(getCompletedLessons());
  if (completed) {
    if (next.has(lessonId)) return;
    next.add(lessonId);
  } else {
    if (!next.has(lessonId)) return;
    next.delete(lessonId);
  }
  writeCompleted(next);
}

/** 返回操作后的完成状态。 */
export function toggleLessonComplete(lessonId: string): boolean {
  const completed = getCompletedLessons().has(lessonId);
  setLessonComplete(lessonId, !completed);
  return !completed;
}

/* --------------------------------- 测验 --------------------------------- */

export function readQuizRecord(lessonId: string): QuizRecord {
  const raw = readJson<unknown>(STORAGE_KEYS.quiz(lessonId), null);
  if (typeof raw !== 'object' || raw === null) {
    return { answers: {}, revealed: false };
  }
  const record = raw as { answers?: unknown; revealed?: unknown };
  const answers: Record<string, number> = {};
  if (typeof record.answers === 'object' && record.answers !== null) {
    for (const [key, value] of Object.entries(record.answers)) {
      if (typeof value === 'number' && Number.isInteger(value)) answers[key] = value;
    }
  }
  return { answers, revealed: record.revealed === true };
}

export function writeQuizRecord(lessonId: string, record: QuizRecord): void {
  writeJson(STORAGE_KEYS.quiz(lessonId), record);
}

export function clearQuizRecord(lessonId: string): void {
  writeQuizRecord(lessonId, { answers: {}, revealed: false });
}

/* --------------------------------- 统计 --------------------------------- */

export function countCompletedInLessonIds(lessonIds: readonly string[]): number {
  const completed = getCompletedLessons();
  return lessonIds.reduce((total, id) => total + (completed.has(id) ? 1 : 0), 0);
}
