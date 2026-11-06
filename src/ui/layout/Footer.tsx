import { Logo } from '../components/Logo';
import { Icon } from '../components/Icon';

/** 站点页脚（关于页与移动端底部使用）。 */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__brand">
        <Logo size={26} />
        <span>CodeViz · C/C++ 图解工坊</span>
      </div>
      <p className="site-footer__line">用图形，把代码讲清楚。</p>
      <div className="site-footer__meta">
        <span className="mono">v1.0</span>
        <span aria-hidden="true">·</span>
        <span>纯前端 · 本地分析</span>
        <span aria-hidden="true">·</span>
        <a href="#/about" className="site-footer__link">
          <Icon name="info" size={13} />
          关于本项目
        </a>
      </div>
    </footer>
  );
}
