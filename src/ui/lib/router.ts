/**
 * 极简 hash 路由：不依赖第三方库，刷新直达不会 404。
 * 支持：
 *   #/                    首页
 *   #/learn               课程目录
 *   #/learn/:id           课程详情
 *   #/lab?sample=x&code=  代码实验室
 *   #/map                 知识图谱
 *   #/about               关于
 */

export type RouteName =
  | 'home'
  | 'learn'
  | 'lesson'
  | 'lab'
  | 'map'
  | 'about'
  | 'notfound';

export interface ParsedRoute {
  name: RouteName;
  /** 课程详情页的课程 id */
  lessonId?: string;
  /** 原始 query 字符串（不含 ?） */
  search: string;
  query: URLSearchParams;
  /** 归一化后的路径，例如 /learn/c01-hello */
  path: string;
}

const KNOWN_TOP = new Set(['learn', 'lab', 'map', 'about']);

export function normalizeHash(hash: string): string {
  let raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw.startsWith('/')) raw = `/${raw}`;
  if (raw === '/') return raw;
  return raw.replace(/\/+$/, '') || '/';
}

export function parseHash(hash: string): ParsedRoute {
  const normalized = normalizeHash(hash);
  const queryIndex = normalized.indexOf('?');
  const pathPart = queryIndex >= 0 ? normalized.slice(0, queryIndex) : normalized;
  const search = queryIndex >= 0 ? normalized.slice(queryIndex + 1) : '';
  const query = new URLSearchParams(search);
  const segments = pathPart.split('/').filter(Boolean);

  if (segments.length === 0) {
    return { name: 'home', search, query, path: '/' };
  }

  const [first, second, ...rest] = segments;

  if (first === 'learn' && !second) {
    return { name: 'learn', search, query, path: '/learn' };
  }
  if (first === 'learn' && second && rest.length === 0) {
    return {
      name: 'lesson',
      lessonId: decodeURIComponent(second),
      search,
      query,
      path: `/learn/${second}`,
    };
  }
  if (first === 'lab' && !second) {
    return { name: 'lab', search, query, path: '/lab' };
  }
  if (first === 'map' && !second) {
    return { name: 'map', search, query, path: '/map' };
  }
  if (first === 'about' && !second) {
    return { name: 'about', search, query, path: '/about' };
  }
  if (KNOWN_TOP.has(first)) {
    return { name: 'notfound', search, query, path: pathPart };
  }
  return { name: 'notfound', search, query, path: pathPart };
}

/** 由当前地址栏解析；空 hash 视为首页，但不主动改写 URL。 */
export function readLocation(): ParsedRoute {
  if (typeof window === 'undefined') {
    return { name: 'home', search: '', query: new URLSearchParams(), path: '/' };
  }
  return parseHash(window.location.hash);
}

/** 导航到应用内路径（必须以 / 开头，可带 query）。 */
export function navigate(path: string): void {
  if (typeof window === 'undefined') return;
  const target = path.startsWith('/') ? path : `/${path}`;
  if (window.location.hash === `#${target}`) return;
  window.location.hash = target;
}

/** 生成 <a href> 的 hash 地址。 */
export function hrefFor(path: string): string {
  return `#${path.startsWith('/') ? path : `/${path}`}`;
}

/** 课程实验室地址（示例 id 可选）。 */
export function labHref(sampleId?: string): string {
  return sampleId ? hrefFor(`/lab?sample=${encodeURIComponent(sampleId)}`) : hrefFor('/lab');
}

/** 课程详情地址。 */
export function lessonHref(lessonId: string): string {
  return hrefFor(`/learn/${encodeURIComponent(lessonId)}`);
}

export function isActiveRoute(route: ParsedRoute, name: RouteName): boolean {
  if (name === 'learn') return route.name === 'learn' || route.name === 'lesson';
  return route.name === name;
}

/** route 变化时滚回顶部（课程内锚点滚动不经过路由，因此不受影响）。 */
export function scrollToTop(): void {
  if (typeof window === 'undefined') return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'auto' });
}
