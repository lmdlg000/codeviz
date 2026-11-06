import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ToastContext, type ToastItem, type ToastTone } from '../hooks/useToast';
import { Icon } from './Icon';

const MAX_TOASTS = 3;
const TOAST_DURATION = 3000;

/** 右下角通知：最多堆叠 3 条，3 秒自动消失。 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const pushToast = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = nextId.current;
      nextId.current += 1;
      setToasts((current) => [...current.slice(-(MAX_TOASTS - 1)), { id, message, tone }]);
      const timer = window.setTimeout(() => dismissToast(id), TOAST_DURATION);
      timers.current.set(id, timer);
    },
    [dismissToast],
  );

  useEffect(() => {
    const currentTimers = timers.current;
    return () => {
      currentTimers.forEach((timer) => window.clearTimeout(timer));
      currentTimers.clear();
    };
  }, []);

  const api = useMemo(() => ({ pushToast, dismissToast }), [pushToast, dismissToast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {typeof document !== 'undefined'
        ? createPortal(
            <div className="toast-layer" role="region" aria-label="通知" aria-live="polite">
              {toasts.map((toast) => (
                <div key={toast.id} className={`toast toast--${toast.tone}`} role="status">
                  <span className="toast__icon" aria-hidden="true">
                    <Icon
                      name={toast.tone === 'success' ? 'check' : toast.tone === 'error' ? 'warning' : 'info'}
                      size={17}
                    />
                  </span>
                  <span className="toast__message">{toast.message}</span>
                  <button
                    type="button"
                    className="toast__close"
                    onClick={() => dismissToast(toast.id)}
                    aria-label="关闭通知"
                  >
                    <Icon name="close" size={15} />
                  </button>
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}
