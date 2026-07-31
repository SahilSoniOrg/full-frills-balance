import { useUI } from '@/src/contexts/UIContext';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useSettingsActions } from '@/src/features/settings/hooks/useSettingsActions';
import { useImport } from '@/src/hooks/use-import';
import { useSharePrefs } from '@/src/hooks/useSharePrefs';
import { analytics } from '@/src/services/analytics-service';
import { sharingService } from '@/src/services/SharingService';
import { ShareFormat } from '@/src/types/sharing';
import { alert, confirm, toast } from '@/src/utils/alerts';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useState } from 'react';
import { Platform } from 'react-native';

export interface DataManagementViewModel {
  isExporting: boolean;
  isImporting: boolean;
  isMaintenanceMode: boolean;
  isCleaning: boolean;
  isResetting: boolean;
  isNamingExport: boolean;
  setIsNamingExport: (value: boolean) => void;
  exportFilename: string;
  setExportFilename: (value: string) => void;
  onExport: () => void;
  onConfirmExport: () => void;
  exportProgress: number;
  exportProgressMessage: string;
  onImport: () => void;
  onAuditLog: () => void;
  onFixIntegrity: () => void;
  integrityProgress: number;
  integrityProgressMessage: string;
  onCleanup: () => void;
  onFactoryReset: () => void;
  defaultShareFormat: ShareFormat;
  setDefaultShareFormat: (value: ShareFormat) => void;
  isSeeding: boolean;
  seedingProgress: number;
  seedingProgressMessage: string;
  onSeedMockData: () => void;
}

export function useDataManagementViewModel(): DataManagementViewModel {
  const { workplaceId } = useWorkplace();
  const { requireRestart } = useUI();
  const { defaultShareFormat, setDefaultShareFormat } = useSharePrefs();
  const { exportToJSON, runIntegrityCheck, cleanupDatabase, resetApp } =
    useSettingsActions(workplaceId);
  const { isImporting } = useImport();

  const [isExporting, setIsExporting] = useState(false);
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
  const [integrityProgress, setIntegrityProgress] = useState(0);
  const [integrityProgressMessage, setIntegrityProgressMessage] = useState('');
  const [isCleaning, setIsCleaning] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isNamingExport, setIsNamingExport] = useState(false);
  const [exportFilename, setExportFilename] = useState('');
  const [exportProgress, setExportProgress] = useState(0);
  const [exportProgressMessage, setExportProgressMessage] = useState('');
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedingProgress, setSeedingProgress] = useState(0);
  const [seedingProgressMessage, setSeedingProgressMessage] = useState('');

  const onExport = useCallback(() => {
    setIsNamingExport(true);
  }, []);

  const onConfirmExport = useCallback(async () => {
    setIsNamingExport(false);
    setIsExporting(true);
    setExportProgress(0);
    setExportProgressMessage('Starting export...');
    await new Promise(resolve => setTimeout(resolve, 200));
    try {
      const jsonData = await exportToJSON((message, progress) => {
        setExportProgressMessage(message);
        setExportProgress(progress);
      });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

      const sanitizedName = exportFilename
        .trim()
        .replace(/[^a-z0-9-_]/gi, '-')
        .substring(0, 50);

      const provider = {
        id: 'data-export',
        title: 'Data Backup',
        filename: sanitizedName || `balance-export-${timestamp}`,
        mimeType: 'application/zip',
        fileExtension: 'zip',
        getContent: () => jsonData,
      };

      analytics.trackFeatureUsage('settings', 'export_data', {
        has_custom_filename: !!sanitizedName,
        filename_length: sanitizedName.length,
        data_size_bytes: jsonData.length,
      });

      await sharingService.save(provider, ShareFormat.ZIP, (message, progress) => {
        setExportProgressMessage(message);
        setExportProgress(progress);
      });

      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      logger.error('[onConfirmExport] Export failed', error);
      toast.error('Could not export data');
    } finally {
      setIsExporting(false);
    }
  }, [exportToJSON, exportFilename]);

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

      if (Platform.OS === 'ios') {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

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
          const msg = error instanceof Error ? error.message : String(error);
          alert.show({ title: 'Error', message: `Cleanup failed: ${msg}`, type: 'error' });
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
          const msg = error instanceof Error ? error.message : String(error);
          alert.show({ title: 'Error', message: `Reset failed: ${msg}`, type: 'error' });
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
          const msg = error instanceof Error ? error.message : String(error);
          logger.error('[onSeedMockData] Seeding failed', error);
          alert.show({ title: 'Error', message: `Seeding failed: ${msg}`, type: 'error' });
        }
      },
    });
  }, [requireRestart]);

  return {
    isExporting,
    isImporting,
    isMaintenanceMode,
    isCleaning,
    isResetting,
    isNamingExport,
    setIsNamingExport,
    exportFilename,
    setExportFilename,
    onExport,
    onConfirmExport,
    exportProgress,
    exportProgressMessage,
    onImport: AppNavigation.toImportSelection,
    onAuditLog: AppNavigation.toAuditLog,
    onFixIntegrity,
    integrityProgress,
    integrityProgressMessage,
    onCleanup,
    onFactoryReset,
    defaultShareFormat,
    setDefaultShareFormat,
    isSeeding,
    seedingProgress,
    seedingProgressMessage,
    onSeedMockData,
  };
}
