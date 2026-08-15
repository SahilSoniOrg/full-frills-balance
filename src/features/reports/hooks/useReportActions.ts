import { analytics } from '@/src/services/analytics-service';
import { AccountId } from '@/src/types/domain';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback } from 'react';

interface UseReportActionsProps {
  selectedPeriod: { start: number; end: number } | null;
  dateRange: { startDate: number; endDate: number };
}

/**
 * Hook to manage report-related actions like navigation and transaction viewing.
 */
export function useReportActions({ selectedPeriod, dateRange }: UseReportActionsProps) {
  const onViewTransactions = useCallback((start: number, end?: number) => {
    analytics.trackFeatureUsage('reports', 'drilldown_transactions');
    const startDate = new Date(start).setHours(0, 0, 0, 0);
    const endDate = end
      ? new Date(end).setHours(23, 59, 59, 999)
      : new Date(start).setHours(23, 59, 59, 999);

    AppNavigation.toJournalSearch({ startDate, endDate });
  }, []);

  const onViewSelectedTransactions = useCallback(() => {
    if (selectedPeriod) {
      onViewTransactions(selectedPeriod.start, selectedPeriod.end);
    }
  }, [selectedPeriod, onViewTransactions]);

  const onLegendRowPress = useCallback(
    (accountIds: AccountId[]) => {
      if (accountIds.length === 0) return;

      analytics.trackFeatureUsage('reports', 'drilldown_category', {
        account_count: accountIds.length,
      });

      const start = selectedPeriod?.start ?? dateRange.startDate;
      const end = selectedPeriod?.end ?? dateRange.endDate;

      AppNavigation.toJournalSearch({
        accountIds,
        startDate: start,
        endDate: end,
      });
    },
    [dateRange.endDate, dateRange.startDate, selectedPeriod],
  );

  return {
    onViewTransactions,
    onViewSelectedTransactions,
    onLegendRowPress,
  };
}
