import { useAppRestart } from '@/src/contexts/app-shell/AppRestartProvider';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useDataMaintenanceActions } from '@/src/features/settings/hooks/useDataMaintenanceActions';
import { analytics } from '@/src/services/analytics';
import {
  cleanupDatabase as cleanupDatabaseRecords,
  forceRunCheck,
  journalBalanceInsightService,
  resetDatabase,
} from '@/src/services/integrity';
import { AppNavigation } from '@/src/utils/navigation';
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

  const findUnbalancedJournals = useCallback(
    () => journalBalanceInsightService.refresh(workplaceId, 'maintenance'),
    [workplaceId],
  );

  const reviewUnbalancedJournals = useCallback(() => {
    analytics.logEntrypointSelected(
      'settings_maintenance',
      'balance_audit',
      'journal_balance_review',
    );
    AppNavigation.toJournalBalanceReview();
  }, []);

  const cleanupDatabase = useCallback(() => cleanupDatabaseRecords(), []);

  const resetApp = useCallback(async () => {
    analytics.logFactoryReset();
    await resetDatabase();
    requireRestart({ type: 'RESET' });
  }, [requireRestart]);

  return useDataMaintenanceActions({
    runIntegrityCheck,
    findUnbalancedJournals,
    reviewUnbalancedJournals,
    cleanupDatabase,
    resetApp,
    requireRestart,
  });
}
