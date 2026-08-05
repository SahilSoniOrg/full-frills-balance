import { AppConfig } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useProfilePrefs } from '@/src/hooks/useProfilePrefs';
import { useSmsPrefs } from '@/src/hooks/useSmsPrefs';
import { useInsightPatterns } from '@/src/hooks/useInsightPatterns';
import { useUnreadSmsCount } from '@/src/hooks/useUnreadSmsCount';
import { getPerfNow } from '@/src/utils/dateHelpers';
import { logger as appLogger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { useEffect, useMemo, useRef } from 'react';
import { Platform } from 'react-native';

export type DashboardHeaderChrome = {
  greeting: string;
  notificationCount: number;
  onNotificationsPress: () => void;
  unreadSmsCount: number;
  onSmsPress?: () => void;
  onSearchPress: () => void;
};

export function useDashboardHeaderChrome(): DashboardHeaderChrome {
  const { userName } = useProfilePrefs();
  const { workplaceId } = useWorkplace();
  const { isAppReady } = useUI();
  const { isSmsImportEnabled } = useSmsPrefs();
  const { data: insights } = useInsightPatterns(workplaceId, { enabled: isAppReady });
  const { data: unreadSmsCount } = useUnreadSmsCount(workplaceId);
  const { strings } = AppConfig;
  const mountTimeRef = useRef(getPerfNow());

  const notificationCount = insights?.length || 0;

  useEffect(() => {
    if (notificationCount > 0) {
      const duration = Math.round(getPerfNow() - mountTimeRef.current);
      appLogger.info(`[Dashboard] Insights Loaded in ${duration}ms`);
    }
  }, [notificationCount]);

  const greeting = useMemo(
    () => strings.dashboard.greeting(userName),
    [userName, strings.dashboard],
  );

  const onSmsPress =
    Platform.OS === 'android' && (isSmsImportEnabled || (unreadSmsCount || 0) > 0)
      ? AppNavigation.toTransactionInbox
      : undefined;

  return useMemo(
    () => ({
      greeting,
      notificationCount,
      onNotificationsPress: AppNavigation.toHub,
      unreadSmsCount: unreadSmsCount || 0,
      onSmsPress,
      onSearchPress: AppNavigation.toJournalSearch,
    }),
    [greeting, notificationCount, onSmsPress, unreadSmsCount],
  );
}
