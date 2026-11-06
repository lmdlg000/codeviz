/**
 * markdown-lite：只支持内容契约允许的两种内联格式 **加粗** 与 `行内代码`。
 * 其余字符一律按纯文本渲染，不使用 innerHTML，避免注入风险。
 */
import type { ReactNode } from 'react';

const INLINE_PATTERN = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g;

export function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  INLINE_PATTERN.lastIndex = 0;

  while ((match = INLINE_PATTERN.exec(text)) !== null) {
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index));
    }
    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push(
        <strong key={`b-${match.index}`} className="md-strong">
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      nodes.push(
        <code key={`c-${match.index}`} className="inline-code">
          {token.slice(1, -1)}
        </code>,
      );
    }
    cursor = match.index + token.length;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }
  return nodes;
}

/** 渲染带换行的单段文本（保留手动换行）。 */
export function InlineText({ text }: { text: string }) {
  const lines = text.split(/\n/);
  return (
    <>
      {lines.map((line, index) => (
        <span key={index}>
          {index > 0 ? <br /> : null}
          {renderInline(line)}
        </span>
      ))}
    </>
  );
}

/** 按空行拆段落的正文渲染。 */
export function TextBody({ body }: { body: string }) {
  const paragraphs = body.split(/\n{2,}/).filter((paragraph) => paragraph.trim().length > 0);
  return (
    <>
      {paragraphs.map((paragraph, index) => (
        <p key={index} className="text-body">
          <InlineText text={paragraph.trim()} />
        </p>
      ))}
    </>
  );
}
