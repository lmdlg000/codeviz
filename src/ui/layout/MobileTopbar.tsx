import { Icon } from '../components/Icon';
import { Logo } from '../components/Logo';

/** 移动端 sticky 顶栏（桌面端隐藏）。 */
export function MobileTopbar({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="mobile-topbar">
      <a className="mobile-topbar__brand" href="#/" aria-label="CodeViz 首页">
        <Logo size={30} />
        <span className="mobile-topbar__name">CodeViz</span>
        <span className="mobile-topbar__sub">C/C++ 图解工坊</span>
      </a>
      <button
        type="button"
        className="icon-button mobile-topbar__menu"
        onClick={onMenu}
        aria-label="打开导航菜单"
        aria-haspopup="dialog"
      >
        <Icon name="menu" size={21} />
      </button>
    </header>
  );
}
