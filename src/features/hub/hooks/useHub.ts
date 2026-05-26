import { Insight, insightService } from '@/src/services/notification/NotificationService';
import { smsService } from '@/src/services/sms-service';
import { WorkplaceId } from '@/src/types/domain';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { of } from 'rxjs';

/**
 * Hook to manage notifications (insights and unprocessed SMS).
 * Centralizes orchestration logic for the Notifications screen.
 */
export function useHub(workplaceId: WorkplaceId) {
  const [activeInsights, setActiveInsights] = useState<Insight[]>([]);
  const [dismissedInsights, setDismissedInsights] = useState<Insight[]>([]);
  const [unreadSmsCount, setUnreadSmsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setTimeout(() => setIsLoading(true), 0);
    const activeSub = insightService.observePatterns(workplaceId).subscribe(insights => {
      setActiveInsights(insights);
      setIsLoading(false);
    });
    const dismissedSub = insightService
      .observeDismissedPatterns(workplaceId)
      .subscribe(setDismissedInsights);
    const smsSub = (
      Platform.OS === 'android' ? smsService.observeUnprocessedCount(workplaceId) : of(0)
    ).subscribe(setUnreadSmsCount);

    return () => {
      activeSub.unsubscribe();
      dismissedSub.unsubscribe();
      smsSub.unsubscribe();
    };
  }, [workplaceId]);

  const dismissInsight = useCallback(async (id: string) => {
    await insightService.dismissPattern(id);
  }, []);

  const restoreInsight = useCallback(async (id: string) => {
    await insightService.undismissPattern(id);
  }, []);

  return {
    activeInsights,
    dismissedInsights,
    unreadSmsCount,
    isLoading,
    dismissInsight,
    restoreInsight,
  };
}
