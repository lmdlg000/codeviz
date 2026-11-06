import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type DragEvent,
} from 'react';
import { basicSetup } from 'codemirror';
import { cpp } from '@codemirror/lang-cpp';
import {
  EditorView,
  Decoration,
  ViewPlugin,
  keymap,
  type ViewUpdate,
  type DecorationSet,
} from '@codemirror/view';
import {
  EditorState,
  Prec,
  RangeSetBuilder,
  StateEffect,
  StateField,
} from '@codemirror/state';
import { MAX_CODE_LINES, type SourceLanguage } from '../../../engine/types';
import { highlightLine, type HighlightState, type TokenKind } from '../../lib/highlight';
import { Icon } from '../Icon';

export interface LabEditorHandle {
  /** 滚动到指定行（1-based）并高亮；供图表节点点击联动使用。 */
  scrollToLine: (line: number) => void;
  focus: () => void;
  getLineCount: () => number;
}

export interface LabEditorProps {
  value: string;
  filename: string;
  language: SourceLanguage;
  onChange: (value: string) => void;
  onAnalyze: () => void;
  onTrace: () => void;
  onDropFile: (file: File) => void;
  /** 粘贴内容会让总行数超过行数上限时触发（内容被拒绝） */
  onLimitExceeded: () => void;
}

/* ----------------------------- CodeMirror 主题 ---------------------------- */

const tokenClass: Record<Exclude<TokenKind, 'plain'>, string> = {
  comment: 'cm-cv-comment',
  string: 'cm-cv-string',
  char: 'cm-cv-string',
  number: 'cm-cv-number',
  keyword: 'cm-cv-keyword',
  type: 'cm-cv-type',
  function: 'cm-cv-function',
  punct: 'cm-cv-punct',
  preprocessor: 'cm-cv-preprocessor',
};

const codeTheme = EditorView.theme(
  {
    '&': {
      color: '#cfeedd',
      backgroundColor: '#080d0b',
      height: '100%',
      fontSize: '13.5px',
    },
    '.cm-scroller': {
      fontFamily: 'var(--font-mono)',
      lineHeight: '1.7',
      overflow: 'auto',
    },
    '.cm-content': {
      padding: '14px 0 28px',
      caretColor: '#3bf08a',
    },
    '.cm-line': {
      padding: '0 18px 0 6px',
    },
    '.cm-gutters': {
      backgroundColor: '#060a09',
      color: '#4f6b5e',
      borderRight: '1px solid #16211c',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 10px 0 16px',
    },
    '.cm-activeLine': { backgroundColor: 'rgba(59, 240, 138, 0.07)' },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(59, 240, 138, 0.12)',
      color: '#9dffc4',
    },
    '&.cm-focused .cm-cursor': { borderLeftColor: '#3bf08a' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
      backgroundColor: 'rgba(59, 240, 138, 0.24) !important',
    },
    '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
      backgroundColor: 'rgba(59, 240, 138, 0.18)',
      outline: '1px solid rgba(59, 240, 138, 0.55)',
      color: '#eafff3 !important',
    },
    '.cm-selectionMatch': { backgroundColor: 'rgba(46, 230, 198, 0.22)' },
    '.cm-cv-target-line': {
      backgroundColor: 'rgba(59, 240, 138, 0.1)',
      boxShadow: 'inset 2px 0 0 #3bf08a',
    },
    '.cm-cv-comment': { color: '#557265 !important', fontStyle: 'italic' },
    '.cm-cv-string': { color: '#a8f5c0 !important' },
    '.cm-cv-number': { color: '#ffb454 !important' },
    '.cm-cv-keyword': { color: '#3bf08a !important', fontWeight: '600' },
    '.cm-cv-type': { color: '#2ee6c6 !important' },
    '.cm-cv-function': { color: '#7ce7ff !important' },
    '.cm-cv-punct': { color: '#7d9a8c !important' },
    '.cm-cv-preprocessor': { color: '#ff8fd0 !important' },
    '.cm-tooltip': {
      backgroundColor: '#0c120f',
      border: '1px solid #1c2b24',
      color: '#d7f7e5',
    },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      backgroundColor: '#16211c',
      color: '#d7f7e5',
    },
  },
  { dark: true },
);

/* ------------------------------ 语法 token 装饰 --------------------------- */

function buildTokenDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  let state: HighlightState = { inBlockComment: false };
  const doc = view.state.doc;

  for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber += 1) {
    const line = doc.line(lineNumber);
    const result = highlightLine(line.text, state);
    state = result.state;
    let offset = 0;
    for (const token of result.tokens) {
      const from = line.from + offset;
      offset += token.text.length;
      if (token.kind === 'plain' || token.text.length === 0) continue;
      builder.add(from, from + token.text.length, Decoration.mark({ class: tokenClass[token.kind] }));
    }
  }

  return builder.finish();
}

const highlightPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildTokenDecorations(view);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged) {
        this.decorations = buildTokenDecorations(update.view);
      }
    }
  },
  {
    decorations: (instance) => instance.decorations,
  },
);

/* ----------------------------- 选中行高亮装饰 ---------------------------- */

const setActiveLine = StateEffect.define<number | null>();

const activeLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    let next = decorations.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(setActiveLine)) continue;
      if (effect.value === null) {
        next = Decoration.none;
      } else {
        const total = transaction.state.doc.lines;
        const lineNumber = Math.min(Math.max(Math.round(effect.value), 1), total);
        const line = transaction.state.doc.line(lineNumber);
        next = Decoration.set([
          Decoration.line({ class: 'cm-cv-target-line' }).range(line.from),
        ]);
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/* -------------------------------- 编辑器 -------------------------------- */

export const LabEditor = forwardRef<LabEditorHandle, LabEditorProps>(function LabEditor(
  { value, language, onChange, onAnalyze, onTrace, onDropFile, onLimitExceeded },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onAnalyzeRef = useRef(onAnalyze);
  onAnalyzeRef.current = onAnalyze;
  const onTraceRef = useRef(onTrace);
  onTraceRef.current = onTrace;
  const onDropFileRef = useRef(onDropFile);
  onDropFileRef.current = onDropFile;
  const onLimitExceededRef = useRef(onLimitExceeded);
  onLimitExceededRef.current = onLimitExceeded;

  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const extensions = [
      basicSetup,
      cpp(),
      EditorState.tabSize.of(2),
      EditorView.contentAttributes.of({
        'aria-label': language === 'cpp' ? 'C++ 代码编辑器' : 'C 代码编辑器',
        spellcheck: 'false',
        autocapitalize: 'off',
        autocomplete: 'off',
      }),
      codeTheme,
      highlightPlugin,
      activeLineField,
      EditorView.domEventHandlers({
        paste(event, view) {
          const text = event.clipboardData?.getData('text/plain') ?? '';
          if (!text) return false;
          const insertedLines = text.replace(/\r\n?/g, '\n').split('\n').length;
          const selection = view.state.selection.main;
          const selectedLineCount = view.state.doc.lineAt(selection.to).number - view.state.doc.lineAt(selection.from).number + 1;
          const projected = view.state.doc.lines - selectedLineCount + insertedLines;
          if (projected > MAX_CODE_LINES) {
            event.preventDefault();
            onLimitExceededRef.current();
            return true;
          }
          return false;
        },
        drop(event) {
          const file = event.dataTransfer?.files?.[0];
          if (!file) return false;
          event.preventDefault();
          onDropFileRef.current(file);
          return true;
        },
      }),
      Prec.high(
        keymap.of([
          {
            key: 'Mod-Enter',
            run: () => {
              onAnalyzeRef.current();
              return true;
            },
          },
          {
            key: 'Mod-Shift-Enter',
            run: () => {
              onTraceRef.current();
              return true;
            },
          },
        ]),
      ),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        const text = update.state.doc.toString();
        if (text !== valueRef.current) {
          onChangeRef.current(text);
        }
      }),
    ];

    const view = new EditorView({
      state: EditorState.create({ doc: valueRef.current, extensions }),
      parent: host,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // 外部载入示例 / 上传文件 / 恢复草稿时同步文档
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    });
  }, [value]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToLine(line: number) {
        const view = viewRef.current;
        if (!view) return;
        const total = view.state.doc.lines;
        const target = Math.min(Math.max(Math.round(line), 1), total);
        const lineInfo = view.state.doc.line(target);
        view.dispatch({
          effects: [
            setActiveLine.of(target),
            EditorView.scrollIntoView(lineInfo.from, { y: 'center' }),
          ],
        });
      },
      focus() {
        viewRef.current?.focus();
      },
      getLineCount() {
        return viewRef.current?.state.doc.lines ?? 0;
      },
    }),
    [],
  );

  const onDragEnter = (event: DragEvent<HTMLDivElement>): void => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    dragDepth.current += 1;
    setDragging(true);
  };

  const onDragLeave = (): void => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>): void => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    if (!event.dataTransfer?.files?.length) return;
    if (event.defaultPrevented) return;
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) onDropFileRef.current(file);
  };

  return (
    <div
      className={dragging ? 'lab-editor__host is-dragging' : 'lab-editor__host'}
      ref={hostRef}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {dragging ? (
        <div className="lab-editor__drop" aria-hidden="true">
          <span className="lab-editor__drop-icon">
            <Icon name="upload" size={26} />
          </span>
          <strong>松开以载入代码</strong>
          <span>支持 .c / .cpp / .h，最多 {MAX_CODE_LINES} 行</span>
        </div>
      ) : null}
    </div>
  );
});
