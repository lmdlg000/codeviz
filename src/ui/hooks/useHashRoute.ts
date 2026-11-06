import { useEffect, useState } from 'react';
import { readLocation, type ParsedRoute } from '../lib/router';

/**
 * 订阅 hash 路由；首次挂载时把空 hash 归一化为 `#/`，刷新直达也落在正确页面。
 */
export function useHashRoute(): ParsedRoute {
  const [route, setRoute] = useState<ParsedRoute>(() => readLocation());

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith('#/')) {
      // 空 hash 或误输入的非路由锚点，归一到首页且不新增历史记录
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/`);
    }

    const onHashChange = (): void => {
      setRoute(readLocation());
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return route;
}
