import { useMemo } from 'react';
import type { Lesson } from '../../data/types';
import { getChapterOfLesson, getLessonNeighbors } from '../../data';
import { useCompletedLessons } from '../hooks/useProgress';
import { toggleLessonComplete } from '../lib/progress';
import { useScrollProgress, useScrollSpy } from '../hooks/useScrollSpy';
import { useToast } from '../hooks/useToast';
import { hrefFor, labHref, lessonHref } from '../lib/router';
import { InlineText } from '../lib/markdown';
import { Badge } from '../components/Badge';
import { Button, ButtonLink } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { LessonBlocks, getTocItems } from '../components/LessonBlocks';
import { Quiz } from '../components/Quiz';

const DIFFICULTY_LABEL: Record<Lesson['difficulty'], string> = {
  1: '入门',
  2: '基础',
  3: '进阶',
};

function scrollToSection(id: string): void {
  const element = document.getElementById(id);
  if (!element) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const top = element.getBoundingClientRect().top + window.scrollY - 104;
  window.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
}

export interface LessonPageProps {
  lesson: Lesson;
}

export function LessonPage({ lesson }: LessonPageProps) {
  const chapter = getChapterOfLesson(lesson);
  const completed = useCompletedLessons();
  const isDone = completed.has(lesson.id);
  const neighbors = useMemo(() => getLessonNeighbors(lesson.id), [lesson.id]);
  const tocItems = useMemo(() => getTocItems(lesson.blocks), [lesson.blocks]);
  const tocKey = tocItems.map((item) => item.id);
  const activeId = useScrollSpy(tocKey);
  const readingProgress = useScrollProgress();
  const { pushToast } = useToast();

  const chapterTone = chapter?.tone ?? 'indigo';
  const chapterTitle = chapter?.title ?? '课程';

  const onToggleComplete = (): void => {
    const next = toggleLessonComplete(lesson.id);
    pushToast(next ? '已标记本节完成' : '已取消完成标记', next ? 'success' : 'info');
  };

  const jumpTo = (id: string, closeDetails?: boolean): void => {
    if (closeDetails) {
      const details = document.getElementById('lesson-toc-mobile');
      details?.removeAttribute('open');
    }
    scrollToSection(id);
  };

  return (
    <div className={`page lesson-page tone-${chapterTone}`}>
      <div className="reading-progress" aria-hidden="true">
        <span className="reading-progress__fill" style={{ width: `${readingProgress * 100}%` }} />
      </div>

      <nav className="breadcrumb" aria-label="面包屑">
        <a href={hrefFor('/learn')}>教程</a>
        <Icon name="chevron-right" size={13} />
        <a href={hrefFor('/learn')}>{chapterTitle}</a>
        <Icon name="chevron-right" size={13} />
        <span aria-current="page">{lesson.title}</span>
      </nav>

      <header className="lesson-hero">
        <div className="lesson-hero__main">
          <div className="lesson-hero__badges">
            <Badge tone={chapterTone}>{chapterTitle}</Badge>
            <Badge tone="neutral" mono>
              第 {lesson.order} 课
            </Badge>
            {isDone ? (
              <Badge tone="success" icon="check">
                已完成
              </Badge>
            ) : null}
          </div>
          <h1 className="lesson-hero__title">{lesson.title}</h1>
          <p className="lesson-hero__subtitle">{lesson.subtitle}</p>
          <div className="lesson-hero__meta">
            <span className="lesson-hero__meta-item">
              <Icon name="clock" size={15} />
              约 {lesson.minutes} 分钟
            </span>
            <span className="lesson-hero__meta-item">
              <Icon name="target" size={15} />
              {DIFFICULTY_LABEL[lesson.difficulty]}
            </span>
            <span className="lesson-hero__meta-item">
              <Icon name="circle-check" size={15} />
              {lesson.quiz.length} 道测验
            </span>
            {lesson.labSampleId ? (
              <ButtonLink
                href={labHref(lesson.labSampleId)}
                variant="secondary"
                size="sm"
                icon="flask"
                className="lesson-hero__lab"
              >
                在实验室查看示例
              </ButtonLink>
            ) : null}
          </div>
        </div>
        <div className="lesson-hero__mark" aria-hidden="true">
          <span className="lesson-hero__mark-num tabular">
            {chapter ? String(chapter.order).padStart(2, '0') : 'CV'}
          </span>
          <span className="lesson-hero__mark-label">{chapter?.shortTitle ?? 'CodeViz'}</span>
        </div>
      </header>

      {lesson.objectives.length > 0 ? (
        <section className="objectives" aria-labelledby="objectives-title">
          <div className="objectives__head">
            <span className="objectives__icon" aria-hidden="true">
              <Icon name="target" size={18} />
            </span>
            <h2 className="objectives__title" id="objectives-title">
              本节你将掌握
            </h2>
          </div>
          <ul className="objectives__list">
            {lesson.objectives.map((objective, index) => (
              <li key={index} className="objectives__item">
                <Icon name="check" size={15} />
                <span>
                  <InlineText text={objective} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tocItems.length > 0 ? (
        <details className="lesson-toc-mobile" id="lesson-toc-mobile">
          <summary className="lesson-toc-mobile__summary">
            <span>
              <Icon name="book" size={16} />
              本节目录
            </span>
            <Icon name="chevron-down" size={16} />
          </summary>
          <ol className="lesson-toc-mobile__list">
            {tocItems.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => jumpTo(item.id, true)}>
                  {item.text}
                </button>
              </li>
            ))}
          </ol>
        </details>
      ) : null}

      <div className="lesson-layout">
        <article className="lesson-article">
          {lesson.blocks.length > 0 ? (
            <LessonBlocks blocks={lesson.blocks} />
          ) : (
            <EmptyState
              icon="book"
              title="正文正在编写"
              description="这一节的讲解正在整理，可以先通过测验检查已有知识，或直接打开实验室动手。"
              action={
                <ButtonLink href={labHref()} variant="primary" icon="flask">
                  打开代码实验室
                </ButtonLink>
              }
            />
          )}

          {lesson.keyPoints.length > 0 ? (
            <section className="key-points" aria-labelledby="key-points-title">
              <div className="key-points__head">
                <span className="key-points__icon" aria-hidden="true">
                  <Icon name="lightbulb" size={19} />
                </span>
                <h2 className="key-points__title" id="key-points-title">
                  关键要点
                </h2>
              </div>
              <ul className="key-points__list">
                {lesson.keyPoints.map((point, index) => (
                  <li key={index} className="key-points__item">
                    <span className="key-points__num tabular" aria-hidden="true">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span>
                      <InlineText text={point} />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="lesson-complete-mobile">
            <Button
              variant={isDone ? 'secondary' : 'primary'}
              icon={isDone ? 'check' : 'circle-check'}
              onClick={onToggleComplete}
              block
            >
              {isDone ? '已完成本节' : '标记本节完成'}
            </Button>
            <p className="lesson-complete-mobile__hint">进度保存在本地浏览器，刷新不会丢。</p>
          </div>

          <Quiz lessonId={lesson.id} questions={lesson.quiz} />

          <nav className="lesson-pager" aria-label="课程翻页">
            {neighbors.previous ? (
              <a className="lesson-pager__link lesson-pager__link--prev" href={lessonHref(neighbors.previous.id)}>
                <span className="lesson-pager__label">
                  <Icon name="arrow-left" size={14} />
                  上一课
                </span>
                <span className="lesson-pager__title">{neighbors.previous.title}</span>
              </a>
            ) : (
              <span className="lesson-pager__link lesson-pager__link--empty" />
            )}
            {neighbors.next ? (
              <a className="lesson-pager__link lesson-pager__link--next" href={lessonHref(neighbors.next.id)}>
                <span className="lesson-pager__label">
                  下一课
                  <Icon name="arrow-right" size={14} />
                </span>
                <span className="lesson-pager__title">{neighbors.next.title}</span>
              </a>
            ) : (
              <a className="lesson-pager__link lesson-pager__link--next" href={hrefFor('/learn')}>
                <span className="lesson-pager__label">回到课程目录</span>
                <span className="lesson-pager__title">继续选择下一节</span>
              </a>
            )}
          </nav>
        </article>

        <aside className="lesson-aside" aria-label="本节目录与进度">
          <div className="lesson-aside__inner">
            {tocItems.length > 0 ? (
              <nav className="lesson-toc" aria-label="本节目录">
                <div className="lesson-toc__head">
                  <span className="lesson-toc__eyebrow">ON THIS PAGE</span>
                  <span className="lesson-toc__count tabular">{tocItems.length} 节</span>
                </div>
                <ol className="lesson-toc__list">
                  {tocItems.map((item, index) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={
                          activeId === item.id ? 'lesson-toc__link is-active' : 'lesson-toc__link'
                        }
                        aria-current={activeId === item.id ? 'location' : undefined}
                        onClick={() => jumpTo(item.id)}
                      >
                        <span className="lesson-toc__index tabular" aria-hidden="true">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <span className="lesson-toc__text">{item.text}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </nav>
            ) : null}

            <div className="lesson-aside__complete">
              <Button
                variant={isDone ? 'secondary' : 'primary'}
                icon={isDone ? 'check' : 'circle-check'}
                onClick={onToggleComplete}
                block
              >
                {isDone ? '已完成本节' : '标记本节完成'}
              </Button>
              <p className="lesson-aside__hint">进度保存在本地浏览器，刷新不会丢。</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
