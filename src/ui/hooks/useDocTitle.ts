import { useEffect } from 'react';

/** 路由切换时同步 document.title。 */
export function useDocTitle(title: string): void {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
