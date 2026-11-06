/**
 * localStorage 的安全封装。
 * - 所有 key 统一 `codeviz.` 前缀；
 * - 读写失败（隐私模式 / 配额）时静默降级，不让页面崩溃；
 * - 写入后派发自定义事件，同页面内的其它组件可以同步刷新。
 */

const PREFIX = 'codeviz.';

export const STORAGE_KEYS = {
  lessons: `${PREFIX}progress.lessons`,
  quiz: (lessonId: string) => `${PREFIX}quiz.${lessonId}`,
  labDraft: `${PREFIX}lab.draft`,
  theme: `${PREFIX}theme`,
} as const;

export const SESSION_KEYS = {
  labHandoff: `${PREFIX}lab.handoff`,
} as const;

const SYNC_EVENT = 'codeviz:storage';

function hasWindow(): boolean {
  return typeof window !== 'undefined';
}

export function readJson<T>(key: string, fallback: T): T {
  if (!hasWindow()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 忽略：存储不可用时继续保持内存态 */
  }
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { key } }));
}

export function removeKey(key: string): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* 忽略 */
  }
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { key } }));
}

export function readString(key: string, fallback = ''): string {
  if (!hasWindow()) return fallback;
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeString(key: string, value: string): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* 忽略 */
  }
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { key } }));
}

export function readSession<T>(key: string, fallback: T): T {
  if (!hasWindow()) return fallback;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeSession(key: string, value: unknown): void {
  if (!hasWindow()) return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 忽略 */
  }
}

export function removeSession(key: string): void {
  if (!hasWindow()) return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    /* 忽略 */
  }
}

/**
 * 订阅某个 key 的变化：同页写入（自定义事件）与其它标签页写入（storage 事件）都会触发。
 * 返回取消订阅函数。
 */
export function subscribeStorageKey(key: string, callback: () => void): () => void {
  if (!hasWindow()) return () => undefined;

  const onStorage = (event: StorageEvent): void => {
    // key 为 null 表示整站清空
    if (event.key === null || event.key === key) callback();
  };
  const onLocal = (event: Event): void => {
    const detail = (event as CustomEvent<{ key?: string }>).detail;
    if (!detail?.key || detail.key === key) callback();
  };

  window.addEventListener('storage', onStorage);
  window.addEventListener(SYNC_EVENT, onLocal);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(SYNC_EVENT, onLocal);
  };
}
