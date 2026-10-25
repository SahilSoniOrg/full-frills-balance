import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useObservable } from '@/src/hooks/useObservable';
import { useShareable } from '@/src/hooks/useShareable';
import { analytics } from '@/src/services/analytics';
import { createBackupShareable } from '@/src/services/sharing/backupShareable';
import { workplaceService } from '@/src/services/WorkplaceService';
import type { WorkplaceId } from '@/src/types/ids';
import { ShareFormat } from '@/src/types/sharing';
import type { ShareOutcome } from '@/src/types/sharing';
import type { BackupScope } from '@/src/services/export';
import { useCallback, useMemo, useState } from 'react';

export interface DataExportViewModel {
  workplaces: ReturnType<typeof useSortedWorkplaces>;
  activeWorkplaceId: WorkplaceId;
  backupScope: BackupScope;
  selectedWorkplaceIds: string[];
  setBackupScope: (scope: BackupScope) => void;
  setSelectedWorkplaceIds: (ids: string[]) => void;
  isScopePickerVisible: boolean;
  setIsScopePickerVisible: (value: boolean) => void;
  isExporting: boolean;
  isPreparingExport: boolean;
  isNamingExport: boolean;
  setIsNamingExport: (value: boolean) => void;
  exportFilename: string;
  setExportFilename: (value: string) => void;
  onExport: () => void;
  onConfirmExport: () => void;
  exportProgress: number;
  exportProgressMessage: string;
}

function useSortedWorkplaces() {
  const { data: workplaces = [] } = useObservable(
    () => workplaceService.observeAllWorkplaces(),
    [],
    [],
  );
  return [...workplaces].sort((a, b) => a.name.localeCompare(b.name));
}

export function useDataExportViewModel(): DataExportViewModel {
  const { workplaceId } = useWorkplace();
  const workplaces = useSortedWorkplaces();
  const [isNamingExport, setIsNamingExport] = useState(false);
  const [exportFilename, setExportFilename] = useState('');
  const [backupScope, setBackupScope] = useState<BackupScope>('active');
  const [selectedWorkplaceIds, setSelectedWorkplaceIds] = useState<string[]>([workplaceId]);
  const [isScopePickerVisible, setIsScopePickerVisible] = useState(false);

  const workplaceIds = useMemo<WorkplaceId[]>(() => {
    if (backupScope === 'all') return workplaces.map(workplace => workplace.id);
    if (backupScope === 'active') return [workplaceId];
    return [...selectedWorkplaceIds] as WorkplaceId[];
  }, [backupScope, selectedWorkplaceIds, workplaceId, workplaces]);
  const sanitizedName = exportFilename
    .trim()
    .replace(/[^a-z0-9-_]/gi, '-')
    .substring(0, 50);
  const source = useMemo(() => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return createBackupShareable({
      id: 'data-export',
      title: 'Data Backup',
      filename: sanitizedName || `balance-export-${timestamp}`,
      workplaceIds,
      exportScope: backupScope === 'all' ? 'all' : 'selected',
    });
  }, [backupScope, sanitizedName, workplaceIds]);
  const shareable = useShareable(source, { errorMessage: 'Could not export data' });

  const onExport = useCallback(() => setIsNamingExport(true), []);

  const onConfirmExport = useCallback(async () => {
    analytics.trackFeatureUsage('data_management', 'export_initiated');
    // Keep the naming modal mounted until `isExporting` hides it. Closing the
    // Modal first can briefly mark the app inactive and abort preparation.
    const outcome: ShareOutcome = await shareable.save(ShareFormat.ZIP);
    setIsNamingExport(false);
    if (outcome.kind === 'saved' || outcome.kind === 'handed-off') {
      analytics.trackFeatureUsage('data_management', 'export_completed', {
        has_custom_filename: !!sanitizedName,
        filename_length: sanitizedName.length,
      });
    }
  }, [sanitizedName, shareable]);

  const progress = shareable.progress;
  return {
    workplaces,
    activeWorkplaceId: workplaceId,
    backupScope,
    selectedWorkplaceIds,
    setBackupScope,
    setSelectedWorkplaceIds,
    isScopePickerVisible,
    setIsScopePickerVisible,
    isExporting: shareable.isPending,
    isPreparingExport: shareable.isPreparing,
    isNamingExport,
    setIsNamingExport,
    exportFilename,
    setExportFilename,
    onExport,
    onConfirmExport,
    exportProgress: progress?.progress ?? 0,
    exportProgressMessage: progress?.message ?? '',
  };
}
