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
import { useCallback, useState } from 'react';
import { Share } from 'react-native';
import { createBalanceDiagnostics } from '@/src/services/BalanceDiagnosticsService';
import { toast } from '@/src/utils/alerts';
import { logger } from '@/src/utils/logger';

export type MaintenanceSettingsViewModel = ReturnType<typeof useDataMaintenanceActions> & {
  balanceDiagnostics: string | null;
  isLoadingBalanceDiagnostics: boolean;
  onCreateBalanceDiagnostics: () => Promise<void>;
  onShareBalanceDiagnostics: () => Promise<void>;
  onDismissBalanceDiagnostics: () => void;
};

export function useMaintenanceSettingsViewModel(): MaintenanceSettingsViewModel {
  const { workplaceId, defaultCurrencyCode } = useWorkplace();
  const { requireRestart } = useAppRestart();
  const [balanceDiagnostics, setBalanceDiagnostics] = useState<string | null>(null);
  const [isLoadingBalanceDiagnostics, setIsLoadingBalanceDiagnostics] = useState(false);

  const onCreateBalanceDiagnostics = useCallback(async () => {
    setIsLoadingBalanceDiagnostics(true);
    try {
      const report = await createBalanceDiagnostics(workplaceId, defaultCurrencyCode);
      setBalanceDiagnostics(JSON.stringify(report, null, 2));
    } catch (error) {
      logger.error('[BalanceDiagnostics] Report generation failed', error);
      toast.error('Could not create balance diagnostics');
    } finally {
      setIsLoadingBalanceDiagnostics(false);
    }
  }, [defaultCurrencyCode, workplaceId]);

  const onShareBalanceDiagnostics = useCallback(async () => {
    if (balanceDiagnostics) {
      await Share.share({ message: balanceDiagnostics, title: 'Balance diagnostics' });
    }
  }, [balanceDiagnostics]);

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

  return {
    ...useDataMaintenanceActions({
      runIntegrityCheck,
      findUnbalancedJournals,
      reviewUnbalancedJournals,
      cleanupDatabase,
      resetApp,
      requireRestart,
    }),
    balanceDiagnostics,
    isLoadingBalanceDiagnostics,
    onCreateBalanceDiagnostics,
    onShareBalanceDiagnostics,
    onDismissBalanceDiagnostics: () => setBalanceDiagnostics(null),
  };
}
