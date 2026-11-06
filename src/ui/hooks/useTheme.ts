import { useCallback, useEffect, useState } from 'react';
import {
  applyTheme,
  getStoredTheme,
  persistTheme,
  resolveInitialTheme,
  subscribeSystemTheme,
  type Theme,
} from '../lib/theme';

/**
 * 主题状态：默认跟随系统；用户切换后写 localStorage，不再跟随系统。
 */
export function useTheme(): {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
} {
  const [theme, setThemeState] = useState<Theme>(() => resolveInitialTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (getStoredTheme()) return undefined;
    return subscribeSystemTheme((next) => setThemeState(next));
  }, []);

  const setTheme = useCallback((next: Theme) => {
    persistTheme(next);
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      persistTheme(next);
      return next;
    });
  }, []);

  return { theme, setTheme, toggleTheme };
}
