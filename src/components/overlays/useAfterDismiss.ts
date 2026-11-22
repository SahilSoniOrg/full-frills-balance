import { useMemo, useRef } from 'react';

/** Queues a follow-up until the surface reports that it closed. */
export function useAfterDismiss() {
  const pending = useRef<(() => void) | null>(null);
  return useMemo(
    () => ({
      run: (action: () => void) => {
        pending.current = action;
      },
      cancel: () => {
        pending.current = null;
      },
      onDismiss: () => {
        const action = pending.current;
        pending.current = null;
        action?.();
      },
    }),
    [],
  );
}
