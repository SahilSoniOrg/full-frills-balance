import { useAppRestart } from '@/src/contexts/app-shell/AppRestartProvider';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useDataMaintenanceActions } from '@/src/features/settings/hooks/useDataMaintenanceActions';
import { analytics } from '@/src/services/analytics';
import { integrityService } from '@/src/services/integrity';
import { useCallback } from 'react';

export type MaintenanceSettingsViewModel = ReturnType<typeof useDataMaintenanceActions>;

export function useMaintenanceSettingsViewModel(): MaintenanceSettingsViewModel {
  const { workplaceId } = useWorkplace();
  const { requireRestart } = useAppRestart();

  const runIntegrityCheck = useCallback(
    async (onProgress?: (message: string, progress: number) => void) => {
      return integrityService.forceRunCheck(workplaceId, onProgress);
    },
    [workplaceId],
  );

  const cleanupDatabase = useCallback(() => integrityService.cleanupDatabase(), []);

  const resetApp = useCallback(async () => {
    analytics.logFactoryReset();
    await integrityService.resetDatabase();
    requireRestart({ type: 'RESET' });
  }, [requireRestart]);

  return useDataMaintenanceActions({
    runIntegrityCheck,
    cleanupDatabase,
    resetApp,
    requireRestart,
  });
}
