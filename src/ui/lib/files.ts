/**
 * 文件读取与 500 行校验（代码实验室使用）。
 */
import { MAX_CODE_LINES } from '../../engine/types';
import type { SourceLanguage } from '../../engine/types';

export { MAX_CODE_LINES };

export const ACCEPTED_EXTENSIONS = ['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.txt'] as const;

export const FILE_ACCEPT = ACCEPTED_EXTENSIONS.join(',');

export function countCodeLines(code: string): number {
  if (code.length === 0) return 0;
  return code.replace(/\r\n?/g, '\n').split('\n').length;
}

export function isAcceptedFilename(name: string): boolean {
  const lower = name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

export function languageFromFilename(
  name: string,
  detect: (code: string, filename?: string) => SourceLanguage,
  code: string,
): SourceLanguage {
  return detect(code, name);
}

export function isBinaryLike(text: string): boolean {
  return text.includes('\u0000');
}

export type FileLoadFailureReason = 'type' | 'empty' | 'too-large' | 'read' | 'binary';

export interface FileLoadSuccess {
  ok: true;
  filename: string;
  code: string;
  lineCount: number;
}

export interface FileLoadFailure {
  ok: false;
  reason: FileLoadFailureReason;
  message: string;
}

export type FileLoadResult = FileLoadSuccess | FileLoadFailure;

export async function loadCodeFile(file: File): Promise<FileLoadResult> {
  if (!isAcceptedFilename(file.name)) {
    return {
      ok: false,
      reason: 'type',
      message: '只支持 .c / .cpp / .cc / .cxx / .h / .hpp / .txt 文件。',
    };
  }

  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, reason: 'read', message: '文件读取失败，请重试或改用粘贴。' };
  }

  if (isBinaryLike(text)) {
    return { ok: false, reason: 'binary', message: '这看起来不是文本代码文件。' };
  }

  const normalized = text.replace(/\r\n?/g, '\n');
  if (normalized.trim().length === 0) {
    return { ok: false, reason: 'empty', message: '文件是空的，请换一个文件。' };
  }

  const lineCount = countCodeLines(normalized);
  if (lineCount > MAX_CODE_LINES) {
    return {
      ok: false,
      reason: 'too-large',
      message: `文件有 ${lineCount} 行，超过了 ${MAX_CODE_LINES} 行的上限。`,
    };
  }

  return { ok: true, filename: file.name, code: normalized, lineCount };
}
