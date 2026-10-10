import { applySelectionChrome } from '@/src/components/layout/applySelectionChrome';
import type { TabScreenChrome } from '@/src/components/layout/screenChrome';
import { AppConfig, Size } from '@/src/constants';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { PrivacyToggleButton } from '@/src/components/shared/PrivacyToggleButton';
import { ScreenHeaderActions } from '@/src/components/shared/ScreenHeaderActions';
import { Icon } from '@/src/types/domainIcons';
import { JournalListView } from '@/src/features/journal/components/JournalListView';
import { useJournalEntryFab } from '@/src/features/journal/hooks/useJournalEntryFab';
import { useJournalList } from '@/src/features/journal/hooks/useJournalList';
import { AppNavigation } from '@/src/utils/navigation';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useMemo } from 'react';

function JournalScreen() {
  const { workplaceId } = useWorkplace();

  const journalList = useJournalList(
    {
      pageSize: AppConfig.pagination.dashboardPageSize,
      emptyState: {
        title: AppConfig.strings.journal.emptyTitle,
        subtitle: AppConfig.strings.journal.emptySubtitle,
      },
      loadingMoreText: AppConfig.strings.common.loading,
    },
    workplaceId,
  );

  const fab = useJournalEntryFab('activity');

  const chrome = useMemo<TabScreenChrome>(
    () =>
      applySelectionChrome(
        {
          screenTitle: AppConfig.strings.journal.transactions,
          showBack: false,
          headerActions: (
            <ScreenHeaderActions
              actions={[
                {
                  name: Icon.Reports,
                  size: Size.iconSm,
                  variant: 'surface',
                  onPress: AppNavigation.toReports,
                  accessibilityLabel: 'View Analytics',
                },
                {
                  name: Icon.Search,
                  size: Size.iconSm,
                  variant: 'surface',
                  onPress: () => AppNavigation.toJournalSearch(),
                  accessibilityLabel: 'Search and Filter',
                },
              ]}
              trailing={<PrivacyToggleButton />}
            />
          ),
        },
        {
          active: journalList.isSelectionModeActive,
          onExit: journalList.exitSelectionMode,
          fab,
        },
      ),
    [fab, journalList.exitSelectionMode, journalList.isSelectionModeActive],
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
