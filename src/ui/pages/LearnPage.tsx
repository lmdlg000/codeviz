import type { Chapter, Lesson } from '../../data/types';
import { chapters, getLessonsByChapter, lessons } from '../../data';
import { useCompletedLessons } from '../hooks/useProgress';
import { hrefFor, labHref, lessonHref } from '../lib/router';
import { PageHeader } from '../layout/PageHeader';
import { ButtonLink } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { ProgressRing } from '../components/Progress';

const DIFFICULTY_LABEL: Record<Lesson['difficulty'], string> = {
  1: '入门',
  2: '基础',
  3: '进阶',
};

function LessonCard({ lesson, chapter }: { lesson: Lesson; chapter: Chapter }) {
  const completed = useCompletedLessons();
  const isDone = completed.has(lesson.id);
  const codeBlocks = lesson.blocks.filter((block) => block.type === 'code').length;

  return (
    <li className={`tone-${chapter.tone}`}>
      <a
        className={isDone ? 'lesson-card is-completed' : 'lesson-card'}
        href={lessonHref(lesson.id)}
        aria-label={`${lesson.title}，${DIFFICULTY_LABEL[lesson.difficulty]}，约 ${lesson.minutes} 分钟${isDone ? '，已完成' : ''}`}
      >
        <div className="lesson-card__top">
          <span className="lesson-card__order mono tabular">
            {String(lesson.order).padStart(2, '0')}
          </span>
          <span className={isDone ? 'lesson-card__status is-done' : 'lesson-card__status'}>
            {isDone ? <Icon name="check" size={13} /> : <Icon name="arrow-right" size={15} />}
            <span className="sr-only">{isDone ? '已完成' : '未完成'}</span>
          </span>
        </div>
        <h3 className="lesson-card__title">{lesson.title}</h3>
        <p className="lesson-card__desc">{lesson.description}</p>
        <div className="lesson-card__meta">
          <span className="lesson-card__meta-item">
            <Icon name="clock" size={13} />
            {lesson.minutes} 分钟
          </span>
          <span className="lesson-card__meta-item">{DIFFICULTY_LABEL[lesson.difficulty]}</span>
          <span className="lesson-card__meta-item">
            <Icon name="code" size={13} />
            {codeBlocks} 段代码
          </span>
          <span className="lesson-card__meta-item">{lesson.quiz.length} 道测验</span>
        </div>
      </a>
    </li>
  );
}

export function LearnPage() {
  const completed = useCompletedLessons();
  const total = lessons.length;
  const done = lessons.reduce((sum, lesson) => sum + (completed.has(lesson.id) ? 1 : 0), 0);

  return (
    <div className="page learn-page">
      <PageHeader
        eyebrow="CURRICULUM"
        title="课程"
        description={`从第一行 printf 到多态，${total} 节课把 C/C++ 的核心概念画出来。先读懂一张图，再回到代码里验证。`}
        actions={
          <ButtonLink href={labHref()} variant="secondary" icon="flask">
            从代码开始
          </ButtonLink>
        }
        aside={
          <div className="learn-progress">
            <ProgressRing value={done} total={total} size={82} stroke={7} label={`课程总进度：已完成 ${done} / ${total}`} />
            <div className="learn-progress__text">
              <span className="learn-progress__label">总进度</span>
              <span className="learn-progress__value tabular">
                已完成 {done} / {total}
              </span>
            </div>
          </div>
        }
      />

      {total === 0 ? (
        <EmptyState
          art={undefined}
          icon="book"
          title="课程内容正在整理"
          description="教程正在编写中。你仍然可以打开代码实验室，先从自己的代码开始观察。"
          action={
            <ButtonLink href={labHref()} variant="primary" icon="flask">
              打开代码实验室
            </ButtonLink>
          }
        />
      ) : (
        <div className="learn-chapters">
          {chapters.map((chapter) => {
            const chapterLessons = getLessonsByChapter(chapter.id);
            const chapterDone = chapterLessons.reduce(
              (sum, lesson) => sum + (completed.has(lesson.id) ? 1 : 0),
              0,
            );
            return (
              <section
                className={`learn-chapter tone-${chapter.tone}`}
                key={chapter.id}
                aria-labelledby={`chapter-${chapter.id}`}
              >
                <header className="learn-chapter__head">
                  <span className="learn-chapter__num tabular">
                    {String(chapter.order).padStart(2, '0')}
                  </span>
                  <div className="learn-chapter__titles">
                    <h2 className="learn-chapter__title" id={`chapter-${chapter.id}`}>
                      {chapter.title}
                    </h2>
                    <p className="learn-chapter__subtitle">{chapter.subtitle}</p>
                  </div>
                  <span className="learn-chapter__count tabular">
                    {chapterDone}/{chapterLessons.length} 已完成
                  </span>
                </header>

                {chapterLessons.length === 0 ? (
                  <p className="learn-chapter__empty">这一章的课程正在编写，可以先看看其它章节。</p>
                ) : (
                  <ul className="lesson-grid">
                    {chapterLessons.map((lesson) => (
                      <LessonCard key={lesson.id} lesson={lesson} chapter={chapter} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      <aside className="learn-banner">
        <span className="learn-banner__icon" aria-hidden="true">
          <Icon name="flask" size={22} />
        </span>
        <div className="learn-banner__copy">
          <h2 className="learn-banner__title">有自己的代码想拆开看看？</h2>
          <p className="learn-banner__text">粘贴或上传不超过 500 行的 C/C++ 代码，六种视图一次生成。</p>
        </div>
        <ButtonLink href={hrefFor('/lab')} variant="primary" iconRight="arrow-right">
          进入代码实验室
        </ButtonLink>
      </aside>
    </div>
  );
}
