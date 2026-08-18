import { AppConfig } from '@/src/constants';
import { useAppReady } from '@/src/contexts/app-shell/AppReadyProvider';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useProfilePrefs } from '@/src/hooks/useProfilePrefs';
import { useSmsPrefs } from '@/src/hooks/useSmsPrefs';
import { useInsightPatterns } from '@/src/hooks/useInsightPatterns';
import { useUnreadSmsCount } from '@/src/hooks/useUnreadSmsCount';
import { getPerfNow } from '@/src/utils/dateHelpers';
import { logger as appLogger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

/** Data for Dashboard tab title + header actions. */
export type DashboardHeaderChrome = {
  screenTitle: string;
  notificationCount: number;
  unreadSmsCount: number;
  onSmsPress?: () => void;
  onNotificationsPress: () => void;
  onSearchPress: () => void;
};

export function useDashboardHeaderChrome(): DashboardHeaderChrome {
  const { userName } = useProfilePrefs();
  const { workplaceId } = useWorkplace();
  const { isAppReady } = useAppReady();
  const { isSmsImportEnabled } = useSmsPrefs();
  const { data: insights } = useInsightPatterns(workplaceId, { enabled: isAppReady });
  const { data: unreadSmsCount } = useUnreadSmsCount(workplaceId);
  const mountTimeRef = useRef(getPerfNow());

  const notificationCount = insights?.length || 0;

  useEffect(() => {
    if (notificationCount > 0) {
      const duration = Math.round(getPerfNow() - mountTimeRef.current);
      appLogger.info(`[Dashboard] Insights Loaded in ${duration}ms`);
    }
  }, [notificationCount]);

  const onSmsPress =
    Platform.OS === 'android' && (isSmsImportEnabled || (unreadSmsCount || 0) > 0)
      ? AppNavigation.toTransactionInbox
      : undefined;

  return {
    screenTitle: AppConfig.strings.dashboard.greeting(userName),
    notificationCount,
    unreadSmsCount: unreadSmsCount || 0,
    onSmsPress,
    onNotificationsPress: AppNavigation.toHub,
    onSearchPress: AppNavigation.toJournalSearch,
  };
}
