import type { TabScreenChrome } from '@/src/components/layout/screenChrome';
import { AppConfig } from '@/src/constants';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { JournalListHeaderActions } from '@/src/features/journal/components/JournalListHeaderActions';
import { JournalListView } from '@/src/features/journal/components/JournalListView';
import { useJournalListScreen } from '@/src/features/journal/hooks/useJournalListScreen';
import { useJournalRouteDateRange } from '@/src/features/journal/list/hooks/useJournalRouteDateRange';
import { analytics } from '@/src/services/analytics-service';
import { AppNavigation } from '@/src/utils/navigation';
import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';

function JournalScreen() {
  const { workplaceId } = useWorkplace();
  const initialDateRange = useJournalRouteDateRange();
  const canGoBack = router.canGoBack();

  const { render, vm } = useJournalListScreen(
    {
      pageSize: AppConfig.pagination.dashboardPageSize,
      emptyState: {
        title: AppConfig.strings.journal.emptyTitle,
        subtitle: AppConfig.strings.journal.emptySubtitle,
      },
      loadingText: AppConfig.strings.common.loading,
      loadingMoreText: AppConfig.strings.common.loading,
      initialDateRange: initialDateRange ?? null,
    },
    workplaceId,
  );

  const handleFabPress = useCallback(() => {
    analytics.logEntrypointOpened('activity', 'bottom_action');
    analytics.logEntrypointSelected('activity', 'bottom_action', 'journal_entry');
    AppNavigation.toJournalEntry();
  }, []);

  const chrome = useMemo<TabScreenChrome>(
    () => ({
      screenTitle: AppConfig.strings.journal.transactions,
      headerActions: (
        <JournalListHeaderActions
          dateRange={vm.dateRange}
          showDatePicker={vm.showDatePicker}
          navigatePrevious={vm.navigatePrevious}
          navigateNext={vm.navigateNext}
        />
      ),
      fab: render.selection?.isSelectionModeActive
        ? undefined
        : {
            onPress: handleFabPress,
            label: 'New Entry',
            placement: 'end',
            accessibilityLabel: 'Open new entry options',
          },
      showBack: canGoBack && !render.selection?.isSelectionModeActive,
      isSearchActive: false,
      alignTitle: canGoBack ? 'center' : 'left',
    }),
    [
      canGoBack,
      handleFabPress,
      render.selection?.isSelectionModeActive,
      vm.dateRange,
      vm.navigateNext,
      vm.navigatePrevious,
      vm.showDatePicker,
    ],
  );

  return (
    <JournalListView
      list={{ ...render.list, listHeader: null }}
      chrome={chrome}
      datePicker={render.datePicker}
      selection={render.selection}
    />
  );
}

export default withPrivacyScope(JournalScreen);
