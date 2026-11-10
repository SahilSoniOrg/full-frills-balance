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

/** Mutations stay valid across load refreshes; only workplace change/unmount bumps the epoch. */
export function useCaptureMutationRunner(
  workplaceId: WorkplaceId,
  mutationEpoch: MutableRefObject<number>,
  refresh: () => Promise<void>,
) {
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (operation: Operation, options: MutationOptions = {}) => {
      if (locked.current) return;
      const epoch = mutationEpoch.current;
      locked.current = true;
      setBusy(true);
      try {
        await operation(workplaceId);
        if (epoch === mutationEpoch.current) await refresh();
      } catch (error) {
        if (epoch === mutationEpoch.current)
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
    [mutationEpoch, refresh, workplaceId],
  );

  const confirmAndRun = useCallback(
    (copy: ConfirmationCopy, operation: Operation, options: MutationOptions = {}) => {
      if (locked.current) return;
      const epoch = mutationEpoch.current;
      confirm.show({
        ...copy,
        onConfirm: () => {
          if (epoch === mutationEpoch.current) void run(operation, options);
        },
      });
    },
    [mutationEpoch, run],
  );

  return { busy, run, confirmAndRun };
}
