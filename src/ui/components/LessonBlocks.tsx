import type { CodePane, DiagramSpec, LessonBlock } from '../../data/types';
import type { SourceLanguage } from '../../engine/types';
import { detectLanguage } from '../../engine';
import { InlineText, TextBody } from '../lib/markdown';
import { handoffToLab } from '../lib/lab';
import { navigate } from '../lib/router';
import { AnalyzedDiagram } from '../viz';
import { CodeBlock } from './CodeBlock';
import { Icon, type IconName } from './Icon';

/* --------------------------------- 目录 --------------------------------- */

export interface TocItem {
  id: string;
  text: string;
}

export function headingIdFor(blockIndex: number): string {
  return `lesson-section-${blockIndex + 1}`;
}

export function getTocItems(blocks: LessonBlock[]): TocItem[] {
  const items: TocItem[] = [];
  blocks.forEach((block, index) => {
    if (block.type === 'heading' && block.text.trim().length > 0) {
      items.push({ id: headingIdFor(index), text: block.text });
    }
  });
  return items;
}

/* ------------------------------- 实验室跳转 ------------------------------ */

const FILENAME_PATTERN = /\.(c|cc|cpp|cxx|h|hpp|txt)$/i;

function filenameFor(title: string | undefined, language: SourceLanguage): string {
  const trimmed = title?.trim();
  if (trimmed && FILENAME_PATTERN.test(trimmed)) return trimmed;
  return language === 'cpp' ? 'snippet.cpp' : 'snippet.c';
}

interface OpenLabOptions {
  code: string;
  language?: SourceLanguage;
  title?: string;
}

function openInLab({ code, language, title }: OpenLabOptions): void {
  const resolved = language ?? detectLanguage(code);
  handoffToLab(code, filenameFor(title, resolved));
  navigate('/lab');
}

function paneLanguage(pane: CodePane): SourceLanguage {
  return pane.language ?? detectLanguage(pane.code);
}

/* --------------------------------- 图标 --------------------------------- */

const DIAGRAM_META: Record<
  DiagramSpec['kind'],
  { label: string; icon: IconName }
> = {
  flow: { label: '函数流程图', icon: 'flow' },
  calls: { label: '调用关系图', icon: 'call' },
  classes: { label: '类与对象图', icon: 'class' },
  memory: { label: '内存布局', icon: 'memory' },
  trace: { label: '单步执行', icon: 'trace' },
};

const NOTE_META: Record<'tip' | 'info' | 'warn' | 'danger', { icon: IconName; label: string }> = {
  tip: { icon: 'lightbulb', label: '小提示' },
  info: { icon: 'info', label: '说明' },
  warn: { icon: 'warning', label: '注意' },
  danger: { icon: 'warning', label: '易错点' },
};

/* ------------------------------- 图形卡片 ------------------------------- */

function DiagramCard({ diagram, title, caption }: { diagram: DiagramSpec; title?: string; caption?: string }) {
  const meta = DIAGRAM_META[diagram.kind];
  const openLab = (): void => {
    const language = detectLanguage(diagram.code);
    handoffToLab(diagram.code, filenameFor(undefined, language));
    navigate('/lab');
  };

  return (
    <figure className="diagram-card">
      <div className="diagram-card__head">
        <div className="diagram-card__heading">
          <span className="diagram-card__kind">
            <Icon name={meta.icon} size={15} />
            {meta.label}
          </span>
          {title ? <h3 className="diagram-card__title">{title}</h3> : null}
        </div>
      </div>
      {caption ? (
        <p className="diagram-card__caption">
          <InlineText text={caption} />
        </p>
      ) : null}
      <div className="diagram-card__body">
        <AnalyzedDiagram
          kind={diagram.kind}
          code={diagram.code}
          functionName={diagram.kind === 'flow' ? diagram.functionName : undefined}
          autoplay={diagram.kind === 'trace' ? diagram.autoplay : undefined}
          onOpenLab={openLab}
          compact
        />
      </div>
    </figure>
  );
}

/* -------------------------------- 单块渲染 ------------------------------- */

function BlockView({ block, index }: { block: LessonBlock; index: number }) {
  switch (block.type) {
    case 'heading':
      return (
        <h2 className="lesson-heading" id={headingIdFor(index)}>
          {block.text}
        </h2>
      );

    case 'text':
      return <TextBody body={block.body} />;

    case 'list': {
      const items = block.items.map((item, itemIndex) => (
        <li key={itemIndex} className="lesson-list__item">
          <InlineText text={item} />
        </li>
      ));
      return block.ordered ? (
        <ol className="lesson-list lesson-list--ordered">{items}</ol>
      ) : (
        <ul className="lesson-list">{items}</ul>
      );
    }

    case 'note': {
      const meta = NOTE_META[block.tone] ?? NOTE_META.info;
      return (
        <aside className={`note-block note-block--${block.tone}`}>
          <span className="note-block__icon" aria-hidden="true">
            <Icon name={meta.icon} size={19} />
          </span>
          <div className="note-block__body">
            <h3 className="note-block__title">
              <span className="sr-only">{meta.label}：</span>
              {block.title}
            </h3>
            <div className="note-block__text">
              <TextBody body={block.body} />
            </div>
          </div>
        </aside>
      );
    }

    case 'pitfalls':
      return (
        <section className="pitfalls" aria-label={block.title ?? '易错警示'}>
          <header className="pitfalls__head">
            <span className="pitfalls__icon" aria-hidden="true">
              <Icon name="warning" size={17} />
            </span>
            <h3 className="pitfalls__title">{block.title ?? '易错警示 · 自查清单'}</h3>
            <span className="pitfalls__count mono">{block.items.length} 条</span>
          </header>
          <ol className="pitfalls__list">
            {block.items.map((item, itemIndex) => (
              <li className="pitfalls__item" key={itemIndex}>
                <div className="pitfalls__mistake">
                  <span className="pitfalls__badge pitfalls__badge--bad">常见错误</span>
                  <span className="pitfalls__text">{item.mistake}</span>
                </div>
                {item.wrong || item.right ? (
                  <div className="pitfalls__compare">
                    {item.wrong ? (
                      <code className="pitfalls__code pitfalls__code--bad">{item.wrong}</code>
                    ) : null}
                    {item.right ? (
                      <code className="pitfalls__code pitfalls__code--good">{item.right}</code>
                    ) : null}
                  </div>
                ) : null}
                <p className="pitfalls__why">
                  <span className="pitfalls__badge pitfalls__badge--good">为什么</span>
                  {item.why}
                </p>
              </li>
            ))}
          </ol>
        </section>
      );

    case 'code': {
      const language = block.language ?? detectLanguage(block.code);
      const runnable = block.runnable !== false;
      return (
        <CodeBlock
          code={block.code}
          language={language}
          title={block.title ?? filenameFor(block.title, language)}
          caption={block.caption}
          highlights={block.highlights}
          runnable={runnable}
          onOpenLab={
            runnable
              ? () => openInLab({ code: block.code, language, title: block.title })
              : undefined
          }
        />
      );
    }

    case 'diagram':
      return <DiagramCard diagram={block.diagram} title={block.title} caption={block.caption} />;

    case 'table':
      return (
        <div className="table-wrap">
          <table className="lesson-table">
            <thead>
              <tr>
                {block.headers.map((header, headerIndex) => (
                  <th key={headerIndex} scope="col">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>
                      <InlineText text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case 'steps':
      return (
        <ol className="lesson-steps">
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex} className="lesson-step">
              <span className="lesson-step__num tabular" aria-hidden="true">
                {itemIndex + 1}
              </span>
              <div className="lesson-step__content">
                <h4 className="lesson-step__title">{item.title}</h4>
                <p className="lesson-step__body">
                  <InlineText text={item.body} />
                </p>
              </div>
            </li>
          ))}
        </ol>
      );

    case 'compare':
      return (
        <div className="compare-block">
          <div className="compare-block__panes">
            <CodeBlock
              code={block.left.code}
              language={paneLanguage(block.left)}
              title={block.left.title}
              compact
              onOpenLab={() =>
                openInLab({
                  code: block.left.code,
                  language: paneLanguage(block.left),
                  title: block.left.title,
                })
              }
              runnable
            />
            <CodeBlock
              code={block.right.code}
              language={paneLanguage(block.right)}
              title={block.right.title}
              compact
              onOpenLab={() =>
                openInLab({
                  code: block.right.code,
                  language: paneLanguage(block.right),
                  title: block.right.title,
                })
              }
              runnable
            />
          </div>
          {block.caption ? (
            <p className="compare-block__caption">
              <InlineText text={block.caption} />
            </p>
          ) : null}
        </div>
      );

    case 'try':
      return (
        <aside className="try-block">
          <div className="try-block__head">
            <span className="try-block__icon" aria-hidden="true">
              <Icon name="flask" size={20} />
            </span>
            <div>
              <h3 className="try-block__title">动手试一试</h3>
              <p className="try-block__prompt">
                <InlineText text={block.prompt} />
              </p>
            </div>
          </div>
          <CodeBlock
            code={block.code}
            language={block.language ?? detectLanguage(block.code)}
            title={filenameFor(undefined, block.language ?? detectLanguage(block.code))}
            runnable
            maxHeight={320}
            onOpenLab={() =>
              openInLab({
                code: block.code,
                language: block.language ?? detectLanguage(block.code),
              })
            }
          />
        </aside>
      );

    default:
      return null;
  }
}

export interface LessonBlocksProps {
  blocks: LessonBlock[];
}

export function LessonBlocks({ blocks }: LessonBlocksProps) {
  return (
    <div className="lesson-blocks">
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} index={index} />
      ))}
    </div>
  );
}
