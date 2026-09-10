import { AccountType } from '@/src/types/enums';
import { AccountBalance } from '@/src/types/domainReadModels';
import { AccountId, WorkplaceId } from '@/src/types/ids';

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
  accountIds: AccountId[];
}

export function useAccountDetailsMetrics(options: UseAccountDetailsMetricsOptions) {
  const {
    accountId,
    workplaceId,
    accountType,
    balanceCurrency,
    dateRange,
    balanceData,
    accountIds,
  } = options;

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
      if (!accountId || !accountType) {
        return of({
          totalIncrease: 0,
          totalDecrease: 0,
          netChange: 0,
          dailyAverage: null,
          isLoading: false,
        });
      }
      const startDate = dateRange?.startDate ?? 0;
      const endDate = dateRange?.endDate ?? Number.MAX_SAFE_INTEGER;
      return observeAccountPeriodMetrics(
        workplaceId,
        accountId,
        startDate,
        endDate,
        accountType,
        accountIds,
      ).pipe(
        map(metrics => {
          const netChange = metrics.totalIncrease - metrics.totalDecrease;
          const days = dateRange
            ? Math.max(
                1,
                Math.ceil((dateRange.endDate - dateRange.startDate) / AppConfig.time.msPerDay),
              )
            : null;
          return {
            ...metrics,
            netChange,
            dailyAverage: days === null ? null : netChange / days,
            isLoading: false,
          };
        }),
      );
    },
    [accountId, accountIds, dateRange?.startDate, dateRange?.endDate, accountType, workplaceId],
    { totalIncrease: 0, totalDecrease: 0, netChange: 0, dailyAverage: null, isLoading: true },
  );

  const periodMetrics = useMemo(
    () => ({
      ...periodMetricsResult,
      isLoading: metricsLoading || periodMetricsResult.isLoading,
    }),
    [periodMetricsResult, metricsLoading],
  );

  const { data: chartTransactions } = useObservable<RunningBalanceTx[]>(
    () => {
      const MS_PER_DAY = AppConfig.time.msPerDay;
      const start =
        (dateRange ? dateRange.startDate : dayjs().startOf('month').valueOf()) - 7 * MS_PER_DAY;
      const end =
        (dateRange ? dateRange.endDate : dayjs().endOf('month').valueOf()) + 7 * MS_PER_DAY;
      return observeAccountChartTransactions(workplaceId, accountId, start, end).pipe(
        map(transactions =>
          transactions.map(transaction => ({
            transactionDate: transaction.transactionDate,
            runningBalance: transaction.runningBalance,
          })),
        ),
      );
    },
    [workplaceId, accountId, dateRange?.startDate, dateRange?.endDate],
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
