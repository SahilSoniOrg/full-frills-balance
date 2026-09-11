import { analytics } from '@/src/services/analytics';
import { AccountId } from '@/src/types/ids';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback } from 'react';

interface UseReportActionsProps {
  dateRange: { startDate: number; endDate: number };
}

/**
 * Hook to manage report-related actions like navigation and transaction viewing.
 */
export function useReportActions({ dateRange }: UseReportActionsProps) {
  const onViewTransactions = useCallback((start: number, end?: number) => {
    analytics.trackFeatureUsage('reports', 'drilldown_transactions');
    const startDate = new Date(start).setHours(0, 0, 0, 0);
    const endDate = end
      ? new Date(end).setHours(23, 59, 59, 999)
      : new Date(start).setHours(23, 59, 59, 999);

    AppNavigation.toJournalSearch({ startDate, endDate });
  }, []);

  const onViewCurrentTransactions = useCallback(
    (accountIds: AccountId[] = []) => {
      analytics.trackFeatureUsage('reports', 'drilldown_transactions');
      AppNavigation.toJournalSearch({
        ...(accountIds.length > 0 ? { accountIds } : {}),
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      });
    },
    [dateRange.endDate, dateRange.startDate],
  );

  const onLegendRowPress = useCallback(
    (accountIds: AccountId[]) => {
      if (accountIds.length === 0) return;

      analytics.trackFeatureUsage('reports', 'drilldown_category', {
        account_count: accountIds.length,
      });

      AppNavigation.toJournalSearch({
        accountIds,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      });
    },
    [dateRange.endDate, dateRange.startDate],
  );

  return {
    onViewTransactions,
    onViewCurrentTransactions,
    onLegendRowPress,
  };
}
