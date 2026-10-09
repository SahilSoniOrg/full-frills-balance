import { AccountType } from '@/src/types/enums';
import { AccountBalance } from '@/src/types/domainReadModels';
import { AccountId, WorkplaceId } from '@/src/types/ids';

import { AppConfig } from '@/src/constants';
import { useCurrencyPrecision } from '@/src/hooks/use-currencies';
import { useObservable } from '@/src/hooks/useObservable';
import { useCalendarDay } from '@/src/hooks/useCalendarDay';
import {
  observeAccountChartTransactions,
  observeAccountOpeningBalance,
  observeAccountPeriodMetrics,
} from '@/src/services/accounts/accountDerivedReads';
import { previousComparableRange } from '@/src/features/accounts/helpers/accountPeriodPresentation';
import {
  buildAccountRollingBalanceSeries,
  type AccountRollingBalanceSeries,
} from '@/src/services/projections';
import { isCategoryAccountType } from '@/src/utils/accountCategory';
import { DateRange, describePeriodRange } from '@/src/utils/dateUtils';
import dayjs from 'dayjs';
import { useMemo } from 'react';
import { combineLatest, map, of } from 'rxjs';

export interface PeriodMetrics {
  totalIncrease: number;
  totalDecrease: number;
  netChange: number;
  dailyAverage: number | null;
  isLoading: boolean;
}

export interface PreviousPeriodMetrics {
  label: string;
  netChange: number;
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
  const today = useCalendarDay();

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
          const period = dateRange ? describePeriodRange(dateRange, today) : null;
          // A running period averages over the days so far; others over their full length.
          const days = period && (period.isCurrent ? period.elapsedDays : period.periodDays);
          return {
            ...metrics,
            netChange,
            dailyAverage: days ? netChange / days : null,
            isLoading: false,
          };
        }),
      );
    },
    [
      accountId,
      accountIds,
      dateRange?.startDate,
      dateRange?.endDate,
      accountType,
      workplaceId,
      today,
    ],
    { totalIncrease: 0, totalDecrease: 0, netChange: 0, dailyAverage: null, isLoading: true },
  );

  const periodMetrics = useMemo(
    () => ({
      ...periodMetricsResult,
      isLoading: metricsLoading || periodMetricsResult.isLoading,
    }),
    [periodMetricsResult, metricsLoading],
  );

  const { data: previousPeriod } = useObservable<PreviousPeriodMetrics | null>(
    () => {
      const previousRange = previousComparableRange(dateRange, today);
      if (!accountId || !accountType || !previousRange) return of(null);
      return observeAccountPeriodMetrics(
        workplaceId,
        accountId,
        previousRange.startDate,
        previousRange.endDate,
        accountType,
        accountIds,
      ).pipe(
        map(metrics => ({
          label: previousRange.label,
          netChange: metrics.totalIncrease - metrics.totalDecrease,
        })),
      );
    },
    [
      accountId,
      accountIds,
      dateRange?.startDate,
      dateRange?.endDate,
      accountType,
      workplaceId,
      today,
    ],
    null,
  );

  const { data: chart } = useObservable<AccountRollingBalanceSeries>(
    () => {
      const MS_PER_DAY = AppConfig.time.msPerDay;
      const rebaseChart = isCategoryAccountType(accountType) && !!dateRange;
      const queryPadding = rebaseChart ? 0 : 7 * MS_PER_DAY;
      const start =
        (dateRange ? dateRange.startDate : dayjs(today).startOf('month').valueOf()) - queryPadding;
      const end =
        (dateRange ? dateRange.endDate : dayjs(today).endOf('month').valueOf()) + queryPadding;
      const transactions = observeAccountChartTransactions(workplaceId, accountId, start, end).pipe(
        map(transactions =>
          transactions.map(transaction => ({
            transactionDate: transaction.transactionDate,
            runningBalance: transaction.runningBalance,
          })),
        ),
      );
      const opening =
        rebaseChart && dateRange
          ? observeAccountOpeningBalance(workplaceId, accountId, dateRange.startDate)
          : of(undefined);
      // Recreate both reads for each account/period; neither can reuse the other's previous value.
      return combineLatest([transactions, opening]).pipe(
        map(([transactions, openingBalance]) => {
          const window =
            dateRange && openingBalance !== undefined
              ? { visibleStart: dateRange.startDate, visibleEnd: dateRange.endDate, openingBalance }
              : { visibleStart: dateRange?.startDate, visibleEnd: dateRange?.endDate };
          return buildAccountRollingBalanceSeries({
            transactions,
            ...window,
            paddingDays: dateRange ? 0 : undefined,
            dataEnd: dayjs(today).endOf('day').valueOf(),
            msPerDay: MS_PER_DAY,
          });
        }),
      );
    },
    [workplaceId, accountId, accountType, dateRange?.startDate, dateRange?.endDate, today],
    { chartData: [], rollingAverageData: [], xTicks: [] },
    { keepPreviousData: false },
  );

  return {
    precision,
    secondaryBalances,
    periodMetrics,
    previousPeriod: previousPeriod ?? null,
    ...chart,
  };
}
