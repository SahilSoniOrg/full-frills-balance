import { transactionCaptureStrings as strings } from '@/src/constants/copy/domains/transactionCaptureStrings';
import { alert, confirm } from '@/src/utils/alerts';
import type { MutableRefObject } from 'react';
import { useCallback, useRef, useState } from 'react';
import type { WorkplaceId } from '@/src/types/ids';

type Operation = (workplaceId: WorkplaceId) => Promise<unknown>;
type ErrorMessage = (error: unknown) => string;

interface MutationOptions {
  errorMessage?: ErrorMessage;
}

interface ConfirmationCopy {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
}

export function useCaptureMutationRunner(
  workplaceId: WorkplaceId,
  generation: MutableRefObject<number>,
  refresh: () => Promise<void>,
) {
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (operation: Operation, options: MutationOptions = {}) => {
      if (locked.current) return;
      const request = generation.current;
      locked.current = true;
      setBusy(true);
      try {
        await operation(workplaceId);
        if (request === generation.current) await refresh();
      } catch (error) {
        if (request === generation.current)
          alert.show({
            title: strings.updateErrorTitle,
            message: options.errorMessage?.(error) ?? strings.loadError,
            type: 'error',
          });
      } finally {
        locked.current = false;
        setBusy(false);
      }
    },
    [generation, refresh, workplaceId],
  );

  const confirmAndRun = useCallback(
    (copy: ConfirmationCopy, operation: Operation, options: MutationOptions = {}) => {
      if (locked.current) return;
      const request = generation.current;
      confirm.show({
        ...copy,
        onConfirm: () => {
          if (request === generation.current) void run(operation, options);
        },
      });
    },
    [generation, run],
  );

  return { busy, run, confirmAndRun };
}
