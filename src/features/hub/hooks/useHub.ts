import { useInsightPatterns, useDismissedInsightPatterns } from '@/src/hooks/useInsightPatterns';
import { useUnreadSmsCount } from '@/src/hooks/useUnreadSmsCount';
import { insightService } from '@/src/services/insight/InsightService';
import { WorkplaceId } from '@/src/types/domain';
import { useCallback } from 'react';

/**
 * Hook to manage notifications (insights and unprocessed SMS).
 * Centralizes orchestration logic for the Notifications screen.
 */
export function useHub(workplaceId: WorkplaceId) {
  const { data: activeInsights, isLoading } = useInsightPatterns(workplaceId);
  const { data: dismissedInsights } = useDismissedInsightPatterns(workplaceId);
  const { data: unreadSmsCount } = useUnreadSmsCount(workplaceId);

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
