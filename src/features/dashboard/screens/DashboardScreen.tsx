import { applySelectionChrome } from '@/src/components/layout/applySelectionChrome';
import type { JournalEntryListRef } from '@/src/components/journal/JournalEntryListView';
import type { TabScreenChrome } from '@/src/components/layout/screenChrome';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { DashboardHeaderActions } from '@/src/features/dashboard/components/DashboardHeaderActions';
import { DashboardScreenView } from '@/src/features/dashboard/components/DashboardScreenView';
import { useDashboardHeaderChrome } from '@/src/features/dashboard/hooks/useDashboardHeaderChrome';
import { useDashboardViewModel } from '@/src/features/dashboard/hooks/useDashboardViewModel';
import { trackDashboardFirstPaint } from '@/src/features/dashboard/hooks/useDashboardFeatureActions';
import { useJournalEntryFab } from '@/src/features/journal';
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

  const fab = useJournalEntryFab('dashboard');

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
          fab,
        },
      ),
    [fab, header, vm.recentJournalEntries.isSelectionModeActive],
  );

  return <DashboardScreenView {...vm} listRef={listRef} chrome={chrome} />;
}

export default withPrivacyScope(DashboardScreen);
