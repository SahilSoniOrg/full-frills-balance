import { useAppRestart } from '@/src/contexts/app-shell/AppRestartProvider';
import { analytics } from '@/src/services/analytics';
import { exportService } from '@/src/services/export';
import type { BackupScope } from '@/src/services/export';
import { integrityService } from '@/src/services/integrity';

import { useCallback } from 'react';
import { WorkplaceId } from '@/src/types/ids';

export function useSettingsActions(workplaceId: WorkplaceId) {
  const { requireRestart } = useAppRestart();

  const exportWorkplacesToJSON = useCallback(
    async (
      workplaceIds: readonly WorkplaceId[],
      scope: Exclude<BackupScope, 'active'>,
      onProgress?: (message: string, progress: number) => void,
    ) => exportService.exportWorkplacesToJSON(workplaceIds, scope, onProgress),
    [],
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
    exportWorkplacesToJSON,
    runIntegrityCheck,
    cleanupDatabase,
    resetApp,
  };
}
