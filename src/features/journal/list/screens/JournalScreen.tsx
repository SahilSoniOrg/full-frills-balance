import { applySelectionChrome } from '@/src/components/layout/applySelectionChrome';
import type { TabScreenChrome } from '@/src/components/layout/screenChrome';
import { journalCsvExportHeaderAction } from '@/src/components/journal/JournalCsvExportButton';
import { AppConfig, Size } from '@/src/constants';
import { PrivacyToggleButton } from '@/src/components/shared/PrivacyToggleButton';
import { ScreenHeaderActions } from '@/src/components/shared/ScreenHeaderActions';
import { Icon } from '@/src/types/domainIcons';
import { JournalListView } from '@/src/features/journal/components/JournalListView';
import { useJournalList } from '@/src/features/journal/hooks/useJournalList';
import { AppNavigation } from '@/src/utils/navigation';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useMemo, useEffect } from 'react';
import { useIsFocused } from 'expo-router';
import { usePrimaryPageNavigation } from '@/src/navigation/primaryPageNavigation';

function JournalScreen() {
  const { workplaceId } = useWorkplace();
  const isFocused = useIsFocused();
  const pageNavigation = usePrimaryPageNavigation();

  const journalList = useJournalList(
    {
      enabled: isFocused,
      pageSize: AppConfig.pagination.dashboardPageSize,
      emptyState: {
        title: AppConfig.strings.journal.emptyTitle,
        subtitle: AppConfig.strings.journal.emptySubtitle,
      },
      loadingMoreText: AppConfig.strings.common.loading,
    },
    workplaceId,
  );
  const isBlockingOverlayOpen =
    journalList.datePicker.visible || journalList.modals.activeModal !== null;
  useEffect(() => {
    const lockId = 'activity-overlay';
    pageNavigation?.setPageSwipeLock(lockId, isBlockingOverlayOpen);
    return () => pageNavigation?.setPageSwipeLock(lockId, false);
  }, [isBlockingOverlayOpen, pageNavigation?.setPageSwipeLock]);

  const csvExport = journalList.list.csvExport;

  const chrome = useMemo<TabScreenChrome>(() => {
    const exportAction = journalCsvExportHeaderAction(csvExport);
    return applySelectionChrome(
      {
        screenTitle: AppConfig.strings.journal.transactions,
        kind: 'tab',
        headerActions: (
          <ScreenHeaderActions
            actions={[
              ...(exportAction ? [exportAction] : []),
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
      },
    );
  }, [csvExport, journalList.exitSelectionMode, journalList.isSelectionModeActive]);

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

export default JournalScreen;
