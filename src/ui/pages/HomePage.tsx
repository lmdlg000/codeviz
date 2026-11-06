import { useMemo } from 'react';
import {
  chapters,
  getLessonsByChapter,
  lessons,
  samples,
} from '../../data';
import type { Chapter, CodeSample, Lesson } from '../../data/types';
import { analyzeCode } from '../../engine';
import type { AnalysisResult } from '../../engine/types';
import { MAX_CODE_LINES } from '../../engine/types';
import { useCompletedLessons } from '../hooks/useProgress';
import { hrefFor, labHref, lessonHref } from '../lib/router';
import { Badge } from '../components/Badge';
import { ButtonLink } from '../components/Button';
import { Icon, type IconName } from '../components/Icon';
import { ProgressBar } from '../components/Progress';
import { HeroVisual } from '../components/home/HeroVisual';

const CAPABILITIES: Array<{
  icon: IconName;
  tone: 'indigo' | 'teal' | 'violet' | 'amber' | 'sky' | 'rose';
  title: string;
  description: string;
}> = [
  {
    icon: 'flow',
    tone: 'indigo',
    title: '函数流程图',
    description: '把 if、for 与函数调用展开成有向图，看清每一次判断的走向。',
  },
  {
    icon: 'call',
    tone: 'sky',
    title: '调用关系图',
    description: '从 main 出发追踪调用层级，递归与外部库函数一目了然。',
  },
  {
    icon: 'class',
    tone: 'violet',
    title: '类与对象图',
    description: '字段、方法、访问控制与继承关系，按 UML 的思路排布清楚。',
  },
  {
    icon: 'memory',
    tone: 'amber',
    title: '内存布局',
    description: '全局区、栈帧与堆，数组格子和指针箭头都画出来。',
  },
  {
    icon: 'trace',
    tone: 'teal',
    title: '单步执行',
    description: '教学子集解释器逐句执行，变量、调用栈与输出同步变化。',
  },
  {
    icon: 'warning',
    tone: 'rose',
    title: '代码体检',
    description: '常见语法与风格问题给出中文提示与修改建议。',
  },
];

const PREVIEW_SAMPLE_IDS = ['bubble-sort', 'factorial', 'shape-polymorphism'];

function firstLessonHref(): string {
  return lessons.length > 0 ? lessonHref(lessons[0].id) : hrefFor('/learn');
}

function findPreviewSamples(): CodeSample[] {
  const preferred = PREVIEW_SAMPLE_IDS.map((id) => samples.find((sample) => sample.id === id)).filter(
    (sample): sample is CodeSample => Boolean(sample),
  );
  return (preferred.length > 0 ? preferred : samples).slice(0, 3);
}

function ChapterPathCard({ chapter }: { chapter: Chapter }) {
  const completed = useCompletedLessons();
  const chapterLessons = getLessonsByChapter(chapter.id);
  const done = chapterLessons.reduce((total, lesson) => total + (completed.has(lesson.id) ? 1 : 0), 0);

  return (
    <article className={`path-card tone-${chapter.tone}`}>
      <div className="path-card__bar" aria-hidden="true" />
      <header className="path-card__head">
        <span className="path-card__number tabular">
          {String(chapter.order).padStart(2, '0')}
        </span>
        <div className="path-card__titles">
          <h3 className="path-card__title">{chapter.title}</h3>
          <p className="path-card__subtitle">{chapter.subtitle}</p>
        </div>
      </header>

      <ul className="path-card__lessons">
        {chapterLessons.length === 0 ? (
          <li className="path-card__empty">这一章的课程正在编写。</li>
        ) : (
          chapterLessons.map((lesson: Lesson) => {
            const isDone = completed.has(lesson.id);
            return (
              <li key={lesson.id}>
                <a className="path-card__lesson" href={lessonHref(lesson.id)}>
                  <span className={isDone ? 'path-card__check is-done' : 'path-card__check'} aria-hidden="true">
                    <Icon name={isDone ? 'check' : 'chevron-right'} size={13} />
                  </span>
                  <span className="path-card__lesson-title">{lesson.title}</span>
                  <span className="path-card__lesson-minutes tabular">{lesson.minutes} 分钟</span>
                </a>
              </li>
            );
          })
        )}
      </ul>

      <footer className="path-card__foot">
        <ProgressBar
          value={done}
          total={chapterLessons.length}
          size="sm"
          tone={chapter.tone}
          label={`${chapter.title} 学习进度`}
        />
        <span className="path-card__count tabular">
          {done}/{chapterLessons.length}
        </span>
      </footer>
    </article>
  );
}

function LabPreviewSchematic({ sample, analysis }: { sample: CodeSample; analysis: AnalysisResult | null }) {
  const stats = analysis?.stats;
  return (
    <div className="lab-preview__panel" aria-hidden="true">
      <div className="lab-preview__panel-head">
        <span className="window-dots window-dots--light">
          <i />
          <i />
          <i />
        </span>
        <span className="mono">{sample.id}.{sample.language === 'cpp' ? 'cpp' : 'c'}</span>
      </div>
      <div className="lab-preview__stats">
        <div className="lab-preview__stat">
          <span className="lab-preview__stat-label">行数</span>
          <strong className="tabular">{stats?.totalLines ?? '—'}</strong>
        </div>
        <div className="lab-preview__stat">
          <span className="lab-preview__stat-label">函数</span>
          <strong className="tabular">{stats?.functions ?? '—'}</strong>
        </div>
        <div className="lab-preview__stat">
          <span className="lab-preview__stat-label">循环</span>
          <strong className="tabular">{stats?.loops ?? '—'}</strong>
        </div>
        <div className="lab-preview__stat">
          <span className="lab-preview__stat-label">诊断</span>
          <strong className="tabular">{analysis?.diagnostics.length ?? '—'}</strong>
        </div>
      </div>

      <svg viewBox="0 0 300 210" className="lab-preview__chart" role="presentation" fill="none">
        <defs>
          <marker id="preview-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 8 4 0 8z" fill="#94a3b8" />
          </marker>
        </defs>
        <rect x="112" y="8" width="76" height="26" rx="13" fill="#0f172a" />
        <text x="150" y="25" textAnchor="middle" className="lab-preview__chart-text lab-preview__chart-text--light">
          开始
        </text>
        <path d="M150 34v14" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#preview-arrow)" />
        <rect x="86" y="48" width="128" height="38" rx="9" fill="var(--primary-soft)" stroke="var(--primary)" strokeWidth="1.4" />
        <text x="150" y="66" textAnchor="middle" className="lab-preview__chart-text">
          for i = 0 … n-1
        </text>
        <text x="150" y="79" textAnchor="middle" className="lab-preview__chart-sub">
          逐项比较
        </text>
        <path d="M150 86v14" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#preview-arrow)" />
        <path d="M150 100 208 128 150 156 92 128Z" fill="var(--amber-soft)" stroke="var(--amber)" strokeWidth="1.4" />
        <text x="150" y="131" textAnchor="middle" className="lab-preview__chart-text">
          a[j] &gt; a[j+1] ?
        </text>
        <path d="M208 128h26a6 6 0 0 0 6-6V78a6 6 0 0 0-6-6h-20" stroke="var(--teal)" strokeWidth="1.4" strokeDasharray="4 4" markerEnd="url(#preview-arrow)" />
        <text x="238" y="168" className="lab-preview__chart-label lab-preview__chart-label--teal">
          下一轮
        </text>
        <path d="M92 128H66a6 6 0 0 1-6-6v54" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#preview-arrow)" />
        <rect x="24" y="176" width="84" height="26" rx="8" fill="var(--rose-soft)" stroke="var(--rose)" strokeWidth="1.4" />
        <text x="66" y="193" textAnchor="middle" className="lab-preview__chart-text">
          输出结果
        </text>
        <text x="184" y="197" className="lab-preview__chart-label">
          交换两数
        </text>
      </svg>
      <p className="lab-preview__hint">
        <Icon name="target" size={13} />
        点击节点可回到编辑器对应代码行
      </p>
    </div>
  );
}

export function HomePage() {
  const previewSamples = useMemo(findPreviewSamples, []);
  const primarySample = previewSamples[0];

  const previewAnalysis = useMemo<AnalysisResult | null>(() => {
    if (!primarySample) return null;
    try {
      return analyzeCode(primarySample.code, {
        filename: `${primarySample.id}.${primarySample.language === 'cpp' ? 'cpp' : 'c'}`,
      });
    } catch {
      return null;
    }
  }, [primarySample]);

  const quizCount = useMemo(
    () => lessons.reduce((total, lesson) => total + lesson.quiz.length, 0),
    [],
  );
  const labSampleLink = primarySample ? labHref(primarySample.id) : labHref();

  return (
    <div className="page home-page">
      {/* Hero */}
      <section className="home-hero" aria-labelledby="home-hero-title">
        <div className="home-hero__copy">
          <span className="hero-chip">
            <span className="hero-chip__dot" aria-hidden="true" />
            为 C/C++ 初学者设计
          </span>
          <h1 className="home-hero__title" id="home-hero-title">
            把 C / C++ 代码，
            <br />
            <span className="home-hero__accent">
              变成看得见的图。
              <svg className="home-hero__underline" viewBox="0 0 260 12" preserveAspectRatio="none" aria-hidden="true">
                <path d="M3 8.6C58 3.4 158 2.2 257 7.4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </span>
          </h1>
          <p className="home-hero__lead">
            上传 {MAX_CODE_LINES} 行以内的代码，立刻得到流程图、调用图、类图、内存布局与单步执行动画。
            抽象概念第一次变得触手可及。
          </p>
          <div className="home-hero__actions">
            <ButtonLink href={firstLessonHref()} variant="primary" size="lg" iconRight="arrow-right">
              开始学习
            </ButtonLink>
            <ButtonLink href={labHref()} variant="secondary" size="lg" icon="flask">
              打开代码实验室
            </ButtonLink>
          </div>
          <p className="home-hero__path">
            已经决定用 C++？<a href={hrefFor('/learn?path=cpp')}>走 C++ 直达路线</a>，指针、文件、位运算都可以晚点再看。
          </p>
          <p className="home-hero__meta">
            <span>{lessons.length} 节课程</span>
            <span aria-hidden="true">·</span>
            <span>{samples.length} 个示例</span>
            <span aria-hidden="true">·</span>
            <span>{quizCount} 道测验</span>
            <span aria-hidden="true">·</span>
            <span>全程本地分析</span>
          </p>
        </div>
        <HeroVisual />
      </section>

      {/* 能力 */}
      <section className="home-section" aria-labelledby="home-capabilities-title">
        <div className="home-section__head">
          <span className="eyebrow">
            <span className="eyebrow__dot" aria-hidden="true" />
            SIX VIEWS
          </span>
          <h2 className="home-section__title" id="home-capabilities-title">
            六个视角，拆开一段代码
          </h2>
          <p className="home-section__lead">
            同一段代码，从流程、调用、对象、内存、执行与质量六个角度观察，理解会自然连成一片。
          </p>
        </div>
        <ul className="capability-grid">
          {CAPABILITIES.map((capability) => (
            <li key={capability.title} className={`capability-card tone-${capability.tone}`}>
              <span className="capability-card__icon" aria-hidden="true">
                <Icon name={capability.icon} size={22} />
              </span>
              <h3 className="capability-card__title">{capability.title}</h3>
              <p className="capability-card__desc">{capability.description}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* 学习路径 */}
      <section className="home-section" aria-labelledby="home-path-title">
        <div className="home-section__head home-section__head--row">
          <div>
            <span className="eyebrow">
              <span className="eyebrow__dot" aria-hidden="true" />
              LEARNING PATH
            </span>
            <h2 className="home-section__title" id="home-path-title">
              一条从 printf 到多态的路径
            </h2>
            <p className="home-section__lead">四章、十三节，每节课都配有图解和可运行的示例。</p>
          </div>
          <ButtonLink href={hrefFor('/learn')} variant="ghost" iconRight="arrow-right">
            查看全部课程
          </ButtonLink>
        </div>
        <div className="path-grid">
          {chapters.map((chapter) => (
            <ChapterPathCard key={chapter.id} chapter={chapter} />
          ))}
        </div>
      </section>

      {/* 实验室预览 */}
      <section className="home-section" aria-labelledby="home-lab-title">
        <div className="lab-preview">
          <div className="lab-preview__copy">
            <span className="eyebrow">
              <span className="eyebrow__dot" aria-hidden="true" />
              LABORATORY
            </span>
            <h2 className="home-section__title" id="home-lab-title">
              把代码放进实验室，六个视角同时打开
            </h2>
            <p className="home-section__lead">
              选择示例或粘贴自己的代码，点击一次分析，就能在流程图、调用图与单步播放器之间来回对照。
            </p>

            {previewSamples.length === 0 ? (
              <div className="lab-preview__empty">
                <Icon name="flask" size={18} />
                示例库正在编写，稍后可以从实验室载入。
              </div>
            ) : (
              <ul className="lab-preview__samples">
                {previewSamples.map((sample) => (
                  <li key={sample.id}>
                    <a className="mini-sample" href={labHref(sample.id)}>
                      <span className="mini-sample__lang">{sample.language === 'cpp' ? 'C++' : 'C'}</span>
                      <span className="mini-sample__title">{sample.title}</span>
                      <Icon name="arrow-right" size={15} />
                    </a>
                  </li>
                ))}
              </ul>
            )}

            <div className="lab-preview__actions">
              <ButtonLink href={labSampleLink} variant="primary" icon="flask">
                在实验室打开示例
              </ButtonLink>
              <ButtonLink href={hrefFor('/lab')} variant="ghost">
                直接粘贴代码
              </ButtonLink>
            </div>
          </div>

          {primarySample ? (
            <LabPreviewSchematic sample={primarySample} analysis={previewAnalysis} />
          ) : (
            <div className="lab-preview__panel lab-preview__panel--empty">
              <Icon name="flow" size={28} />
              <p>载入任意示例后，这里会显示分析统计与流程图预览。</p>
            </div>
          )}
        </div>
      </section>

      {/* 参考说明 */}
      <aside className="home-reference">
        <Icon name="book" size={16} />
        <p>
          课程脉络参考谭浩强《C程序设计教程（第3版）》与《C++自学视频教程》，所有讲解、示例与图表均为原创。
          <a href={hrefFor('/about')}>了解参考教材与原创声明</a>
        </p>
      </aside>

      {/* 底部 CTA */}
      <section className="home-cta">
        <div className="home-cta__glow" aria-hidden="true" />
        <div className="home-cta__copy">
          <span className="home-cta__eyebrow">
            <Icon name="sparkle" size={15} />
            START WITH ONE LINE
          </span>
          <h2 className="home-cta__title">写下的每一行，都值得被看见。</h2>
          <p className="home-cta__text">
            从第一节开始，用图形建立直觉；或者直接打开实验室，让手边的代码先跑起来。
          </p>
        </div>
        <div className="home-cta__actions">
          <ButtonLink href={firstLessonHref()} variant="secondary" size="lg" iconRight="arrow-right">
            开始学习
          </ButtonLink>
          <ButtonLink href={hrefFor('/lab')} variant="ghost" size="lg" icon="flask">
            打开实验室
          </ButtonLink>
        </div>
      </section>

      <p className="home-footnote">
        <Badge tone="teal" dot>
          纯前端
        </Badge>
        所有分析都在你的浏览器里完成，代码不会离开这台设备。
      </p>
    </div>
  );
}
