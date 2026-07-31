import { ToastPayload, clearToastListener, setToastListener } from '@/src/utils/alerts';
import { useEffect, useRef, useState } from 'react';

export interface ToastItem extends ToastPayload {
  id: string;
}

/**
 * Hook to manage toast message subscriptions and queueing.
 * Centralizes logic for the global alert system.
 */
export function useToastListener() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const removeQueue = useRef<string[]>([]);
  const timeoutIds = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    const listener = (payload: ToastPayload) => {
      const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
      const newToast: ToastItem = { ...payload, id };

      setToasts(prev => [...prev, newToast]);

      const timeoutId = setTimeout(() => {
        timeoutIds.current.delete(timeoutId);
        removeQueue.current.push(id);
        setToasts(prev => prev.filter(t => t.id !== id));
      }, payload.duration);
      timeoutIds.current.add(timeoutId);
    };

    setToastListener(listener);

    return () => {
      timeoutIds.current.forEach(clearTimeout);
      timeoutIds.current.clear();
      clearToastListener();
    };
  }, []);

  return { toasts };
}
