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
    const startDate = new Date(start).setHours(0, 0, 0, 0);
    const endDate = end
      ? new Date(end).setHours(23, 59, 59, 999)
      : new Date(start).setHours(23, 59, 59, 999);

    AppNavigation.toJournalWithDateRange(startDate, endDate);
  }, []);

  const onViewSelectedTransactions = useCallback(() => {
    if (selectedPeriod) {
      onViewTransactions(selectedPeriod.start, selectedPeriod.end);
    }
  }, [selectedPeriod, onViewTransactions]);

  const onLegendRowPress = useCallback(
    (accountId: AccountId) => {
      const start = selectedPeriod?.start ?? dateRange.startDate;
      const end = selectedPeriod?.end ?? dateRange.endDate;

      AppNavigation.toJournalSearch({
        accountIds: [accountId],
        startDate: start,
        endDate: end,
      });
    },
    [dateRange.endDate, dateRange.startDate, selectedPeriod],
  );

  const onCategoryPress = useCallback(
    (category: string) => {
      const start = selectedPeriod?.start ?? dateRange.startDate;
      const end = selectedPeriod?.end ?? dateRange.endDate;

      AppNavigation.toJournalSearch({
        searchQuery: category,
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
    onCategoryPress,
  };
}
