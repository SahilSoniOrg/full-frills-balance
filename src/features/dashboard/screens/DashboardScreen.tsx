import { applySelectionChrome } from '@/src/components/layout/applySelectionChrome';
import type { JournalEntryListRef } from '@/src/components/journal/JournalEntryListView';
import type { TabScreenChrome } from '@/src/components/layout/screenChrome';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { AppConfig } from '@/src/constants';
import { useAppReady } from '@/src/contexts/app-shell/appReady';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { DashboardHeaderActions } from '@/src/features/dashboard/components/DashboardHeaderActions';
import { DashboardScreenView } from '@/src/features/dashboard/components/DashboardScreenView';
import { useDashboardViewModel } from '@/src/features/dashboard/hooks/useDashboardViewModel';
import { useJournalEntryFab } from '@/src/features/journal';
import { useProfilePrefs } from '@/src/hooks/useProfilePrefs';
import { useSmsPrefs } from '@/src/hooks/useSmsPrefs';
import { useInsightPatterns } from '@/src/hooks/useInsightPatterns';
import { useSupplementalInsights } from '@/src/hooks/useSupplementalInsights';
import { useUnreadSmsCount } from '@/src/hooks/useUnreadSmsCount';
import { analytics } from '@/src/services/analytics';
import { getPerfNow } from '@/src/utils/dateUtils';
import { logger as appLogger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { useScrollToTop } from 'expo-router/react-navigation';
import { useEffect, useMemo, useRef } from 'react';
import { Platform } from 'react-native';

interface GlobalBootState {
  __BOOT_START_TIME__?: number;
  __HAS_MOUNTED_BEFORE__?: boolean;
}

function trackDashboardFirstPaint() {
  const globalState = globalThis as unknown as GlobalBootState;
  const startTime = globalState.__BOOT_START_TIME__;
  if (!startTime) return;
  const duration = performance.now() - startTime;
  const isColdBoot = !globalState.__HAS_MOUNTED_BEFORE__;
  globalState.__HAS_MOUNTED_BEFORE__ = true;
  analytics.track('first_paint', {
    duration_ms: Math.round(duration),
    is_cold_boot: isColdBoot,
  });
  appLogger.info(`[Performance] First Paint: ${Math.round(duration)}ms (Cold: ${isColdBoot})`);
  globalState.__BOOT_START_TIME__ = undefined;
}

function DashboardScreen() {
  const vm = useDashboardViewModel();
  const { userName } = useProfilePrefs();
  const { workplaceId } = useWorkplace();
  const { isAppReady } = useAppReady();
  const { isAutomaticSmsImportEnabled } = useSmsPrefs();
  const { data: insights } = useInsightPatterns(workplaceId, { enabled: isAppReady });
  const supplementalInsights = useSupplementalInsights(workplaceId);
  const { data: unreadSmsCount } = useUnreadSmsCount(workplaceId);
  const headerMountTimeRef = useRef(getPerfNow());
  const listRef = useRef<JournalEntryListRef>(null);

  const notificationCount = (insights?.length || 0) + supplementalInsights.length;

  useEffect(() => {
    if (notificationCount > 0) {
      const duration = Math.round(performance.now() - headerMountTimeRef.current);
      appLogger.info(`[Dashboard] Insights Loaded in ${duration}ms`);
    }
  }, [notificationCount]);

  const onSmsPress =
    Platform.OS === 'android' && (isAutomaticSmsImportEnabled || (unreadSmsCount || 0) > 0)
      ? AppNavigation.toTransactionInbox
      : undefined;

  useEffect(() => {
    trackDashboardFirstPaint();
  }, []);

  useScrollToTop(listRef);

  const fab = useJournalEntryFab('dashboard');

  const chrome = useMemo<TabScreenChrome>(
    () =>
      applySelectionChrome(
        {
          screenTitle: AppConfig.strings.dashboard.greeting(userName),
          headerActions: (
            <DashboardHeaderActions
              onSearchPress={AppNavigation.toJournalSearch}
              onNotificationsPress={AppNavigation.toHub}
              notificationCount={notificationCount}
              onSmsPress={onSmsPress}
              unreadSmsCount={unreadSmsCount || 0}
            />
          ),
        },
        {
          active: vm.recentJournalEntries.isSelectionModeActive,
          fab,
        },
      ),
    [fab, notificationCount, onSmsPress, unreadSmsCount, userName, vm.recentJournalEntries.isSelectionModeActive],
  );

  return <DashboardScreenView {...vm} listRef={listRef} chrome={chrome} />;
}

export default withPrivacyScope(DashboardScreen);
