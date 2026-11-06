/**
 * 诊断建议列表
 * ------------------------------------------------------------------
 * 按严重程度分组（错误 / 警告 / 提示），每条含图标、中文说明、行号 chip 与修复建议。
 * 点击可定位代码行；空数据时给出鼓励式空状态。
 */
import type { Diagnostic, DiagnosticSeverity } from '../../engine/types';
import { VizIcon, type VizIconName } from './icons';
import { VizEmpty } from './feedback';

export interface DiagnosticsViewProps {
  diagnostics: Diagnostic[];
  onSelectLine?: (line: number) => void;
  compact?: boolean;
}

interface GroupMeta {
  severity: DiagnosticSeverity;
  label: string;
  icon: VizIconName;
  tone: string;
}

const GROUPS: GroupMeta[] = [
  { severity: 'error', label: '错误', icon: 'error', tone: 'danger' },
  { severity: 'warning', label: '警告', icon: 'warning', tone: 'amber' },
  { severity: 'info', label: '提示', icon: 'info', tone: 'sky' },
];

const SEVERITY_META: Record<DiagnosticSeverity, GroupMeta> = {
  error: GROUPS[0],
  warning: GROUPS[1],
  info: GROUPS[2],
};

function normalize(diagnostics: Diagnostic[] | null | undefined): Diagnostic[] {
  if (!Array.isArray(diagnostics)) return [];
  return diagnostics
    .filter((item) => item && typeof item === 'object' && (item.message ?? '').length > 0)
    .filter((item) => item.severity === 'error' || item.severity === 'warning' || item.severity === 'info')
    .sort((a, b) => (a.line || 0) - (b.line || 0));
}

export function DiagnosticsView({ diagnostics, onSelectLine, compact = false }: DiagnosticsViewProps) {
  const items = normalize(diagnostics);
  const counts = {
    error: items.filter((item) => item.severity === 'error').length,
    warning: items.filter((item) => item.severity === 'warning').length,
    info: items.filter((item) => item.severity === 'info').length,
  };

  if (items.length === 0) {
    return (
      <div className={`cvz cvz-diag${compact ? ' is-compact' : ''}`}>
        <VizEmpty
          compact={compact}
          icon="check"
          title="很好，没有发现明显问题"
          hint="代码通过了基础检查。运行「执行追踪」，看看它实际是怎么跑的。"
        />
      </div>
    );
  }

  return (
    <div className={`cvz cvz-diag${compact ? ' is-compact' : ''}`}>
      <div className="cvz-diag__summary" aria-label="诊断统计">
        <span className="cvz-diag__summary-item cvz-diag__summary-item--danger">
          <VizIcon name="error" size={13} />
          错误 <b>{counts.error}</b>
        </span>
        <span className="cvz-diag__summary-item cvz-diag__summary-item--amber">
          <VizIcon name="warning" size={13} />
          警告 <b>{counts.warning}</b>
        </span>
        <span className="cvz-diag__summary-item cvz-diag__summary-item--sky">
          <VizIcon name="info" size={13} />
          提示 <b>{counts.info}</b>
        </span>
      </div>

      {GROUPS.map((group) => {
        const groupItems = items.filter((item) => item.severity === group.severity);
        if (groupItems.length === 0) return null;
        return (
          <section className={`cvz-diag__group cvz-diag__group--${group.tone}`} key={group.severity}>
            <h4 className="cvz-diag__group-title">
              <VizIcon name={group.icon} size={13} />
              {group.label}
              <span className="cvz-diag__group-count">{groupItems.length}</span>
            </h4>
            <ul className="cvz-diag__list">
              {groupItems.map((item, index) => {
                const meta = SEVERITY_META[group.severity];
                const clickable = Boolean(onSelectLine) && item.line > 0;
                const content = (
                  <>
                    <span className="cvz-diag__icon" aria-hidden="true">
                      <VizIcon name={meta.icon} size={compact ? 13 : 15} />
                    </span>
                    <span className="cvz-diag__body">
                      <span className="cvz-diag__message">{item.message}</span>
                      {item.hint ? (
                        <span className="cvz-diag__hint" title={compact ? item.hint : undefined}>
                          {item.hint}
                        </span>
                      ) : null}
                    </span>
                    {item.line > 0 ? <span className="cvz-diag__line">L{item.line}</span> : null}
                  </>
                );
                return (
                  <li className="cvz-diag__item" key={`${item.rule}-${item.line}-${index}`}>
                    {clickable ? (
                      <button
                        type="button"
                        className="cvz-diag__row"
                        onClick={() => onSelectLine?.(item.line)}
                        aria-label={`${meta.label}，第 ${item.line} 行：${item.message}${
                          item.hint ? `。建议：${item.hint}` : ''
                        }`}
                      >
                        {content}
                      </button>
                    ) : (
                      <div className="cvz-diag__row is-static">{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
