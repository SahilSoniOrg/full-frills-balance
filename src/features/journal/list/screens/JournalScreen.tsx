import type { TabScreenChrome } from '@/src/components/layout/screenChrome';
import { AppConfig } from '@/src/constants';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { JournalListHeaderActions } from '@/src/features/journal/components/JournalListHeaderActions';
import { JournalListView } from '@/src/features/journal/components/JournalListView';
import { useJournalListScreen } from '@/src/features/journal/hooks/useJournalListScreen';
import { analytics } from '@/src/services/analytics-service';
import { AppNavigation } from '@/src/utils/navigation';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useCallback, useMemo } from 'react';

function JournalScreen() {
  const { workplaceId } = useWorkplace();

  const { render, vm } = useJournalListScreen(
    {
      pageSize: AppConfig.pagination.dashboardPageSize,
      emptyState: {
        title: AppConfig.strings.journal.emptyTitle,
        subtitle: AppConfig.strings.journal.emptySubtitle,
      },
      loadingText: AppConfig.strings.common.loading,
      loadingMoreText: AppConfig.strings.common.loading,
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
      showBack: false,
      headerActions: <JournalListHeaderActions />,
      fab: render.selection?.isSelectionModeActive
        ? undefined
        : {
            onPress: handleFabPress,
            label: 'New Entry',
            placement: 'end',
            accessibilityLabel: 'Open new entry options',
          },
      isSearchActive: false,
    }),
    [handleFabPress, render.selection?.isSelectionModeActive],
  );

  const periodBar = useMemo(
    () => ({
      range: vm.dateRange,
      onPress: vm.showDatePicker,
      onPrevious: vm.navigatePrevious,
      onNext: vm.navigateNext,
    }),
    [vm.dateRange, vm.navigateNext, vm.navigatePrevious, vm.showDatePicker],
  );

  return (
    <JournalListView
      list={{ ...render.list, listHeader: null }}
      chrome={chrome}
      datePicker={render.datePicker}
      periodBar={periodBar}
      selection={render.selection}
    />
  );
}

export default withPrivacyScope(JournalScreen);
