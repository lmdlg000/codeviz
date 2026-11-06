import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../components/Icon';
import { Logo } from '../components/Logo';
import { SidebarBody, type SidebarBodyProps } from './Sidebar';

export interface MobileDrawerProps extends SidebarBodyProps {
  open: boolean;
  onClose: () => void;
}

/** 移动端侧栏抽屉：遮罩、Esc 关闭、焦点圈定与恢复。 */
export function MobileDrawer({ open, onClose, ...sidebarProps }: MobileDrawerProps) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const panel = panelRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => panel?.focus(), 30);

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="drawer-layer">
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <aside
        ref={panelRef}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="导航菜单"
        tabIndex={-1}
      >
        <div className="drawer__head">
          <a
            className="drawer__brand"
            href="#/"
            onClick={() => {
              onClose();
            }}
          >
            <Logo size={30} />
            <span>CodeViz</span>
          </a>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭菜单">
            <Icon name="close" size={19} />
          </button>
        </div>
        <div className="drawer__body">
          <SidebarBody
            {...sidebarProps}
            onNavigate={() => {
              sidebarProps.onNavigate?.();
              onClose();
            }}
          />
        </div>
      </aside>
    </div>,
    document.body,
  );
}
