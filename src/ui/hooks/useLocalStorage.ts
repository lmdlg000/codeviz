import { useCallback, useEffect, useRef, useState } from 'react';
import { readJson, subscribeStorageKey, writeJson } from '../lib/storage';

/**
 * 通用 localStorage 状态：同页与跨标签页写入都会同步。
 * 读取失败时回退到初始值。
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((previous: T) => T)) => void] {
  const initialRef = useRef(initialValue);
  const [value, setValue] = useState<T>(() => readJson<T>(key, initialRef.current));

  useEffect(() => {
    const unsubscribe = subscribeStorageKey(key, () => {
      setValue(readJson<T>(key, initialRef.current));
    });
    return unsubscribe;
  }, [key]);

  const update = useCallback(
    (next: T | ((previous: T) => T)) => {
      setValue((previous) => {
        const resolved =
          typeof next === 'function' ? (next as (current: T) => T)(previous) : next;
        writeJson(key, resolved);
        return resolved;
      });
    },
    [key],
  );

  return [value, update];
}
