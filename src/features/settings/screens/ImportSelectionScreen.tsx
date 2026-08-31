import { ImportSelectionView } from '@/src/features/settings/components/ImportSelectionView';
import { useImport } from '@/src/hooks/use-import';
import { importRegistry } from '@/src/services/import';
import { useCallback, useEffect, useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { AppNavigation } from '@/src/utils/navigation';
import { preferences } from '@/src/utils/preferences';
import type { WorkplaceId } from '@/src/types/ids';

export default function ImportSelectionScreen() {
  const { source } = useLocalSearchParams<{ source?: string }>();
  const isNewWorkplace = true;
  const isOnboardingImport = source === 'onboarding';
  const workplaceId = undefined;
  const { handleImport, isImporting, progress, progressMessage, importStats } = useImport(true);
  const plugins = useMemo(() => importRegistry.getAll(), []);

  useEffect(() => {
    if (isOnboardingImport && importStats?.workplaceId) {
      preferences.device.setOnboardingWorkplaceId(importStats.workplaceId as WorkplaceId);
      preferences.device.setOnboardingStage('post_import');
    }
  }, [importStats, isOnboardingImport]);

  const handleImportComplete = useCallback(() => {
    if (isOnboardingImport && importStats?.workplaceId) {
      AppNavigation.toOnboarding('post_import');
      return;
    }
    AppNavigation.toSettings();
  }, [importStats, isOnboardingImport]);

  const handleOpenImportedWorkplace = useCallback(() => {
    if (importStats?.workplaceId) {
      preferences.device.setActiveWorkplaceId(importStats.workplaceId as WorkplaceId);
    }
    AppNavigation.toDashboard();
  }, [importStats]);

  const handleStayOnCurrentWorkplace = useCallback(() => {
    AppNavigation.toSettings();
  }, []);

  const handleSelect = useCallback(
    (id: string) => {
      handleImport(workplaceId, id);
    },
    [handleImport, workplaceId],
  );

  return (
    <ImportSelectionView
      plugins={plugins}
      isImporting={isImporting}
      progress={progress}
      progressMessage={progressMessage}
      importStats={importStats}
      onSelect={handleSelect}
      onImportComplete={handleImportComplete}
      onOpenImportedWorkplace={handleOpenImportedWorkplace}
      onStayOnCurrentWorkplace={handleStayOnCurrentWorkplace}
      isOnboardingImport={isOnboardingImport}
      isNewWorkplace={isNewWorkplace}
    />
  );
}
