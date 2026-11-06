import { useMemo } from 'react';
import { highlightCode, renderTokens } from '../../lib/highlight';
import { Icon } from '../Icon';

const HERO_CODE = `int max = a[0];
for (int i = 0; i < n; i++) {
  if (a[i] > max) {
    max = a[i];
  }
}
printf("max = %d\\n", max);`;

/** 首页 Hero 右侧的「代码 → 流程图」叠层视觉，全部由 HTML / SVG 手写。 */
export function HeroVisual() {
  const lines = useMemo(() => highlightCode(HERO_CODE), []);

  return (
    <div className="hero-visual" aria-hidden="true">
      <div className="hero-visual__grid dot-grid" />
      <div className="hero-visual__glow" />

      <div className="hero-code-card">
        <div className="hero-code-card__head">
          <span className="window-dots">
            <i />
            <i />
            <i />
          </span>
          <span className="hero-code-card__file mono">find_max.c</span>
        </div>
        <div className="hero-code-card__body">
          {lines.map((tokens, index) => (
            <div className="hero-code-card__line" key={index}>
              <span className="hero-code-card__ln">{index + 1}</span>
              <span>{renderTokens(tokens)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="hero-flow-card">
        <div className="hero-flow-card__head">
          <span className="hero-flow-card__eyebrow">FUNCTION FLOW</span>
          <span className="hero-flow-card__title">max 的寻找路径</span>
        </div>
        <svg
          className="hero-flow-svg"
          viewBox="0 0 340 318"
          role="presentation"
          fill="none"
        >
          <defs>
            <marker id="hero-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 8 4 0 8z" fill="#94a3b8" />
            </marker>
            <marker id="hero-arrow-teal" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 8 4 0 8z" fill="#0d9488" />
            </marker>
          </defs>

          {/* 开始 */}
          <rect x="146" y="8" width="88" height="28" rx="14" fill="#0f172a" />
          <text x="190" y="26" textAnchor="middle" className="hero-flow-text hero-flow-text--light">
            开始
          </text>
          <path d="M190 36v20" stroke="#94a3b8" strokeWidth="1.6" markerEnd="url(#hero-arrow)" />

          {/* 判断 */}
          <path
            d="M190 56 252 98 190 140 128 98Z"
            fill="var(--amber-soft)"
            stroke="var(--amber)"
            strokeWidth="1.6"
          />
          <text x="190" y="102" textAnchor="middle" className="hero-flow-text">
            i &lt; n ?
          </text>
          <text x="202" y="156" className="hero-flow-label">
            是
          </text>
          <text x="106" y="92" className="hero-flow-label">
            否
          </text>

          {/* 是 → 处理 */}
          <path d="M190 140v18" stroke="#94a3b8" strokeWidth="1.6" markerEnd="url(#hero-arrow)" />
          <rect x="128" y="160" width="124" height="42" rx="10" fill="var(--primary-soft)" stroke="var(--primary)" strokeWidth="1.6" />
          <text x="190" y="178" textAnchor="middle" className="hero-flow-text hero-flow-text--ink">
            处理 a[i]
          </text>
          <text x="190" y="193" textAnchor="middle" className="hero-flow-sub">
            max = a[i]
          </text>

          {/* 循环回边 */}
          <path
            d="M252 181h30a8 8 0 0 0 8-8V106a8 8 0 0 0-8-8h-30"
            stroke="var(--teal)"
            strokeWidth="1.6"
            strokeDasharray="5 5"
            markerEnd="url(#hero-arrow-teal)"
          />
          <text x="286" y="150" className="hero-flow-label hero-flow-label--teal">
            循环
          </text>

          {/* 否 → 输出 */}
          <path
            d="M128 98H100a8 8 0 0 0-8 8v104a8 8 0 0 0 8 8h8"
            stroke="#94a3b8"
            strokeWidth="1.6"
            markerEnd="url(#hero-arrow)"
          />
          <path d="M24 210h112v40H24z" fill="var(--rose-soft)" stroke="var(--rose)" strokeWidth="1.6" />
          <text x="80" y="228" textAnchor="middle" className="hero-flow-text hero-flow-text--ink">
            输出 max
          </text>
          <text x="80" y="243" textAnchor="middle" className="hero-flow-sub">
            printf
          </text>

          {/* 结束 */}
          <path d="M80 250v22" stroke="#94a3b8" strokeWidth="1.6" markerEnd="url(#hero-arrow)" />
          <rect x="36" y="276" width="88" height="28" rx="14" fill="#0f172a" />
          <text x="80" y="294" textAnchor="middle" className="hero-flow-text hero-flow-text--light">
            结束
          </text>
        </svg>
      </div>

      <div className="hero-badge hero-badge--decision">
        <Icon name="flow" size={14} />
        判断 · 分支
      </div>
      <div className="hero-badge hero-badge--loop">
        <Icon name="reset" size={14} />
        循环 · 回边
      </div>
    </div>
  );
}
