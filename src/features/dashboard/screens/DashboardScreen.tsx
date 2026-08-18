import { applySelectionChrome } from '@/src/components/layout/applySelectionChrome';
import type { TabScreenChrome } from '@/src/components/layout/screenChrome';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { DashboardHeaderActions } from '@/src/features/dashboard/components/DashboardHeaderActions';
import { DashboardScreenView } from '@/src/features/dashboard/components/DashboardScreenView';
import { useDashboardHeaderChrome } from '@/src/features/dashboard/hooks/useDashboardHeaderChrome';
import { useDashboardViewModel } from '@/src/features/dashboard/hooks/useDashboardViewModel';
import { logger } from '@/src/utils/logger';
import {
  trackDashboardFirstPaint,
  useDashboardFeatureActions,
} from '@/src/features/dashboard/hooks/useDashboardFeatureActions';
import { useScrollToTop } from 'expo-router/react-navigation';
import { useEffect, useMemo, useRef } from 'react';

function DashboardScreen() {
  const vm = useDashboardViewModel();
  const header = useDashboardHeaderChrome();
  const listRef = useRef(null);

  useEffect(() => {
    logger.info('[Dashboard] Screen Mounted');
  }, []);

  useEffect(() => {
    trackDashboardFirstPaint();
  }, []);

  useScrollToTop(listRef);

  const { openJournalEntry } = useDashboardFeatureActions();

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
          },
        },
      ),
    [openJournalEntry, header, vm.recentJournalEntries.isSelectionModeActive],
  );

  return <DashboardScreenView {...vm} listRef={listRef} chrome={chrome} />;
}

export default withPrivacyScope(DashboardScreen);
