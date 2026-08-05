import type { TabScreenChrome } from '@/src/components/layout/screenChrome';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { DashboardHeaderActions } from '@/src/features/dashboard/components/DashboardHeaderActions';
import { DashboardScreenView } from '@/src/features/dashboard/components/DashboardScreenView';
import { useDashboardHeaderChrome } from '@/src/features/dashboard/hooks/useDashboardHeaderChrome';
import { useDashboardViewModel } from '@/src/features/dashboard/hooks/useDashboardViewModel';
import { analytics } from '@/src/services/analytics-service';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { useScrollToTop } from 'expo-router/react-navigation';
import { useCallback, useEffect, useMemo, useRef } from 'react';

function DashboardScreen() {
  const vm = useDashboardViewModel();
  const headerChrome = useDashboardHeaderChrome();
  const listRef = useRef(null);

  useEffect(() => {
    logger.info('[Dashboard] Screen Mounted');
  }, []);

  useEffect(() => {
    interface GlobalBootState {
      __BOOT_START_TIME__?: number;
      __HAS_MOUNTED_BEFORE__?: boolean;
    }
    const globalState = globalThis as unknown as GlobalBootState;
    const startTime = globalState.__BOOT_START_TIME__;
    if (startTime) {
      const duration = performance.now() - startTime;
      const isColdBoot = !globalState.__HAS_MOUNTED_BEFORE__;
      globalState.__HAS_MOUNTED_BEFORE__ = true;
      analytics.track('first_paint', {
        duration_ms: Math.round(duration),
        is_cold_boot: isColdBoot,
      });
      logger.info(`[Performance] First Paint: ${Math.round(duration)}ms (Cold: ${isColdBoot})`);
      globalState.__BOOT_START_TIME__ = undefined;
    }
  }, []);

  useScrollToTop(listRef);

  const handleNewEntryPress = useCallback(() => {
    analytics.logEntrypointOpened('dashboard', 'bottom_action');
    analytics.logEntrypointSelected('dashboard', 'bottom_action', 'journal_entry');
    AppNavigation.toJournalEntry();
  }, []);

  const chrome = useMemo<TabScreenChrome>(
    () => ({
      screenTitle: headerChrome.greeting,
      headerActions: (
        <DashboardHeaderActions
          onSearchPress={headerChrome.onSearchPress}
          onNotificationsPress={headerChrome.onNotificationsPress}
          notificationCount={headerChrome.notificationCount}
          onSmsPress={headerChrome.onSmsPress}
          unreadSmsCount={headerChrome.unreadSmsCount}
        />
      ),
      fab: vm.recentTransactions.isSelectionModeActive
        ? undefined
        : {
            onPress: handleNewEntryPress,
            label: 'New Entry',
            placement: 'end',
            accessibilityLabel: 'Open new entry options',
          },
    }),
    [handleNewEntryPress, headerChrome, vm.recentTransactions.isSelectionModeActive],
  );

  return <DashboardScreenView {...vm} listRef={listRef} chrome={chrome} />;
}

export default withPrivacyScope(DashboardScreen);
