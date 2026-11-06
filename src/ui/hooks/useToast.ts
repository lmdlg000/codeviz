import { createContext, useContext } from 'react';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

export interface ToastApi {
  pushToast: (message: string, tone?: ToastTone) => void;
  dismissToast: (id: number) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);

const NOOP_API: ToastApi = {
  pushToast: () => undefined,
  dismissToast: () => undefined,
};

/** 在 ToastProvider 之外调用时静默降级，不让页面崩溃。 */
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? NOOP_API;
}
