import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_PATH, LEARNING_PATHS, type PathId } from '../../data/paths';
import { STORAGE_KEYS, readString, writeString } from '../lib/storage';

function normalize(value: string | null | undefined): PathId | null {
  if (!value) return null;
  return LEARNING_PATHS.some((item) => item.id === value) ? (value as PathId) : null;
}

/**
 * 学习路线状态：URL（#/learn?path=cpp）优先，其次本地记忆，最后默认 C 主线。
 */
export function useLearningPath(fromQuery: string | null): {
  pathId: PathId;
  setPathId: (id: PathId) => void;
} {
  const [pathId, setState] = useState<PathId>(
    () => normalize(fromQuery) ?? normalize(readString(STORAGE_KEYS.path, '')) ?? DEFAULT_PATH,
  );

  useEffect(() => {
    const next = normalize(fromQuery);
    if (next) setState((current) => (current === next ? current : next));
  }, [fromQuery]);

  const setPathId = useCallback((id: PathId) => {
    setState(id);
    writeString(STORAGE_KEYS.path, id);
  }, []);

  return { pathId, setPathId };
}
