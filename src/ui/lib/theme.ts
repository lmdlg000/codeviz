/**
 * 主题：默认跟随系统，用户切换后持久化到 localStorage 的 `codeviz.theme`。
 */
import { STORAGE_KEYS, readString, writeString } from './storage';

export type Theme = 'light' | 'dark';

const THEME_KEY = STORAGE_KEYS.theme;

export function isTheme(value: string | null | undefined): value is Theme {
  return value === 'light' || value === 'dark';
}

export function getSystemTheme(): Theme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getStoredTheme(): Theme | null {
  const value = readString(THEME_KEY, '');
  return isTheme(value) ? value : null;
}

export function resolveInitialTheme(): Theme {
  return getStoredTheme() ?? getSystemTheme();
}

export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', theme === 'dark' ? '#0a0f1d' : '#f6f7fb');
  }
}

export function persistTheme(theme: Theme): void {
  writeString(THEME_KEY, theme);
}

/** 监听系统主题变化（仅在用户没有手动选择时使用）。 */
export function subscribeSystemTheme(callback: (theme: Theme) => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (event: MediaQueryListEvent): void => {
    callback(event.matches ? 'dark' : 'light');
  };
  media.addEventListener('change', handler);
  return () => media.removeEventListener('change', handler);
}
