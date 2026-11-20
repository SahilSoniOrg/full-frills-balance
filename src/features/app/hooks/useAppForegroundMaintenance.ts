import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { logger } from '@/src/services/observability/logger';
import { snapshotService } from '@/src/data/cache/SnapshotService';
import { widgetProjectionService } from '@/src/services/widgets/WidgetProjectionService';
import { automaticSmsImportService } from '@/src/services/sms/AutomaticSmsImportService';
import { analytics } from '@/src/services/analytics';
import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';

const RESUME_FLUSH_DEBOUNCE_MS = 500;

export function useAppForegroundMaintenance() {
  const appStateRef = useRef(AppState.currentState);
  const flushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const stopRebuildWorker = rebuildQueueService.start();
    // App bootstrap mounts this hook after the database adapter is ready; drain
    // durable rebuild requests once on cold launch as well as on later resumes.
    rebuildQueueService.flush().catch(error => {
      logger.warn('[ForegroundMaintenance] Startup rebuild queue flush failed', { error });
    });
    const scheduleFlush = () => {
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current);
      }
      flushTimeoutRef.current = setTimeout(() => {
        flushTimeoutRef.current = null;
        rebuildQueueService.flush().catch(error => {
          logger.warn('[ForegroundMaintenance] Rebuild queue flush failed', { error });
        });
        void Promise.all([
          Promise.resolve().then(() => snapshotService.retryPendingCleanup()),
          Platform.OS === 'web'
            ? Promise.resolve()
            : widgetProjectionService.recoverPendingCleanup(),
        ]).catch(error =>
          logger.warn('[ForegroundMaintenance] Projection cleanup retry failed', { error }),
        );
        if (Platform.OS === 'android') {
          void automaticSmsImportService
            .processPending()
            .catch(error =>
              logger.warn('[ForegroundMaintenance] SMS inbox catch-up failed', { error }),
            );
        }
      }, RESUME_FLUSH_DEBOUNCE_MS);
    };

    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const prev = appStateRef.current;
      if (prev !== 'background' && nextState === 'background') analytics.onAppBackground();
      if (prev.match(/inactive|background/) && nextState === 'active') {
        analytics.onAppForeground();
        scheduleFlush();
      }
      appStateRef.current = nextState;
    });

    return () => {
      subscription.remove();
      stopRebuildWorker();
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current);
      }
    };
  }, []);
}
