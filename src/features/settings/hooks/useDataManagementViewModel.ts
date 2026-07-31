import { useUI } from '@/src/contexts/UIContext';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useDataMaintenanceActions } from '@/src/features/settings/hooks/useDataMaintenanceActions';
import { useSettingsActions } from '@/src/features/settings/hooks/useSettingsActions';
import { useImport } from '@/src/hooks/use-import';
import { useSharePrefs } from '@/src/hooks/useSharePrefs';
import { analytics } from '@/src/services/analytics-service';
import { sharingService } from '@/src/services/SharingService';
import { ShareFormat } from '@/src/types/sharing';
import { toast } from '@/src/utils/alerts';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useState } from 'react';

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
  const maintenance = useDataMaintenanceActions({
    runIntegrityCheck,
    cleanupDatabase,
    resetApp,
    requireRestart,
  });

  const [isExporting, setIsExporting] = useState(false);
  const [isNamingExport, setIsNamingExport] = useState(false);
  const [exportFilename, setExportFilename] = useState('');
  const [exportProgress, setExportProgress] = useState(0);
  const [exportProgressMessage, setExportProgressMessage] = useState('');

  const onExport = useCallback(() => setIsNamingExport(true), []);

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
  }, [exportFilename, exportToJSON]);

  return {
    isExporting,
    isImporting,
    ...maintenance,
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
    defaultShareFormat,
    setDefaultShareFormat,
  };
}
