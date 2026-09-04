import { useAppRestart } from '@/src/contexts/app-shell/AppRestartProvider';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useObservable } from '@/src/hooks/useObservable';
import { useDataMaintenanceActions } from '@/src/features/settings/hooks/useDataMaintenanceActions';
import { useSettingsActions } from '@/src/features/settings/hooks/useSettingsActions';
import { useSharePrefs } from '@/src/hooks/useSharePrefs';
import { analytics } from '@/src/services/analytics';
import { sharingService } from '@/src/services/SharingService';
import { workplaceService } from '@/src/services/WorkplaceService';
import type { BackupScope } from '@/src/services/export';
import type { PlainWorkplace } from '@/src/types/plainDtos';
import type { WorkplaceId } from '@/src/types/ids';
import { ShareFormat } from '@/src/types/sharing';
import { toast } from '@/src/utils/alerts';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useState } from 'react';

export interface DataManagementViewModel {
  workplaces: PlainWorkplace[];
  activeWorkplaceId: string;
  backupScope: BackupScope;
  selectedWorkplaceIds: string[];
  setBackupScope: (scope: BackupScope) => void;
  setSelectedWorkplaceIds: (ids: string[]) => void;
  isScopePickerVisible: boolean;
  setIsScopePickerVisible: (value: boolean) => void;
  isExporting: boolean;
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
  const { data: workplaces = [] } = useObservable(
    () => workplaceService.observeAllWorkplaces(),
    [],
    [],
  );
  const { requireRestart } = useAppRestart();
  const { defaultShareFormat, setDefaultShareFormat } = useSharePrefs();
  const { exportWorkplacesToJSON, runIntegrityCheck, cleanupDatabase, resetApp } =
    useSettingsActions(workplaceId);
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
  const [backupScope, setBackupScope] = useState<BackupScope>('active');
  const [selectedWorkplaceIds, setSelectedWorkplaceIds] = useState<string[]>([workplaceId]);
  const [isScopePickerVisible, setIsScopePickerVisible] = useState(false);

  const onExport = useCallback(() => setIsNamingExport(true), []);

  const onConfirmExport = useCallback(async () => {
    setIsNamingExport(false);
    setIsExporting(true);
    setExportProgress(0);
    setExportProgressMessage('Starting export...');
    analytics.trackFeatureUsage('data_management', 'export_initiated');
    await new Promise(resolve => setTimeout(resolve, 200));
    try {
      const ids: WorkplaceId[] =
        backupScope === 'all'
          ? workplaces.map(workplace => workplace.id)
          : backupScope === 'active'
            ? [workplaceId]
            : selectedWorkplaceIds.map(id => id as WorkplaceId);
      const jsonData = await exportWorkplacesToJSON(
        ids,
        backupScope === 'all' ? 'all' : 'selected',
        (message, progress) => {
          setExportProgressMessage(message);
          setExportProgress(progress);
        },
      );
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
      analytics.trackFeatureUsage('data_management', 'export_completed', {
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
  }, [
    backupScope,
    exportFilename,
    exportWorkplacesToJSON,
    selectedWorkplaceIds,
    workplaceId,
    workplaces,
  ]);

  return {
    workplaces: [...workplaces].sort((a, b) => a.name.localeCompare(b.name)),
    activeWorkplaceId: workplaceId,
    backupScope,
    selectedWorkplaceIds,
    setBackupScope,
    setSelectedWorkplaceIds,
    isScopePickerVisible,
    setIsScopePickerVisible,
    isExporting,
    ...maintenance,
    isNamingExport,
    setIsNamingExport,
    exportFilename,
    setExportFilename,
    onExport,
    onConfirmExport,
    exportProgress,
    exportProgressMessage,
    onImport: () => AppNavigation.toSetupJourney('settings_restore'),
    onAuditLog: AppNavigation.toAuditLog,
    defaultShareFormat,
    setDefaultShareFormat,
  };
}
