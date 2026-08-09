import { RestartOptions } from '@/src/contexts/UIContext';
import { analytics } from '@/src/services/analytics-service';
import { alert, confirm, toast } from '@/src/utils/alerts';
import { logger } from '@/src/utils/logger';
import { useCallback, useState } from 'react';
import { Platform } from 'react-native';

interface IntegrityResult {
  totalAccounts: number;
  discrepanciesFound: number;
  repairsSuccessful: number;
}

interface UseDataMaintenanceActionsProps {
  runIntegrityCheck: (
    onProgress: (message: string, progress: number) => void,
  ) => Promise<IntegrityResult>;
  cleanupDatabase: () => Promise<{ deletedCount: number }>;
  resetApp: () => Promise<void>;
  requireRestart: (options: RestartOptions) => void;
}

export function useDataMaintenanceActions({
  runIntegrityCheck,
  cleanupDatabase,
  resetApp,
  requireRestart,
}: UseDataMaintenanceActionsProps) {
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
  const [integrityProgress, setIntegrityProgress] = useState(0);
  const [integrityProgressMessage, setIntegrityProgressMessage] = useState('');
  const [isCleaning, setIsCleaning] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedingProgress, setSeedingProgress] = useState(0);
  const [seedingProgressMessage, setSeedingProgressMessage] = useState('');

  const onFixIntegrity = useCallback(async () => {
    setIntegrityProgress(0);
    setIntegrityProgressMessage('Starting check...');
    setIsMaintenanceMode(true);
    try {
      const result = await runIntegrityCheck((message, progress) => {
        setIntegrityProgressMessage(message);
        setIntegrityProgress(progress);
      });
      setIsMaintenanceMode(false);
      if (Platform.OS === 'ios') await new Promise(resolve => setTimeout(resolve, 500));
      alert.show({
        title: 'Integrity Check Complete',
        message: `Checked ${result.totalAccounts} accounts.\nFound ${result.discrepanciesFound} issues.\nRepaired ${result.repairsSuccessful} successfully.`,
      });
      analytics.trackFeatureUsage('settings', 'integrity_check', {
        accounts_checked: result.totalAccounts,
        issues_found: result.discrepanciesFound,
        repairs_successful: result.repairsSuccessful,
      });
    } catch (error) {
      setIsMaintenanceMode(false);
      logger.error('[onFixIntegrity] Check failed', error);
      toast.error('Integrity check failed');
    }
  }, [runIntegrityCheck]);

  const onCleanup = useCallback(async () => {
    confirm.show({
      title: 'Cleanup Database',
      message:
        'This will permanently delete synced records marked as deleted (journals, transactions, accounts). Unsynced deletions are preserved for sync. This action is irreversible. Continue?',
      confirmText: 'Cleanup',
      destructive: true,
      onConfirm: async () => {
        try {
          setIsCleaning(true);
          const result = await cleanupDatabase();
          alert.show({
            title: 'Cleanup Complete',
            message: `Permanently removed ${result.deletedCount} synced records.`,
          });
          analytics.trackFeatureUsage('settings', 'cleanup_database', {
            records_removed: result.deletedCount,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          alert.show({ title: 'Error', message: `Cleanup failed: ${message}`, type: 'error' });
        } finally {
          setIsCleaning(false);
        }
      },
    });
  }, [cleanupDatabase]);

  const onFactoryReset = useCallback(async () => {
    confirm.show({
      title: 'FACTORY RESET',
      message:
        'THIS WILL PERMANENTLY ERASE ALL YOUR DATA, ACCOUNTS, AND SETTINGS. THIS CANNOT BE UNDONE. Are you absolutely sure?',
      confirmText: 'RESET EVERYTHING',
      destructive: true,
      onConfirm: async () => {
        try {
          setIsResetting(true);
          await resetApp();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          alert.show({ title: 'Error', message: `Reset failed: ${message}`, type: 'error' });
        } finally {
          setIsResetting(false);
        }
      },
    });
  }, [resetApp]);

  const onSeedMockData = useCallback(() => {
    confirm.show({
      title: 'Setup Demo Workspace',
      message:
        'This will create a dedicated "Demo Workspace" and populate it with realistic sample data, switching your active workspace to it. Your existing workspace(s) and data will remain completely untouched. Continue?',
      confirmText: 'Generate',
      destructive: false,
      onConfirm: async () => {
        try {
          if (!__DEV__) {
            throw new Error('seedMockData is only available in development builds');
          }
          setIsSeeding(true);
          setSeedingProgress(0);
          setSeedingProgressMessage('Initializing seeder...');
          const { mockDataSeederService } =
            await import('@/src/services/import/MockDataSeederService');
          const stats = await mockDataSeederService.seedMockData((message, progress) => {
            setSeedingProgressMessage(message);
            setSeedingProgress(progress ?? 0);
          });
          setIsSeeding(false);
          logger.info('[onSeedMockData] Seeding complete. Requesting restart...');
          analytics.trackFeatureUsage('settings', 'seed_mock_data', {
            accounts: stats.accounts,
            journals: stats.journals,
            transactions: stats.transactions,
          });
          requireRestart({
            type: 'SEED_MOCK',
            stats: {
              accounts: stats.accounts,
              journals: stats.journals,
              transactions: stats.transactions,
              skippedTransactions: 0,
            },
          });
        } catch (error) {
          setIsSeeding(false);
          const message = error instanceof Error ? error.message : String(error);
          logger.error('[onSeedMockData] Seeding failed', error);
          alert.show({ title: 'Error', message: `Seeding failed: ${message}`, type: 'error' });
        }
      },
    });
  }, [requireRestart]);

  return {
    isMaintenanceMode,
    isCleaning,
    isResetting,
    onFixIntegrity,
    integrityProgress,
    integrityProgressMessage,
    onCleanup,
    onFactoryReset,
    isSeeding,
    seedingProgress,
    seedingProgressMessage,
    onSeedMockData,
  };
}
