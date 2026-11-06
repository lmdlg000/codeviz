import { useEffect, useRef, useState, type ReactNode } from 'react';
import { getLesson } from '../data';
import { useHashRoute } from './hooks/useHashRoute';
import { useTheme } from './hooks/useTheme';
import { useDocTitle } from './hooks/useDocTitle';
import { useIsMobile } from './hooks/useMediaQuery';
import { scrollToTop } from './lib/router';
import { applyTheme, resolveInitialTheme } from './lib/theme';
import { ToastProvider } from './components/ToastProvider';
import { Sidebar } from './layout/Sidebar';
import { MobileTopbar } from './layout/MobileTopbar';
import { MobileDrawer } from './layout/MobileDrawer';
import { HomePage } from './pages/HomePage';
import { LearnPage } from './pages/LearnPage';
import { LessonPage } from './pages/LessonPage';
import { LabPage } from './pages/LabPage';
import { MapPage } from './pages/MapPage';
import { AboutPage } from './pages/AboutPage';
import { NotFoundPage } from './pages/NotFoundPage';
import './styles/index.css';
import './viz/viz.css';

const SITE_TITLE = 'CodeViz · C/C++ 图解工坊';

// 首屏渲染前应用主题，避免深色模式闪白
applyTheme(resolveInitialTheme());

export default function App() {
  const route = useHashRoute();
  const { theme, toggleTheme } = useTheme();
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const previousPath = useRef(route.path);

  const lesson = route.name === 'lesson' ? getLesson(route.lessonId) : undefined;

  const title =
    route.name === 'home'
      ? SITE_TITLE
      : route.name === 'learn'
        ? `课程 · CodeViz`
        : route.name === 'lesson'
          ? lesson
            ? `${lesson.title} · CodeViz`
            : `页面未找到 · CodeViz`
          : route.name === 'lab'
            ? `代码实验室 · CodeViz`
            : route.name === 'map'
              ? `知识图谱 · CodeViz`
              : route.name === 'about'
                ? `关于 · CodeViz`
                : `页面未找到 · CodeViz`;
  useDocTitle(title);

  // 路由切换：回到页面顶部、关闭移动抽屉
  useEffect(() => {
    if (previousPath.current === route.path) return;
    previousPath.current = route.path;
    scrollToTop();
    setDrawerOpen(false);
  }, [route.path]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  useEffect(() => {
    if (!isMobile) setDrawerOpen(false);
  }, [isMobile]);

  let page: ReactNode;
  switch (route.name) {
    case 'home':
      page = <HomePage />;
      break;
    case 'learn':
      page = <LearnPage />;
      break;
    case 'lesson':
      page = lesson ? (
        <LessonPage key={lesson.id} lesson={lesson} />
      ) : (
        <NotFoundPage
          title="没有找到这节课。"
          description="课程链接可能已经变化，回到课程目录看看当前的章节安排。"
          path={route.path}
        />
      );
      break;
    case 'lab':
      page = <LabPage search={route.search} />;
      break;
    case 'map':
      page = <MapPage />;
      break;
    case 'about':
      page = <AboutPage />;
      break;
    default:
      page = <NotFoundPage path={route.path} />;
      break;
  }

  const focusMain = (): void => {
    const main = document.getElementById('main-content');
    main?.focus();
  };

  return (
    <ToastProvider>
      <button type="button" className="skip-link" onClick={focusMain}>
        跳到主内容
      </button>

      <div className="app-shell">
        <Sidebar
          active={route.name}
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        <MobileTopbar onMenu={() => setDrawerOpen(true)} />

        <div className="app-main">
          <main id="main-content" className="app-content" tabIndex={-1}>
            {page}
          </main>
        </div>

        <MobileDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          active={route.name}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      </div>
    </ToastProvider>
  );
}
