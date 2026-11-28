import { AccountType } from '@/src/types/enums';
import { AccountBalance } from '@/src/types/domainReadModels';
import { AccountId, WorkplaceId } from '@/src/types/ids';

import { AppConfig } from '@/src/constants';
import { useCurrencyPrecision } from '@/src/hooks/use-currencies';
import { useExchangeRates } from '@/src/hooks/useExchangeRates';
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
import { isCategoryAccountType } from '@/src/domain/accounts/accountClassification';
import { DateRange, describePeriodRange } from '@/src/domain/calendar/dateRanges';
import { roundToPrecision } from '@/src/domain/money/money';
import dayjs from 'dayjs';
import { useMemo } from 'react';
import { combineLatest, map, of } from 'rxjs';
import type { PeriodMetrics, PreviousPeriodMetrics } from './types';

export type { PeriodMetrics, PreviousPeriodMetrics } from './types';

export interface UseAccountDetailsMetricsOptions {
  accountId: AccountId;
  workplaceId: WorkplaceId;
  accountType: AccountType;
  balanceCurrency: string;
  dateRange: DateRange | null;
  balanceData: AccountBalance | null;
  accountIds: AccountId[];
  accountCurrencies?: readonly { id: AccountId; currencyCode: string }[];
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
    accountCurrencies,
  } = options;

  const { precision } = useCurrencyPrecision(balanceCurrency);
  const { rateMap } = useExchangeRates(balanceCurrency);
  const today = useCalendarDay();
  // Balance hydration can replace account DTOs without changing this scope.
  const accountIdsKey = JSON.stringify(accountIds);
  const currencyKey = JSON.stringify(accountCurrencies);
  const ratesKey = JSON.stringify(rateMap);

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
          const netChange = roundToPrecision(
            metrics.totalIncrease - metrics.totalDecrease,
            precision,
          );
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
      accountIdsKey,
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
          netChange: roundToPrecision(metrics.totalIncrease - metrics.totalDecrease, precision),
        })),
      );
    },
    [
      accountId,
      accountIdsKey,
      dateRange?.startDate,
      dateRange?.endDate,
      accountType,
      workplaceId,
      precision,
      today,
    ],
    null,
  );

  const { data: chart } = useObservable<AccountRollingBalanceSeries>(
    () => {
      const MS_PER_DAY = AppConfig.time.msPerDay;
      const targetIds = accountIds.length > 0 ? accountIds : accountId ? [accountId] : [];
      const rebaseChart = isCategoryAccountType(accountType) && !!dateRange;
      const queryPadding = rebaseChart ? 0 : 7 * MS_PER_DAY;
      const start =
        (dateRange ? dateRange.startDate : dayjs(today).startOf('month').valueOf()) - queryPadding;
      const end =
        (dateRange ? dateRange.endDate : dayjs(today).endOf('month').valueOf()) + queryPadding;

      if (targetIds.length <= 1) {
        const targetId = targetIds[0] ?? null;
        const transactions = observeAccountChartTransactions(
          workplaceId,
          targetId,
          start,
          end,
        ).pipe(
          map(transactions =>
            transactions.map(transaction => ({
              transactionDate: transaction.transactionDate,
              runningBalance: transaction.runningBalance,
            })),
          ),
        );
        const opening =
          rebaseChart && dateRange
            ? observeAccountOpeningBalance(workplaceId, targetId, dateRange.startDate)
            : of(undefined);
        // Recreate both reads for each account/period; neither can reuse the other's previous value.
        return combineLatest([transactions, opening]).pipe(
          map(([transactions, openingBalance]) => {
            const window =
              dateRange && openingBalance !== undefined
                ? {
                    visibleStart: dateRange.startDate,
                    visibleEnd: dateRange.endDate,
                    openingBalance,
                  }
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
      }

      const currencies = new Map(
        accountCurrencies?.map(account => [account.id, account.currencyCode]),
      );
      const conversionByAccount = new Map<AccountId, number>();
      for (const id of targetIds) {
        const code = accountCurrencies ? currencies.get(id) : balanceCurrency;
        const rate = code ? rateMap[code] : undefined;
        if (!rate || !Number.isFinite(rate) || rate <= 0) {
          return of({ chartData: [], rollingAverageData: [], xTicks: [] });
        }
        conversionByAccount.set(id, 1 / rate);
      }

      const perAccountTransactions = combineLatest(
        targetIds.map(id => observeAccountChartTransactions(workplaceId, id, start, end)),
      );
      const perAccountOpening = combineLatest(
        targetIds.map(id =>
          observeAccountOpeningBalance(
            workplaceId,
            id,
            rebaseChart && dateRange ? dateRange.startDate : start,
          ),
        ),
      );

      return combineLatest([perAccountTransactions, perAccountOpening]).pipe(
        map(([groups, openingBalances]) => {
          const runningByAccount = new Map<AccountId, number>();
          targetIds.forEach((id, index) => {
            runningByAccount.set(
              id,
              (openingBalances[index] ?? 0) * (conversionByAccount.get(id) ?? 1),
            );
          });
          const merged = groups
            .flat()
            .sort(
              (a, b) =>
                a.transactionDate - b.transactionDate ||
                (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0) ||
                a.id.localeCompare(b.id),
            )
            .map(tx => {
              if (tx.runningBalance != null) {
                runningByAccount.set(
                  tx.accountId,
                  tx.runningBalance * (conversionByAccount.get(tx.accountId) ?? 1),
                );
              }
              let combined = 0;
              for (const val of runningByAccount.values()) combined += val;
              return {
                transactionDate: tx.transactionDate,
                runningBalance: roundToPrecision(combined, precision),
              };
            });
          const totalOpening = roundToPrecision(
            openingBalances.reduce(
              (sum, val, index) => sum + val * (conversionByAccount.get(targetIds[index]) ?? 1),
              0,
            ),
            precision,
          );
          if (!rebaseChart) {
            merged.unshift({ transactionDate: start, runningBalance: totalOpening });
          }
          const window =
            dateRange && rebaseChart
              ? {
                  visibleStart: dateRange.startDate,
                  visibleEnd: dateRange.endDate,
                  openingBalance: totalOpening,
                }
              : {
                  visibleStart: dateRange?.startDate ?? start,
                  visibleEnd: dateRange?.endDate ?? end,
                };
          return buildAccountRollingBalanceSeries({
            transactions: merged,
            ...window,
            paddingDays: dateRange ? 0 : undefined,
            dataEnd: dayjs(today).endOf('day').valueOf(),
            msPerDay: MS_PER_DAY,
          });
        }),
      );
    },
    [
      workplaceId,
      accountId,
      accountIdsKey,
      currencyKey,
      ratesKey,
      balanceCurrency,
      accountType,
      dateRange?.startDate,
      dateRange?.endDate,
      precision,
      today,
    ],
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
