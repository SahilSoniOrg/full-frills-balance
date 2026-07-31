import { AppConfig } from '@/src/constants';
import Transaction from '@/src/data/models/Transaction';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { useCurrencyPrecision } from '@/src/hooks/use-currencies';
import { useObservable } from '@/src/hooks/useObservable';
import { buildAccountRollingBalanceSeries } from '@/src/services/projections';
import { AccountBalance, AccountId, WorkplaceId } from '@/src/types/domain';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { DateRange } from '@/src/utils/dateUtils';
import { Q } from '@nozbe/watermelondb';
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
  accountType: string;
  isAssetOrExpense: boolean;
  balanceCurrency: string;
  dateRange: DateRange | null;
  balanceData: AccountBalance | null;
}

export function useAccountDetailsMetrics(options: UseAccountDetailsMetricsOptions) {
  const {
    accountId,
    workplaceId,
    accountType,
    isAssetOrExpense,
    balanceCurrency,
    dateRange,
    balanceData,
  } = options;

  const { precision } = useCurrencyPrecision(balanceCurrency);

  const secondaryBalances = useMemo(() => {
    if (!balanceData?.childBalances) return [];
    return balanceData.childBalances.map((cb: { currencyCode: string; balance: number }) => ({
      currencyCode: cb.currencyCode,
      amountText: CurrencyFormatter.format(cb.balance, cb.currencyCode),
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
      return transactionRawRepository
        .observeAccountPeriodMetricsRaw(
          workplaceId,
          accountId,
          dateRange.startDate,
          dateRange.endDate,
          isAssetOrExpense,
        )
        .pipe(
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
    [accountId, dateRange, accountType, isAssetOrExpense, workplaceId],
    { totalIncrease: 0, totalDecrease: 0, netChange: 0, dailyAverage: null, isLoading: true },
  );

  const periodMetrics = useMemo(
    () => ({
      ...periodMetricsResult,
      isLoading: metricsLoading || periodMetricsResult.isLoading,
    }),
    [periodMetricsResult, metricsLoading],
  );

  const periodMetricsFormatted = useMemo(
    () => ({
      totalIncreaseText: CurrencyFormatter.format(periodMetrics.totalIncrease, balanceCurrency),
      totalDecreaseText: CurrencyFormatter.format(periodMetrics.totalDecrease, balanceCurrency),
      netChangeText: CurrencyFormatter.format(periodMetrics.netChange, balanceCurrency),
      dailyAverageText:
        periodMetrics.dailyAverage !== null
          ? CurrencyFormatter.format(periodMetrics.dailyAverage, balanceCurrency)
          : null,
      isLoading: periodMetrics.isLoading,
    }),
    [periodMetrics, balanceCurrency],
  );

  const { data: chartTransactions } = useObservable<Transaction[]>(
    () => {
      if (!accountId) return of([]);
      const MS_PER_DAY = AppConfig.time.msPerDay;
      const start =
        (dateRange ? dateRange.startDate : dayjs().startOf('month').valueOf()) - 7 * MS_PER_DAY;
      const end =
        (dateRange ? dateRange.endDate : dayjs().endOf('month').valueOf()) + 7 * MS_PER_DAY;
      return transactionRepository
        .transactionsQuery(
          Q.where('workplace_id', workplaceId),
          Q.where('account_id', accountId),
          Q.where('deleted_at', Q.eq(null)),
          Q.where('transaction_date', Q.gte(start)),
          Q.where('transaction_date', Q.lte(end)),
          Q.sortBy('transaction_date', Q.asc),
        )
        .observeWithColumns(['running_balance', 'transaction_date']);
    },
    [workplaceId, accountId, dateRange],
    [],
  );

  const { chartData, rollingAverageData, xTicks } = useMemo(
    () =>
      buildAccountRollingBalanceSeries({
        transactions: chartTransactions ?? [],
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
    periodMetricsFormatted,
    chartData,
    rollingAverageData,
    xTicks,
  };
}
