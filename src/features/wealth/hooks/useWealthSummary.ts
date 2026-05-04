import { AppConfig } from '@/src/constants/app-config';
import { useUI } from '@/src/contexts/UIContext';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useObservable } from '@/src/hooks/useObservable';
import { reactiveDataService } from '@/src/services/ReactiveDataService';
import { WealthSummary } from '@/src/services/wealth-service';
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
export function useWealthSummary(): WealthSummaryResult {
  const { workplaceId } = useWorkplace();
  const { defaultCurrency } = useUI();
  const targetCurrency = defaultCurrency || AppConfig.defaultCurrency;

  const { data, isLoading, version } = useObservable(
    () =>
      workplaceId
        ? reactiveDataService.observeDashboardData(targetCurrency, workplaceId)
        : of({
            accounts: [],
            transactions: [],
            balances: [],
            wealthSummary: EMPTY_WEALTH_SUMMARY,
          }),
    [targetCurrency, workplaceId],
    {
      accounts: [],
      transactions: [],
      balances: [],
      wealthSummary: EMPTY_WEALTH_SUMMARY,
    },
  );

  return {
    ...data.wealthSummary,
    isLoading,
    version,
  };
}
