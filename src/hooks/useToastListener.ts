import { ToastPayload, clearToastListener, setToastListener } from '@/src/utils/alerts';
import { useEffect, useRef, useState } from 'react';

export interface ToastItem extends ToastPayload {
  id: string;
  dismiss: () => void;
}

/**
 * Hook to manage toast message subscriptions and queueing.
 * Centralizes logic for the global alert system.
 */
export function useToastListener() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timeoutIds = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const activeTimeoutIds = timeoutIds.current;
    const listener = (payload: ToastPayload) => {
      const id = payload.key
        ? `key:${payload.key}`
        : Date.now().toString() + Math.random().toString(36).substr(2, 9);
      const previousTimeout = timeoutIds.current.get(id);
      if (previousTimeout !== undefined) clearTimeout(previousTimeout);
      const timeoutId = setTimeout(() => {
        timeoutIds.current.delete(id);
        setToasts(prev => prev.filter(t => t.id !== id));
      }, payload.duration);
      timeoutIds.current.set(id, timeoutId);

      const dismiss = () => {
        // A stale action from the replaced notice must not remove its successor.
        if (timeoutIds.current.get(id) !== timeoutId) return;
        clearTimeout(timeoutId);
        timeoutIds.current.delete(id);
        setToasts(prev => prev.filter(t => t.id !== id));
        payload.onDismiss?.();
      };

      const newToast: ToastItem = { ...payload, id, dismiss };
      setToasts(prev => [...prev.filter(t => t.id !== id), newToast]);
    };

    setToastListener(listener);

    return () => {
      activeTimeoutIds.forEach(clearTimeout);
      activeTimeoutIds.clear();
      clearToastListener();
    };
  }, []);

  return { toasts };
}
