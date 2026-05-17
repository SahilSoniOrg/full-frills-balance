import { useObservable } from '@/src/hooks/useObservable';
import { reactiveDataService } from '@/src/services/ReactiveDataService';
import { WealthSummary } from '@/src/services/wealth-service';
import { WorkplaceId } from '@/src/types/domain';
import { snapshotService } from '@/src/utils/SnapshotService';
import { of } from 'rxjs';

export interface WealthSummaryResult extends WealthSummary {
  isLoading: boolean;
  version: number;
}

const EMPTY_WEALTH_SUMMARY: Omit<WealthSummaryResult, 'isLoading' | 'version'> = {
  netWorth: 0,
  totalAssets: 0,
  totalLiabilities: 0,
  totalEquity: 0,
  totalIncome: 0,
  totalExpense: 0,
};

/**
 * useWealthSummary - Consolidated hook for net worth and wealth metrics.
 *
 * Now uses ReactiveDataService to eliminate duplicate subscriptions.
 * Provides a single source of truth for wealth calculations.
 */
export function useWealthSummary(
  workplaceId: WorkplaceId,
  currencyCode: string,
): WealthSummaryResult {
  const targetCurrency = currencyCode;

  const { data, isLoading, version } = useObservable(
    () =>
      workplaceId
        ? reactiveDataService.observeDashboardData(targetCurrency, workplaceId)
        : of({
            accounts: [],
            enrichedJournals: [],
            balances: [],
            wealthSummary: EMPTY_WEALTH_SUMMARY,
          }),
    [targetCurrency, workplaceId],
    () => ({
      accounts: [],
      enrichedJournals: [],
      balances: [],
      wealthSummary: snapshotService.getWealthSnapshot(workplaceId) || EMPTY_WEALTH_SUMMARY,
    }),
  );

  return {
    ...data.wealthSummary,
    isLoading,
    version,
  };
}
