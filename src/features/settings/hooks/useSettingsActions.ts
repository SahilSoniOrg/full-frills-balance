import { useAppRestart } from '@/src/contexts/app-shell/AppRestartProvider';
import { analytics } from '@/src/services/analytics-service';
import { exportService } from '@/src/services/export';
import { integrityService } from '@/src/services/integrity';

import { useCallback } from 'react';
import { WorkplaceId } from '@/src/types/domain';

export function useSettingsActions(workplaceId: WorkplaceId) {
  const { requireRestart } = useAppRestart();

  const exportToJSON = useCallback(
    async (onProgress?: (message: string, progress: number) => void) => {
      return exportService.exportToJSON(workplaceId, onProgress);
    },
    [workplaceId],
  );

  const runIntegrityCheck = useCallback(
    async (onProgress?: (message: string, progress: number) => void) => {
      return integrityService.forceRunCheck(workplaceId, onProgress);
    },
    [workplaceId],
  );

  const cleanupDatabase = useCallback(async () => {
    return integrityService.cleanupDatabase();
  }, []);

  const resetApp = useCallback(async () => {
    analytics.logFactoryReset();
    await integrityService.resetDatabase();
    requireRestart({ type: 'RESET' });
  }, [requireRestart]);

  return {
    exportToJSON,
    runIntegrityCheck,
    cleanupDatabase,
    resetApp,
  };
}
