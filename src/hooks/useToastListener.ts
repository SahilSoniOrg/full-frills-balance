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

    useEffect(() => {
        const listener = (payload: ToastPayload) => {
            const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
            const newToast: ToastItem = { ...payload, id };

            setToasts(prev => [...prev, newToast]);

            setTimeout(() => {
                removeQueue.current.push(id);
                setToasts(prev => prev.filter(t => t.id !== id));
            }, payload.duration);
        };

        setToastListener(listener);

        return () => {
            clearToastListener();
        };
    }, []);

    return { toasts };
}
