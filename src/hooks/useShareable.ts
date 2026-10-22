import { useCallback, useEffect, useRef, useState } from 'react';
import { useSharing, useSharingBusy, useSharingStatus } from '@/src/contexts/SharingContext';
import { useSharePrefs } from '@/src/hooks/useSharePrefs';
import { FileSharingUnavailableError } from '@/src/services/SharingService';
import {
  ShareFormat,
  type Shareable,
  type ShareAction,
  type ShareOutcome,
} from '@/src/types/sharing';
import { toast } from '@/src/utils/alerts';
import { logger } from '@/src/utils/logger';

export function useShareable(
  source: Shareable | null,
  options: {
    disabled?: boolean;
    emptyMessage?: string;
    errorMessage?: string;
    notify?: boolean;
  } = {},
) {
  const runtime = useSharing();
  const isBusy = useSharingBusy();
  const { defaultShareFormat } = useSharePrefs();
  const controllers = useRef(new Set<AbortController>());
  const mounted = useRef(true);
  const [operationId, setOperationId] = useState<number | null>(null);
  const status = useSharingStatus(operationId);
  const [error, setError] = useState<Error | null>(null);
  const { disabled, notify = true, emptyMessage, errorMessage } = options;
  useEffect(() => {
    mounted.current = true;
    const pending = controllers.current;
    return () => {
      mounted.current = false;
      pending.forEach(controller => controller.abort());
    };
  }, []);

  const run = useCallback(
    async (action: ShareAction, requestedFormat?: ShareFormat): Promise<ShareOutcome> => {
      if (!source || disabled) return { kind: 'cancelled' };
      const format =
        requestedFormat ??
        (source.supportedFormats.includes(defaultShareFormat)
          ? defaultShareFormat
          : (source.supportedFormats[0] ?? ShareFormat.TEXT));
      const controller = new AbortController();
      controllers.current.add(controller);
      setError(null);
      const previousId = runtime.getSnapshot().operationId;
      const result = runtime.execute(source, { action, format }, controller.signal);
      const nextId = runtime.getSnapshot().operationId;
      if (nextId !== previousId) setOperationId(nextId);
      try {
        const outcome = await result;
        if (!mounted.current) return outcome;
        if (outcome.kind === 'failed') {
          setError(outcome.error);
          logger.error('Sharing failed', outcome.error);
        }
        if (notify) {
          if (outcome.kind === 'failed')
            toast.error(
              outcome.error instanceof FileSharingUnavailableError
                ? 'File sharing is unavailable on this device. Try exporting on another device.'
                : (errorMessage ?? 'Could not share or export data. Try again.'),
            );
          else if (outcome.kind === 'empty')
            toast.info(emptyMessage ?? 'No data matches this selection.');
          else if (outcome.kind === 'busy') toast.info('Another share or export is in progress.');
          else if (outcome.kind === 'saved') {
            if (outcome.warning) toast.warning(outcome.warning);
            else toast.success('File saved successfully');
          }
        }
        return outcome;
      } finally {
        controllers.current.delete(controller);
      }
    },
    [source, disabled, defaultShareFormat, runtime, notify, errorMessage, emptyMessage],
  );

  const share = useCallback((format?: ShareFormat) => run('share', format), [run]);
  const save = useCallback((format?: ShareFormat) => run('save', format), [run]);
  const isPending = status !== null;
  return {
    share,
    save,
    isBusy,
    isPending,
    isPreparing: status?.phase === 'preparing',
    progress: status?.progress ?? null,
    error,
    supportedFormats: source?.supportedFormats ?? [],
  };
}
