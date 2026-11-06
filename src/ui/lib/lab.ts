/**
 * 代码实验室的默认内容、草稿与跨页面代码交接。
 * 课程页点「在实验室打开」时用 sessionStorage 交接整段代码，
 * 避免把大段代码塞进 hash 里。
 */
import {
  SESSION_KEYS,
  STORAGE_KEYS,
  readJson,
  readSession,
  removeSession,
  writeJson,
  writeSession,
} from './storage';

export interface LabDraft {
  code: string;
  filename: string;
  savedAt: number;
}

export interface LabHandoff {
  code: string;
  filename?: string;
}

export const DEFAULT_LAB_FILENAME = 'max-in-array.c';

export const DEFAULT_LAB_CODE = `#include <stdio.h>

int main(void) {
  int a[6] = {5, 2, 9, 1, 7, 3};
  int n = 6;
  int max = a[0];

  for (int i = 1; i < n; i++) {
    if (a[i] > max) {
      max = a[i];
    }
  }

  printf("max = %d\\n", max);
  return 0;
}
`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function loadDraft(): LabDraft | null {
  const raw = readJson<unknown>(STORAGE_KEYS.labDraft, null);
  if (raw === null) return null;
  if (typeof raw === 'string') {
    return { code: raw, filename: DEFAULT_LAB_FILENAME, savedAt: 0 };
  }
  if (isRecord(raw) && typeof raw.code === 'string') {
    return {
      code: raw.code,
      filename: typeof raw.filename === 'string' && raw.filename ? raw.filename : DEFAULT_LAB_FILENAME,
      savedAt: typeof raw.savedAt === 'number' ? raw.savedAt : 0,
    };
  }
  return null;
}

export function saveDraft(code: string, filename: string): void {
  const draft: LabDraft = { code, filename, savedAt: Date.now() };
  writeJson(STORAGE_KEYS.labDraft, draft);
}

/** 课程页调用：把代码交给实验室。 */
export function handoffToLab(code: string, filename?: string): void {
  const payload: LabHandoff = { code, filename };
  writeSession(SESSION_KEYS.labHandoff, payload);
}

/** 读取交接代码但不删除（避免 StrictMode 下初始化函数执行两次造成丢失）。 */
export function peekHandoff(): LabHandoff | null {
  const raw = readSession<unknown>(SESSION_KEYS.labHandoff, null);
  if (raw === null) return null;
  if (isRecord(raw) && typeof raw.code === 'string') {
    return {
      code: raw.code,
      filename: typeof raw.filename === 'string' ? raw.filename : undefined,
    };
  }
  return null;
}

export function clearHandoff(): void {
  removeSession(SESSION_KEYS.labHandoff);
}

/** 取用一次并清除。 */
export function takeHandoff(): LabHandoff | null {
  const handoff = peekHandoff();
  if (handoff) removeSession(SESSION_KEYS.labHandoff);
  return handoff;
}
