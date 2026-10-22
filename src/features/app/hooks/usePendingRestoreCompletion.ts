import { useEffect, useRef, useState } from 'react';
import { useAppLock } from '@/src/contexts/app-shell/AppLockProvider';
import { encryptedRestoreCompletion } from '@/src/services/backup/encryptedRestoreCompletion';
import { KeyOperationError } from '@/src/utils/keyOperationError';
import { completeEncryptedRestoreLaunch } from '@/src/features/setup';
import { alert } from '@/src/utils/alerts';

/** The launch gate survives screen changes; the handoff survives process termination. */
export function usePendingRestoreCompletion(enabled: boolean, retryToken: number) {
  const { isAppCurrentlyLocked, isAppActive } = useAppLock();
  const [pendingIds, setPendingIds] = useState<readonly string[] | null>(null);
  const [failure, setFailure] = useState<{ key: string; error: Error } | null>(null);
  const [isResuming, setIsResuming] = useState(false);
  const mounted = useRef(false);
  const resuming = useRef(false);
  const failureKey = `${retryToken}:${isAppCurrentlyLocked}:${isAppActive}`;
  const error = failure?.key === failureKey ? failure.error : null;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const subscription = encryptedRestoreCompletion.observePending().subscribe({
      next: pending => setPendingIds(pending.map(value => value.workplaceId)),
      error: () =>
        setFailure({
          key: failureKey,
          error: new Error('Could not read unfinished restore state'),
        }),
    });
    return () => subscription.unsubscribe();
  }, [enabled, failureKey]);

  const pendingKey = pendingIds?.join('\n') ?? '';
  useEffect(() => {
    if (!enabled || pendingIds === null || pendingKey || isAppCurrentlyLocked || !isAppActive)
      return;
    // Harmless leftover markers never gate the dashboard. Retry on startup/unlock/foreground.
    void encryptedRestoreCompletion.retryCleanup();
  }, [enabled, pendingIds, pendingKey, isAppCurrentlyLocked, isAppActive, retryToken]);

  useEffect(() => {
    if (
      !enabled ||
      !pendingKey ||
      resuming.current ||
      error ||
      isAppCurrentlyLocked ||
      !isAppActive
    )
      return;
    resuming.current = true;
    setIsResuming(true);
    void encryptedRestoreCompletion
      .resume((workplaceId, recoveredCopy) => {
        completeEncryptedRestoreLaunch(workplaceId);
        if (recoveredCopy)
          alert.show({
            title: 'Workplace data recovered',
            message:
              'Create a new encrypted backup of this recovered Workplace. Its new recovery file unlocks new backups; the old file belongs to the source Workplace.',
            type: 'info',
          });
      })
      .catch(failure => {
        if (
          !mounted.current ||
          (failure instanceof KeyOperationError &&
            (failure.code === 'FFB_KEY_LOCKED' || failure.code === 'FFB_KEY_CANCELLED'))
        )
          return;
        setFailure({
          key: failureKey,
          error: failure instanceof Error ? failure : new Error('Could not finish recovery'),
        });
      })
      .finally(() => {
        resuming.current = false;
        setIsResuming(false);
      });
  }, [enabled, isAppCurrentlyLocked, isAppActive, pendingKey, failureKey, error]);

  return {
    checking: enabled && pendingIds === null && !error,
    active: Boolean(pendingIds?.length) || error !== null || isResuming,
    error,
  };
}
