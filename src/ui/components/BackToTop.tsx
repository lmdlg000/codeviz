import { useScrolledPast } from '../hooks/useScrollSpy';
import { Icon } from './Icon';

/** 滚动超过这个距离后才出现，避免首屏就压住内容 */
const SHOW_AFTER = 420;

/**
 * 右下角「回到顶部」浮动按钮。
 * 滚动一段距离后淡入；点击平滑回到页首并把焦点交还给主内容区，
 * 这样键盘用户可以继续从顶部 Tab 下去，而不是停在一个即将消失的按钮上。
 */
export function BackToTop() {
  const visible = useScrolledPast(SHOW_AFTER);

  const onClick = (): void => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    const main = document.getElementById('main-content');
    main?.focus({ preventScroll: true });
  };

  return (
    <button
      type="button"
      className={visible ? 'back-to-top is-visible' : 'back-to-top'}
      onClick={onClick}
      aria-label="回到顶部"
      aria-hidden={visible ? undefined : true}
      tabIndex={visible ? 0 : -1}
    >
      <Icon name="arrow-up" size={15} />
      <span className="btn__label">回到顶部</span>
    </button>
  );
}
