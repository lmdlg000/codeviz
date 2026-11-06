/**
 * 代码实验室的初始内容解析：
 * 课程页交接 > URL 示例 / 代码参数 > 本地草稿 > 内置示例。
 */
import { getSample, samples } from '../../data';
import type { CodeSample } from '../../data/types';
import { DEFAULT_LAB_CODE, DEFAULT_LAB_FILENAME, loadDraft, peekHandoff } from './lab';

export interface LabInitialState {
  code: string;
  filename: string;
  autoAnalyze: boolean;
  handoff: boolean;
  sampleId: string | null;
}

export function sampleFilename(sample: CodeSample): string {
  return `${sample.id}.${sample.language === 'cpp' ? 'cpp' : 'c'}`;
}

export function resolveLabInitial(search: string): LabInitialState {
  const handoff = peekHandoff();
  if (handoff) {
    return {
      code: handoff.code,
      filename: handoff.filename ?? 'from-lesson.c',
      autoAnalyze: true,
      handoff: true,
      sampleId: null,
    };
  }

  const params = new URLSearchParams(search);
  const sample = getSample(params.get('sample') ?? undefined);
  if (sample) {
    return {
      code: sample.code,
      filename: sampleFilename(sample),
      autoAnalyze: true,
      handoff: false,
      sampleId: sample.id,
    };
  }

  const codeParam = params.get('code');
  if (codeParam && codeParam.trim().length > 0) {
    return {
      code: codeParam,
      filename: params.get('filename') ?? 'pasted.c',
      autoAnalyze: true,
      handoff: false,
      sampleId: null,
    };
  }

  const draft = loadDraft();
  if (draft) {
    return {
      code: draft.code,
      filename: draft.filename,
      autoAnalyze: false,
      handoff: false,
      sampleId: null,
    };
  }

  const firstSample = getSample('bubble-sort') ?? samples[0];
  if (firstSample) {
    return {
      code: firstSample.code,
      filename: sampleFilename(firstSample),
      autoAnalyze: false,
      handoff: false,
      sampleId: firstSample.id,
    };
  }

  return {
    code: DEFAULT_LAB_CODE,
    filename: DEFAULT_LAB_FILENAME,
    autoAnalyze: false,
    handoff: false,
    sampleId: null,
  };
}
