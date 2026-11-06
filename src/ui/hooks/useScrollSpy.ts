import { useEffect, useState } from 'react';

/**
 * 课程正文的滚动高亮：找出最后一个已经滚过阅读线的小节标题。
 */
export function useScrollSpy(ids: readonly string[], offset = 150): string | null {
  const key = ids.join('|');
  const [active, setActive] = useState<string | null>(ids[0] ?? null);

  useEffect(() => {
    const list = key.length > 0 ? key.split('|') : [];
    if (list.length === 0) {
      setActive(null);
      return undefined;
    }

    let frame = 0;
    const compute = (): void => {
      frame = 0;
      let current: string | null = list[0];
      for (const id of list) {
        const element = document.getElementById(id);
        if (!element) continue;
        if (element.getBoundingClientRect().top <= offset) {
          current = id;
        } else {
          break;
        }
      }
      const doc = document.documentElement;
      if (window.innerHeight + window.scrollY >= doc.scrollHeight - 8) {
        current = list[list.length - 1];
      }
      setActive((previous) => (previous === current ? previous : current));
    };

    const onScroll = (): void => {
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(compute);
    };

    compute();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, [key, offset]);

  return active;
}

/** 页面阅读进度（0–1，课程页顶部细进度条使用）。 */
export function useScrollProgress(): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;
    const compute = (): void => {
      frame = 0;
      const doc = document.documentElement;
      const total = doc.scrollHeight - window.innerHeight;
      const next = total > 0 ? window.scrollY / total : 0;
      setProgress(Math.min(1, Math.max(0, next)));
    };
    const onScroll = (): void => {
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(compute);
    };
    compute();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, []);

  return progress;
}
