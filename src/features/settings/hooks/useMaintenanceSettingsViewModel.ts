import { useAppRestart } from '@/src/contexts/app-shell/AppRestartProvider';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useDataMaintenanceActions } from '@/src/features/settings/hooks/useDataMaintenanceActions';
import { analytics } from '@/src/services/analytics';
import {
  cleanupDatabase as cleanupDatabaseRecords,
  forceRunCheck,
  resetDatabase,
} from '@/src/services/integrity';
import { useCallback } from 'react';

export type MaintenanceSettingsViewModel = ReturnType<typeof useDataMaintenanceActions>;

export function useMaintenanceSettingsViewModel(): MaintenanceSettingsViewModel {
  const { workplaceId } = useWorkplace();
  const { requireRestart } = useAppRestart();

  const runIntegrityCheck = useCallback(
    async (onProgress?: (message: string, progress: number) => void) => {
      return forceRunCheck(workplaceId, onProgress);
    },
    [workplaceId],
  );

  const cleanupDatabase = useCallback(() => cleanupDatabaseRecords(), []);

  const resetApp = useCallback(async () => {
    analytics.logFactoryReset();
    await resetDatabase();
    requireRestart({ type: 'RESET' });
  }, [requireRestart]);

  return useDataMaintenanceActions({
    runIntegrityCheck,
    cleanupDatabase,
    resetApp,
    requireRestart,
  });
}
