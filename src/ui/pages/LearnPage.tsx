import type { Chapter, Lesson } from '../../data/types';
import { chapters, getLessonsByChapter, lessons } from '../../data';
import { LEARNING_PATHS, pathById, type PathId } from '../../data/paths';
import { useCompletedLessons } from '../hooks/useProgress';
import { useHashRoute } from '../hooks/useHashRoute';
import { useLearningPath } from '../hooks/useLearningPath';
import { hrefFor, labHref, lessonHref } from '../lib/router';
import { PageHeader } from '../layout/PageHeader';
import { ButtonLink } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { SegmentedTabs } from '../components/Tabs';
import { InlineText } from '../lib/markdown';
import { ProgressRing } from '../components/Progress';
import { MAX_CODE_LINES } from '../../engine/types';

const DIFFICULTY_LABEL: Record<Lesson['difficulty'], string> = {
  1: '入门',
  2: '基础',
  3: '进阶',
};

interface LessonCardProps {
  lesson: Lesson;
  chapter: Chapter;
  /** 本路线下的补充提示（例如「用 cout 代替 printf」） */
  note?: string;
  /** 标记为「可跳过」时弱化展示 */
  muted?: boolean;
}

function LessonCard({ lesson, chapter, note, muted }: LessonCardProps) {
  const completed = useCompletedLessons();
  const isDone = completed.has(lesson.id);
  const codeBlocks = lesson.blocks.filter((block) => block.type === 'code').length;

  return (
    <li className={`tone-${chapter.tone}`}>
      <a
        className={[isDone ? 'lesson-card is-completed' : 'lesson-card', muted ? 'is-muted' : '']
          .filter(Boolean)
          .join(' ')}
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
        {note ? (
          <p className="lesson-card__note">
            <span className="lesson-card__note-tag mono">C++</span>
            <span className="lesson-card__note-text">
              <InlineText text={note} />
            </span>
          </p>
        ) : null}
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
  const route = useHashRoute();
  const { pathId, setPathId } = useLearningPath(route.query.get('path'));

  const path = pathById(pathId);
  const coreSet = new Set(path.core);
  const coreLessons = lessons.filter((lesson) => coreSet.has(lesson.id));
  const optionalLessons = lessons.filter((lesson) => path.optional.includes(lesson.id));
  const total = lessons.length;
  const pathDone = coreLessons.reduce((sum, lesson) => sum + (completed.has(lesson.id) ? 1 : 0), 0);

  const switchPath = (next: PathId): void => {
    setPathId(next);
    // 同步到地址栏，便于分享「我在学 C++ 直达路线」这一状态
    const nextHash = next === 'c' ? '#/learn' : `#/learn?path=${next}`;
    if (window.location.hash !== nextHash) {
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}${nextHash}`,
      );
    }
  };

  return (
    <div className="page learn-page">
      <PageHeader
        eyebrow="CURRICULUM"
        title="课程"
        description={
          pathId === 'cpp'
            ? `C++ 直达路线：${coreLessons.length} 节核心课，从变量与流程一路到类、继承与模板，C 专属内容标为可选。`
            : `从第一行 printf 到多态，${total} 节课把 C/C++ 的核心概念画出来。先读懂一张图，再回到代码里验证。`
        }
        actions={
          <ButtonLink href={labHref()} variant="secondary" icon="flask">
            从代码开始
          </ButtonLink>
        }
        aside={
          <div className="learn-progress">
            <ProgressRing
              value={pathDone}
              total={coreLessons.length}
              size={82}
              stroke={7}
              label={`${path.name}进度：已完成 ${pathDone} / ${coreLessons.length}`}
            />
            <div className="learn-progress__text">
              <span className="learn-progress__label">本路线</span>
              <span className="learn-progress__value tabular">
                已完成 {pathDone} / {coreLessons.length}
              </span>
            </div>
          </div>
        }
      />

      <div className="learn-path-switch">
        <SegmentedTabs
          items={LEARNING_PATHS.map((item) => ({
            id: item.id,
            label: item.name,
            count: item.core.length,
          }))}
          value={pathId}
          onChange={switchPath}
          ariaLabel="学习路线"
          idPrefix="learn-path"
        />
        <span className="learn-path-switch__hint">
          两条路线共用同一套课程，切换只改变「先学什么、哪些可以晚点看」
        </span>
      </div>

      <section
        className={`learn-path-note learn-path-note--${path.id}`}
        aria-labelledby="learn-path-note-title"
      >
        <span className="learn-path-note__icon" aria-hidden="true">
          <Icon name={path.id === 'cpp' ? 'rocket' : 'route'} size={20} />
        </span>
        <div className="learn-path-note__body">
          <h2 className="learn-path-note__title" id="learn-path-note-title">
            {path.name}
            <span className="learn-path-note__tagline">{path.tagline}</span>
          </h2>
          <p className="learn-path-note__text">{path.description}</p>
        </div>
      </section>

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
            const chapterLessons = getLessonsByChapter(chapter.id).filter((lesson) =>
              coreSet.has(lesson.id),
            );
            if (chapterLessons.length === 0) return null;
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

                <ul className="lesson-grid">
                  {chapterLessons.map((lesson) => (
                    <LessonCard
                      key={lesson.id}
                      lesson={lesson}
                      chapter={chapter}
                      note={path.notes[lesson.id]}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {optionalLessons.length > 0 ? (
        <section className="learn-optional" aria-labelledby="learn-optional-title">
          <header className="learn-optional__head">
            <span className="learn-optional__icon" aria-hidden="true">
              <Icon name="layers" size={17} />
            </span>
            <h2 className="learn-optional__title" id="learn-optional-title">
              可以直接跳过 · 需要时再回来看
            </h2>
            <span className="learn-optional__count tabular">{optionalLessons.length} 节</span>
          </header>
          <p className="learn-optional__text">
            这几节是 C 语言专属或更底层的内容。C++ 里用引用、std::string、std::vector 与 fstream
            就能覆盖大部分场景；等你遇到「为什么要这样」时再来补，效率更高。
          </p>
          <ul className="lesson-grid">
            {optionalLessons.map((lesson) => {
              const chapter = chapters.find((item) => item.id === lesson.chapterId) ?? chapters[0];
              return <LessonCard key={lesson.id} lesson={lesson} chapter={chapter} muted />;
            })}
          </ul>
        </section>
      ) : null}

      <aside className="learn-banner">
        <span className="learn-banner__icon" aria-hidden="true">
          <Icon name="flask" size={22} />
        </span>
        <div className="learn-banner__copy">
          <h2 className="learn-banner__title">有自己的代码想拆开看看？</h2>
          <p className="learn-banner__text">
            粘贴或上传不超过 {MAX_CODE_LINES} 行的 C/C++ 代码，六种视图一次生成。
          </p>
        </div>
        <ButtonLink href={hrefFor('/lab')} variant="primary" iconRight="arrow-right">
          进入代码实验室
        </ButtonLink>
      </aside>
    </div>
  );
}
