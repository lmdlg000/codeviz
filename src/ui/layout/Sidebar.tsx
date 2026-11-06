import { useId } from 'react';
import { chapters, getLessonsByChapter } from '../../data';
import type { Chapter } from '../../data/types';
import { useCompletedLessons } from '../hooks/useProgress';
import type { RouteName } from '../lib/router';
import { hrefFor } from '../lib/router';
import type { Theme } from '../lib/theme';
import { Icon, type IconName } from '../components/Icon';
import { Logo } from '../components/Logo';
import { ProgressBar } from '../components/Progress';

export interface SidebarBodyProps {
  active: RouteName;
  theme: Theme;
  onToggleTheme: () => void;
  onNavigate?: () => void;
}

const NAV_ITEMS: Array<{ name: RouteName; label: string; path: string; icon: IconName }> = [
  { name: 'home', label: '首页', path: '/', icon: 'home' },
  { name: 'learn', label: '教程', path: '/learn', icon: 'book' },
  { name: 'lab', label: '实验室', path: '/lab', icon: 'flask' },
  { name: 'map', label: '知识图谱', path: '/map', icon: 'map' },
  { name: 'about', label: '关于', path: '/about', icon: 'info' },
];

function isItemActive(active: RouteName, name: RouteName): boolean {
  if (name === 'learn') return active === 'learn' || active === 'lesson';
  return active === name;
}

function ChapterProgress({ chapter }: { chapter: Chapter }) {
  const completed = useCompletedLessons();
  const lessons = getLessonsByChapter(chapter.id);
  const done = lessons.reduce((total, lesson) => total + (completed.has(lesson.id) ? 1 : 0), 0);
  const firstLesson = lessons[0];
  const href = firstLesson ? hrefFor(`/learn/${firstLesson.id}`) : hrefFor('/learn');
  return (
    <li>
      <a
        className="chapter-progress"
        href={href}
        aria-label={`${chapter.title}，已完成 ${done} / ${lessons.length} 课`}
      >
        <span className={`chapter-progress__mark tone-${chapter.tone}`} aria-hidden="true" />
        <span className="chapter-progress__row">
          <span className="chapter-progress__name">{chapter.title}</span>
          <span className="chapter-progress__count tabular">
            {done}/{lessons.length}
          </span>
        </span>
        <ProgressBar
          value={done}
          total={lessons.length}
          size="sm"
          tone={chapter.tone}
          label={`${chapter.title} 进度`}
        />
      </a>
    </li>
  );
}

/** 侧栏内容（桌面侧栏与移动抽屉共用）。 */
export function SidebarBody({ active, theme, onToggleTheme, onNavigate }: SidebarBodyProps) {
  const progressHeadingId = useId();
  return (
    <div className="sidebar__inner">
      <a className="sidebar__brand" href="#/" onClick={onNavigate} aria-label="CodeViz 首页">
        <Logo size={38} />
        <span className="sidebar__brand-text">
          <span className="sidebar__brand-name">CodeViz</span>
          <span className="sidebar__brand-sub">C/C++ 图解工坊</span>
        </span>
      </a>

      <nav className="sidebar__nav" aria-label="主导航">
        {NAV_ITEMS.map((item) => {
          const selected = isItemActive(active, item.name);
          return (
            <a
              key={item.name}
              href={hrefFor(item.path)}
              className={selected ? 'sidebar__link is-active' : 'sidebar__link'}
              aria-current={selected ? 'page' : undefined}
              onClick={onNavigate}
            >
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>

      <section className="sidebar__progress" aria-labelledby={progressHeadingId}>
        <div className="sidebar__section-head">
          <span className="sidebar__section-title" id={progressHeadingId}>
            学习进度
          </span>
          <span className="sidebar__section-hint">{chapters.length} 个章节</span>
        </div>
        <ul className="sidebar__chapters">
          {chapters.map((chapter) => (
            <ChapterProgress key={chapter.id} chapter={chapter} />
          ))}
        </ul>
      </section>

      <div className="sidebar__bottom">
        <button
          type="button"
          className="sidebar__theme"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
        >
          <span className="sidebar__theme-icon">
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
          </span>
          <span>{theme === 'dark' ? '浅色模式' : '深色模式'}</span>
        </button>
        <div className="sidebar__meta">
          <span className="mono">v1.0</span>
          <span>纯本地分析 · 数据不出浏览器</span>
        </div>
      </div>
    </div>
  );
}

export function Sidebar(props: SidebarBodyProps) {
  return (
    <aside className="sidebar" aria-label="站点侧栏">
      <SidebarBody {...props} />
    </aside>
  );
}
