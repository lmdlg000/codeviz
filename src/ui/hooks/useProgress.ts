import { useSyncExternalStore } from 'react';
import { getCompletedLessons, subscribeProgress } from '../lib/progress';

/** 已完成的课程 id 集合（所有组件共享，写入后立即刷新）。 */
export function useCompletedLessons(): ReadonlySet<string> {
  return useSyncExternalStore(subscribeProgress, getCompletedLessons, getCompletedLessons);
}
