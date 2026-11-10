import { useCaptureMutations } from '@/src/features/settings/hooks/useCaptureMutations';
import { useCaptureWorkspace } from '@/src/features/settings/hooks/useCaptureWorkspace';
import type { CaptureLoadOptions } from '@/src/features/settings/hooks/captureWorkspaceStore';

/** Facade over the shared capture workspace store + mutation handlers. */
export function useTransactionCaptureViewModel(options: CaptureLoadOptions = {}) {
  const workspace = useCaptureWorkspace(options);
  const settings = workspace.settings;
  const lists = workspace.lists;
  const currentLists = lists.data;
  const loading = settings.loading || lists.loading || (!settings.data && !settings.error);
  const mutations = useCaptureMutations(workspace.workplaceId, workspace.refresh, {
    loading: settings.loading || (!settings.data && !settings.error),
    settingsError: settings.error,
  });

  return {
    workplaceId: workspace.workplaceId,
    hasSnapshot: !!settings.data,
    enabled: settings.data?.enabled ?? false,
    enabledAt: settings.data?.enabledAt,
    needsAccountSetup: settings.data?.needsAccountSetup ?? false,
    reviewCount: currentLists?.reviewCount ?? 0,
    review: currentLists?.review ?? [],
    defaulted: currentLists?.defaulted ?? [],
    categoryDefaults: currentLists?.categoryDefaults ?? [],
    descriptionDefaults: currentLists?.descriptionDefaults ?? [],
    categoryCandidates: currentLists?.categoryCandidates ?? [],
    descriptionCandidates: currentLists?.descriptionCandidates ?? [],
    historicalCategorySuggestions: currentLists?.historicalCategorySuggestions ?? [],
    mixedHistoricalCategoryPatterns: currentLists?.mixedHistoricalCategoryPatterns ?? [],
    mixedHistoricalCategoryCount: currentLists?.mixedHistoricalCategoryCount ?? 0,
    loading,
    busy: mutations.busy,
    error: settings.error || lists.error,
    settingsError: settings.error,
    onRetry: workspace.refresh,
    ...mutations,
  };
}

export type TransactionCaptureViewModel = ReturnType<typeof useTransactionCaptureViewModel>;
