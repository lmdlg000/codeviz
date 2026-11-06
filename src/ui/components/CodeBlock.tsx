import { useMemo, useState } from 'react';
import type { SourceLanguage } from '../../engine/types';
import { highlightCode, renderTokens } from '../lib/highlight';
import { copyTextToClipboard } from '../lib/clipboard';
import { useToast } from '../hooks/useToast';
import { Icon } from './Icon';
import { InlineText } from '../lib/markdown';

export interface CodeBlockProps {
  code: string;
  language?: SourceLanguage;
  title?: string;
  caption?: string;
  /** 需要高亮的行号（1-based） */
  highlights?: number[];
  runnable?: boolean;
  onOpenLab?: () => void;
  copyable?: boolean;
  compact?: boolean;
  maxHeight?: number | string;
  className?: string;
}

/** 深色代码卡：行号、轻量高亮、复制、在实验室打开。 */
export function CodeBlock({
  code,
  language = 'c',
  title,
  caption,
  highlights,
  runnable = false,
  onOpenLab,
  copyable = true,
  compact = false,
  maxHeight,
  className,
}: CodeBlockProps) {
  const lines = useMemo(() => highlightCode(code), [code]);
  const [copied, setCopied] = useState(false);
  const { pushToast } = useToast();

  const highlighted = useMemo(() => new Set(highlights ?? []), [highlights]);
  const langLabel = language === 'cpp' ? 'C++' : 'C';
  const filename = title?.trim() || (language === 'cpp' ? 'snippet.cpp' : 'snippet.c');

  const handleCopy = async (): Promise<void> => {
    const ok = await copyTextToClipboard(code);
    if (ok) {
      setCopied(true);
      pushToast('代码已复制到剪贴板', 'success');
      window.setTimeout(() => setCopied(false), 1800);
    } else {
      pushToast('复制失败，请手动选择代码', 'error');
    }
  };

  const classes = ['code-block'];
  if (compact) classes.push('code-block--compact');
  if (className) classes.push(className);

  return (
    <figure className={classes.join(' ')}>
      <div className="code-block__head">
        <span className={`code-block__lang code-block__lang--${language}`}>{langLabel}</span>
        <span className="code-block__filename mono" title={filename}>
          {filename}
        </span>
        <div className="code-block__actions">
          {copyable ? (
            <button
              type="button"
              className="code-block__action"
              onClick={() => void handleCopy()}
              aria-label={`复制 ${filename} 的代码`}
            >
              <Icon name={copied ? 'check' : 'copy'} size={14} />
              <span>{copied ? '已复制' : '复制'}</span>
            </button>
          ) : null}
          {runnable && onOpenLab ? (
            <button
              type="button"
              className="code-block__action code-block__action--lab"
              onClick={onOpenLab}
            >
              <Icon name="flask" size={14} />
              <span>在实验室打开</span>
            </button>
          ) : null}
        </div>
      </div>

      <div
        className="code-block__scroll"
        style={maxHeight !== undefined ? { maxHeight } : undefined}
      >
        <div className="code-block__lines">
          {lines.map((tokens, index) => {
            const lineNumber = index + 1;
            const isHighlight = highlighted.has(lineNumber);
            return (
              <div
                key={lineNumber}
                className={isHighlight ? 'code-block__line is-highlight' : 'code-block__line'}
              >
                <span className="code-block__ln" aria-hidden="true">
                  {lineNumber}
                </span>
                <span className="code-block__code">
                  {tokens.length > 0 ? renderTokens(tokens) : ' '}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {caption ? (
        <figcaption className="code-block__caption">
          <InlineText text={caption} />
        </figcaption>
      ) : null}
    </figure>
  );
}
