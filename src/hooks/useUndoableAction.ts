import { showErrorAlert, toast } from '@/src/utils/alerts';
import { useCallback } from 'react';

export interface UndoableActionOptions<TResult = unknown> {
  actionLabel?: string;
  errorMessage?: string;
  undoSuccessMessage?: string | ((result: TResult) => string);
  onUndoError?: (error: unknown) => void;
}

/**
 * Returns a stable helper that runs `execute`; on success it exits selection
 * mode (`exitSelectionMode`) and closes the active modal (`onClose`), then
 * surfaces a toast carrying an Undo action bound to `undo`. On failure it shows
 * an error alert (using `options.errorMessage`) and rethrows.
 *
 * The lifecycle side effects are intentional and explicit here — the caller owns
 * `exitSelectionMode` and `onClose`, so there is no hidden selection/modal state
 * inside this helper.
 */
export function useUndoableAction(exitSelectionMode: () => void, onClose?: () => void) {
  return useCallback(
    async <TResult>(
      execute: () => Promise<TResult>,
      undo: (result: TResult) => Promise<unknown> | unknown,
      successMessage: string | ((result: TResult) => string),
      options?: UndoableActionOptions<TResult>,
    ): Promise<TResult> => {
      try {
        const result = await execute();
        exitSelectionMode();
        onClose?.();

        const message =
          typeof successMessage === 'function' ? successMessage(result) : successMessage;

        if (message) {
          toast.success(message, {
            action: {
              label: options?.actionLabel ?? 'Undo',
              onPress: async () => {
                try {
                  await undo(result);
                  const undoMsg =
                    typeof options?.undoSuccessMessage === 'function'
                      ? options.undoSuccessMessage(result)
                      : options?.undoSuccessMessage;
                  if (undoMsg) {
                    toast.success(undoMsg);
                  }
                } catch (undoErr) {
                  if (options?.onUndoError) {
                    options.onUndoError(undoErr);
                  } else {
                    showErrorAlert(undoErr, 'Failed to undo action');
                  }
                }
              },
            },
          });
        }

        return result;
      } catch (err) {
        showErrorAlert(err, options?.errorMessage ?? 'Operation failed');
        throw err;
      }
    },
    [exitSelectionMode, onClose],
  );
}
