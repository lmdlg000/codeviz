import { useEffect, useState } from 'react';

/** 匹配 CSS media query 并随窗口变化更新。 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const media = window.matchMedia(query);
    const handler = (): void => setMatches(media.matches);
    handler();
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

/** 与 DESIGN_BRIEF 的 960px 断点一致。 */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 959px)');
}
