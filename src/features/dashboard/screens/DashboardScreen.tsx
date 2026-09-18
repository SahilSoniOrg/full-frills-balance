import { applySelectionChrome } from '@/src/components/layout/applySelectionChrome';
import type { JournalEntryListRef } from '@/src/components/journal/JournalEntryListView';
import type { TabScreenChrome } from '@/src/components/layout/screenChrome';
import { AppConfig } from '@/src/constants';
import { Icon } from '@/src/components/core';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { DashboardHeaderActions } from '@/src/features/dashboard/components/DashboardHeaderActions';
import { DashboardScreenView } from '@/src/features/dashboard/components/DashboardScreenView';
import { useDashboardHeaderChrome } from '@/src/features/dashboard/hooks/useDashboardHeaderChrome';
import { useDashboardViewModel } from '@/src/features/dashboard/hooks/useDashboardViewModel';
import {
  trackDashboardFirstPaint,
  useDashboardFeatureActions,
} from '@/src/features/dashboard/hooks/useDashboardFeatureActions';
import { useScrollToTop } from 'expo-router/react-navigation';
import { useEffect, useMemo, useRef } from 'react';

function DashboardScreen() {
  const vm = useDashboardViewModel();
  const header = useDashboardHeaderChrome();
  const listRef = useRef<JournalEntryListRef>(null);

  useEffect(() => {
    trackDashboardFirstPaint();
  }, []);

  useScrollToTop(listRef);

  const { openJournalEntry, openJournalEntryType } = useDashboardFeatureActions();

  const chrome = useMemo<TabScreenChrome>(
    () =>
      applySelectionChrome(
        {
          screenTitle: header.screenTitle,
          headerActions: (
            <DashboardHeaderActions
              onSearchPress={header.onSearchPress}
              onNotificationsPress={header.onNotificationsPress}
              notificationCount={header.notificationCount}
              onSmsPress={header.onSmsPress}
              unreadSmsCount={header.unreadSmsCount}
            />
          ),
        },
        {
          active: vm.recentJournalEntries.isSelectionModeActive,
          fab: {
            onPress: openJournalEntry,
            label: 'New Entry',
            placement: 'end',
            accessibilityLabel: 'Open new entry options',
            actions: [
              {
                id: 'expense',
                label: AppConfig.strings.journal.expense,
                icon: Icon.ArrowDown,
                testID: 'journal-entry-fab-expense',
                onPress: () => openJournalEntryType('expense'),
              },
              {
                id: 'income',
                label: AppConfig.strings.journal.income,
                icon: Icon.ArrowUp,
                testID: 'journal-entry-fab-income',
                onPress: () => openJournalEntryType('income'),
              },
              {
                id: 'transfer',
                label: AppConfig.strings.journal.transfer,
                icon: Icon.SwapHorizontal,
                testID: 'journal-entry-fab-transfer',
                onPress: () => openJournalEntryType('transfer'),
              },
            ],
          },
        },
      ),
    [openJournalEntry, openJournalEntryType, header, vm.recentJournalEntries.isSelectionModeActive],
  );

  return <DashboardScreenView {...vm} listRef={listRef} chrome={chrome} />;
}

export default withPrivacyScope(DashboardScreen);
