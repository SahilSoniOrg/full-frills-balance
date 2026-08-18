import { applySelectionChrome } from '@/src/components/layout/applySelectionChrome';
import type { TabScreenChrome } from '@/src/components/layout/screenChrome';
import { AppConfig } from '@/src/constants';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { JournalListHeaderActions } from '@/src/features/journal/components/JournalListHeaderActions';
import { JournalListView } from '@/src/features/journal/components/JournalListView';
import { useJournalList } from '@/src/features/journal/hooks/useJournalList';
import { analytics } from '@/src/services/analytics-service';
import { AppNavigation } from '@/src/utils/navigation';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useCallback, useMemo } from 'react';

function JournalScreen() {
  const { workplaceId } = useWorkplace();

  const journalList = useJournalList(
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
    () =>
      applySelectionChrome(
        {
          screenTitle: AppConfig.strings.journal.transactions,
          showBack: false,
          headerActions: (
            <JournalListHeaderActions
              onOpenReports={AppNavigation.toReports}
              onOpenSearch={() => AppNavigation.toJournalSearch()}
            />
          ),
        },
        {
          active: journalList.isSelectionModeActive,
          onExit: journalList.exitSelectionMode,
          fab: {
            onPress: handleFabPress,
            label: 'New Entry',
            placement: 'end',
            accessibilityLabel: 'Open new entry options',
          },
        },
      ),
    [handleFabPress, journalList.exitSelectionMode, journalList.isSelectionModeActive],
  );

  return (
    <JournalListView
      list={{ ...journalList.list, listHeader: null }}
      chrome={chrome}
      datePicker={journalList.datePicker}
      periodBar={journalList.periodBar}
      selection={journalList.selection}
      modals={journalList.modals}
    />
  );
}

export default withPrivacyScope(JournalScreen);
