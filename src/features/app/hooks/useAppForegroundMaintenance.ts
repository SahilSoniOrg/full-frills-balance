import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { logger } from '@/src/utils/logger';
import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

const RESUME_FLUSH_DEBOUNCE_MS = 500;

/**
 * Flushes pending running-balance rebuilds when the app returns to the foreground
 * so account balances catch up after background writes or interrupted batches.
 */
export function useAppForegroundMaintenance() {
  const appStateRef = useRef(AppState.currentState);
  const flushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const scheduleFlush = () => {
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current);
      }
      flushTimeoutRef.current = setTimeout(() => {
        flushTimeoutRef.current = null;
        rebuildQueueService.flush().catch(error => {
          logger.warn('[ForegroundMaintenance] Rebuild queue flush failed', { error });
        });
      }, RESUME_FLUSH_DEBOUNCE_MS);
    };

    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const prev = appStateRef.current;
      if (prev.match(/inactive|background/) && nextState === 'active') {
        scheduleFlush();
      }
      appStateRef.current = nextState;
    });

    return () => {
      subscription.remove();
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current);
      }
    };
  }, []);
}
