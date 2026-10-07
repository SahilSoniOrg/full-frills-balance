import { useMemo, useRef } from 'react';
import { Platform } from 'react-native';

/**
 * iOS cannot present or navigate while a native modal is still animating closed, so follow-up
 * actions wait for the modal's `onDismiss`. Jest renders modals without a dismiss callback.
 */
export function useAfterDismiss() {
  const pending = useRef<(() => void) | null>(null);
  return useMemo(
    () => ({
      run: (action: () => void) => {
        if (Platform.OS === 'ios' && process.env.NODE_ENV !== 'test') pending.current = action;
        else action();
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
