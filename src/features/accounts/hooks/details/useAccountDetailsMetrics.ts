import Transaction from '@/src/data/models/Transaction';
import { AccountType, AccountBalance, AccountId, WorkplaceId } from '@/src/types/domain';

import { AppConfig } from '@/src/constants';
import { useCurrencyPrecision } from '@/src/hooks/use-currencies';
import { useObservable } from '@/src/hooks/useObservable';
import {
  observeAccountChartTransactions,
  observeAccountPeriodMetrics,
} from '@/src/services/accounts/accountDerivedReads';
import { buildAccountRollingBalanceSeries, RunningBalanceTx } from '@/src/services/projections';
import { DateRange } from '@/src/utils/dateUtils';
import dayjs from 'dayjs';
import { useMemo } from 'react';
import { map, of } from 'rxjs';

export interface PeriodMetrics {
  totalIncrease: number;
  totalDecrease: number;
  netChange: number;
  dailyAverage: number | null;
  isLoading: boolean;
}

export interface UseAccountDetailsMetricsOptions {
  accountId: AccountId;
  workplaceId: WorkplaceId;
  accountType: AccountType;
  balanceCurrency: string;
  dateRange: DateRange | null;
  balanceData: AccountBalance | null;
}

export function useAccountDetailsMetrics(options: UseAccountDetailsMetricsOptions) {
  const { accountId, workplaceId, accountType, balanceCurrency, dateRange, balanceData } = options;

  const { precision } = useCurrencyPrecision(balanceCurrency);

  const secondaryBalances = useMemo(() => {
    if (!balanceData?.childBalances) return [];
    return balanceData.childBalances.map((cb: { currencyCode: string; balance: number }) => ({
      currencyCode: cb.currencyCode,
      amount: cb.balance,
    }));
  }, [balanceData]);

  const { data: periodMetricsResult, isLoading: metricsLoading } = useObservable<PeriodMetrics>(
    () => {
      if (!dateRange || !accountId || !accountType) {
        return of({
          totalIncrease: 0,
          totalDecrease: 0,
          netChange: 0,
          dailyAverage: null,
          isLoading: false,
        });
      }
      return observeAccountPeriodMetrics(
        workplaceId,
        accountId,
        dateRange.startDate,
        dateRange.endDate,
        accountType,
      ).pipe(
        map(metrics => {
          const netChange = metrics.totalIncrease - metrics.totalDecrease;
          const ds = new Date(dateRange.startDate);
          const de = new Date(dateRange.endDate);
          const days = Math.max(
            1,
            Math.ceil((de.getTime() - ds.getTime()) / AppConfig.time.msPerDay),
          );
          return {
            ...metrics,
            netChange,
            dailyAverage: netChange / days,
            isLoading: false,
          };
        }),
      );
    },
    [accountId, dateRange, accountType, workplaceId],
    { totalIncrease: 0, totalDecrease: 0, netChange: 0, dailyAverage: null, isLoading: true },
  );

  const periodMetrics = useMemo(
    () => ({
      ...periodMetricsResult,
      isLoading: metricsLoading || periodMetricsResult.isLoading,
    }),
    [periodMetricsResult, metricsLoading],
  );

  const { data: chartTransactions } = useObservable<Transaction[]>(
    () => {
      const MS_PER_DAY = AppConfig.time.msPerDay;
      const start =
        (dateRange ? dateRange.startDate : dayjs().startOf('month').valueOf()) - 7 * MS_PER_DAY;
      const end =
        (dateRange ? dateRange.endDate : dayjs().endOf('month').valueOf()) + 7 * MS_PER_DAY;
      return observeAccountChartTransactions(workplaceId, accountId, start, end);
    },
    [workplaceId, accountId, dateRange],
    [],
  );

  const { chartData, rollingAverageData, xTicks } = useMemo(
    () =>
      buildAccountRollingBalanceSeries({
        transactions: (chartTransactions ?? []).map<RunningBalanceTx>(transaction => ({
          transactionDate: transaction.transactionDate,
          runningBalance: transaction.runningBalance,
        })),
        visibleStart: dateRange?.startDate,
        visibleEnd: dateRange?.endDate,
        msPerDay: AppConfig.time.msPerDay,
      }),
    [chartTransactions, dateRange],
  );

  return {
    precision,
    secondaryBalances,
    periodMetrics,
    chartData,
    rollingAverageData,
    xTicks,
  };
}
