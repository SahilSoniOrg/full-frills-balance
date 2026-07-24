import { AppConfig } from '@/src/constants';
import Transaction from '@/src/data/models/Transaction';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { useCurrencyPrecision } from '@/src/hooks/use-currencies';
import { useObservable } from '@/src/hooks/useObservable';
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

  const { chartData, rollingAverageData, xTicks } = useMemo(() => {
    if (!chartTransactions || !chartTransactions.length)
      return { chartData: [], rollingAverageData: [], xTicks: [] };

    const firstWithBalance = chartTransactions.find(
      t => t.runningBalance !== undefined && t.runningBalance !== null,
    );
    const pts = chartTransactions.reduce(
      (acc, t: Transaction) => {
        const lastBal =
          acc.length > 0 ? acc[acc.length - 1].y : firstWithBalance?.runningBalance || 0;
        const y =
          t.runningBalance !== undefined && t.runningBalance !== null ? t.runningBalance : lastBal;
        acc.push({ x: t.transactionDate, y });
        return acc;
      },
      [] as { x: number; y: number }[],
    );

    const MS_PER_DAY = AppConfig.time.msPerDay;
    const visibleStart = dateRange ? dateRange.startDate : pts[0].x;
    const visibleEnd = dateRange ? dateRange.endDate : pts[pts.length - 1].x;
    const effectiveMaxX = visibleEnd + 7 * MS_PER_DAY;

    const ticks: number[] = [];
    const numTicks = 4;
    const range = effectiveMaxX - visibleStart;
    const step = range / (numTicks - 1);
    for (let i = 0; i < numTicks; i++) ticks.push(visibleStart + step * i);

    const dailyBalances: { x: number; y: number }[] = [];
    let currentDayStart = new Date(pts[0].x).setHours(0, 0, 0, 0);
    const lastDayEnd = new Date(effectiveMaxX).setHours(23, 59, 59, 999);
    let lb = pts[0].y;
    let pi = 0;
    while (currentDayStart <= lastDayEnd) {
      const nds = currentDayStart + MS_PER_DAY;
      while (pi < pts.length && pts[pi].x < nds) {
        lb = pts[pi].y;
        pi++;
      }
      dailyBalances.push({ x: currentDayStart, y: lb });
      currentDayStart = nds;
    }

    const fullRolling = dailyBalances.map((db, i) => {
      let sum = 0;
      let count = 0;
      for (let j = 0; j < 7; j++) {
        if (i - j >= 0) {
          sum += dailyBalances[i - j].y;
          count++;
        }
      }
      return { x: db.x, y: count > 0 ? sum / count : 0 };
    });

    return {
      chartData: dailyBalances.filter(p => p.x >= visibleStart && p.x <= effectiveMaxX),
      rollingAverageData: fullRolling.filter(p => p.x >= visibleStart && p.x <= effectiveMaxX),
      xTicks: ticks,
    };
  }, [chartTransactions, dateRange]);

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
