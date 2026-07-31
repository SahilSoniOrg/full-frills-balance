import {
  AccountsListInflowPeriod,
  aggregateLeafPeriodIncomeExpense,
  resolveInflowReportDateRange,
  resolveInflowTotals,
} from '@/src/features/accounts/helpers/accountsListHelpers';
import { reportService } from '@/src/services/report-service';
import { AccountBalance, PlainAccount, WorkplaceId } from '@/src/types/domain';
import Account from '@/src/data/models/Account';
import { logger } from '@/src/utils/logger';
import { useCallback, useEffect, useMemo, useState } from 'react';

export interface UseAccountsInflowSummaryArgs {
  workplaceId: WorkplaceId;
  workplaceCurrency: string;
  accounts: (Account | PlainAccount)[];
  balances: AccountBalance[];
  totalIncome: number;
  totalExpense: number;
  /** Bumps 30-day refetch when the account list stream versions. */
  dataVersion: number;
}

export interface AccountsInflowSummary {
  inflowPeriod: AccountsListInflowPeriod;
  setInflowPeriod: (period: AccountsListInflowPeriod) => void;
  inflowIncome: number;
  inflowExpense: number;
  isPeriodLoading: boolean;
}

/**
 * Period picker + income/expense totals for the accounts list header.
 * Month uses leaf period metrics from the shared balance stream; 30-days hits reports.
 */
export function useAccountsInflowSummary({
  workplaceId,
  workplaceCurrency,
  accounts,
  balances,
  totalIncome,
  totalExpense,
  dataVersion,
}: UseAccountsInflowSummaryArgs): AccountsInflowSummary {
  const [inflowPeriod, setInflowPeriodState] = useState<AccountsListInflowPeriod>('overall');
  const [rollingPeriodTotals, setRollingPeriodTotals] = useState<{
    income: number;
    expense: number;
  } | null>(null);
  const [isPeriodLoading, setIsPeriodLoading] = useState(false);

  const setInflowPeriod = useCallback((period: AccountsListInflowPeriod) => {
    setInflowPeriodState(period);
    if (period !== '30days') {
      setRollingPeriodTotals(null);
    }
  }, []);

  const monthPeriodTotals = useMemo(() => {
    if (inflowPeriod !== 'month') return null;
    return aggregateLeafPeriodIncomeExpense(accounts, balances);
  }, [inflowPeriod, accounts, balances]);

  useEffect(() => {
    if (!workplaceId || inflowPeriod !== '30days') {
      return;
    }

    let isMounted = true;
    Promise.resolve().then(() => {
      if (isMounted) {
        setIsPeriodLoading(true);
      }
    });

    const fetchTotals = async () => {
      try {
        const range = resolveInflowReportDateRange(inflowPeriod);
        if (!range) return;

        const { startDate, endDate } = range;
        const totals = await reportService.getIncomeVsExpense(
          workplaceId,
          startDate,
          endDate,
          workplaceCurrency,
        );

        if (isMounted) {
          setRollingPeriodTotals(totals);
          setIsPeriodLoading(false);
        }
      } catch (err) {
        logger.error('Failed to fetch period totals:', err);
        if (isMounted) {
          setIsPeriodLoading(false);
        }
      }
    };

    fetchTotals();

    return () => {
      isMounted = false;
    };
  }, [inflowPeriod, workplaceId, workplaceCurrency, dataVersion]);

  const periodTotals = inflowPeriod === 'month' ? monthPeriodTotals : rollingPeriodTotals;

  const { inflowIncome, inflowExpense } = useMemo(
    () =>
      resolveInflowTotals({
        inflowPeriod,
        totalIncome,
        totalExpense,
        periodTotals,
      }),
    [inflowPeriod, totalIncome, totalExpense, periodTotals],
  );

  return {
    inflowPeriod,
    setInflowPeriod,
    inflowIncome,
    inflowExpense,
    isPeriodLoading,
  };
}
