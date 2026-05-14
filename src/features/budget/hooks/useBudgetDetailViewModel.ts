import { TransactionBadge } from '@/src/components/common/TransactionCard';
import { IconName } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { useCurrencyPrecision } from '@/src/hooks/use-currencies';
import { useExchangeRates } from '@/src/hooks/useExchangeRates';
import { useObservable } from '@/src/hooks/useObservable';
import { useTransactionGrouping } from '@/src/hooks/useTransactionGrouping';
import { BudgetPeriodUtils } from '@/src/services/budget/BudgetPeriodUtils';
import { budgetReadService } from '@/src/services/budget/budgetReadService';
import { budgetWriteService } from '@/src/services/budget/budgetWriteService';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { BudgetId, DisplayTransaction, JournalDisplayType } from '@/src/types/domain';
import { getAccountTypeVariant } from '@/src/utils/accountCategory';
import { confirm } from '@/src/utils/alerts';
import { journalPresenter } from '@/src/utils/journalPresenter';
import { logger } from '@/src/utils/logger';
import { safeAdd, safeSubtract } from '@/src/utils/money';
import { AppNavigation } from '@/src/utils/navigation';
import dayjs from 'dayjs';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { combineLatest, of, switchMap } from 'rxjs';

export function useBudgetDetailViewModel() {
  const { workplaceId, defaultCurrencyCode: workplaceCurrency } = useWorkplace();
  const params = useLocalSearchParams<{
    id: BudgetId;
    pName?: string;
    pAmount?: string;
    pCurrency?: string;
    pPeriod?: string;
  }>();
  const budgetId = params.id;

  const [refTimestamp, setRefTimestamp] = useState(() => Date.now());
  const missingCurrenciesCache = useRef(new Set<string>());
  const baseCurrency = workplaceCurrency;

  const { rateMap: ratesMap = {} } = useExchangeRates(baseCurrency);
  const { precision } = useCurrencyPrecision(baseCurrency);

  const handleJournalPress = useCallback((journalId?: string) => {
    if (!journalId) return;
    AppNavigation.toTransactionDetails(journalId);
  }, []);

  const budgetData$ = useMemo(() => {
    return budgetRepository.observeById(workplaceId, budgetId).pipe(
      switchMap(budget => {
        if (!budget) return of(null);
        return combineLatest([
          of(budget),
          budgetReadService.observeBudgetUsage(workplaceId, budget, refTimestamp),
          budgetReadService.observeBudgetDisplayTransactions(workplaceId, budget, refTimestamp),
        ]);
      }),
    );
  }, [workplaceId, budgetId, refTimestamp]);

  const { data: dbBudgetData, isLoading: dbLoading } = useObservable(
    () => budgetData$,
    [workplaceId, budgetId, refTimestamp],
    null,
  );

  // Initial Data Injection: Extract preview data from params
  const pName = params.pName as string;
  const pAmount = params.pAmount as string;
  const pCurrency = params.pCurrency as string;
  const pPeriod = params.pPeriod as string;

  const budget = useMemo(() => {
    if (dbBudgetData) return dbBudgetData[0];
    if (pName) {
      return {
        id: budgetId,
        name: pName,
        targetAmount: pAmount ? parseFloat(pAmount) : 0,
        currencyCode: pCurrency || baseCurrency,
        periodType: pPeriod || 'MONTHLY',
      } as any;
    }
    return null;
  }, [dbBudgetData, pName, pAmount, pCurrency, pPeriod, budgetId, baseCurrency]);

  const usage = useMemo(() => {
    if (dbBudgetData) return dbBudgetData[1];
    if (pName) {
      return {
        budgetId,
        spentAmount: 0,
        targetAmount: pAmount ? parseFloat(pAmount) : 0,
        percentage: 0,
        isOverBudget: false,
        currencyCode: pCurrency || baseCurrency,
      } as any;
    }
    return null;
  }, [dbBudgetData, pName, pAmount, pCurrency, budgetId, baseCurrency]);

  const transactions = useMemo(() => (dbBudgetData ? dbBudgetData[2] : []), [dbBudgetData]);

  const isLoading = dbLoading && !pName;

  const transactionGroupingOptions = useMemo(
    () => ({
      items: transactions,
      getDate: (t: DisplayTransaction) => t.transactionDate,
      sortByDate: 'desc' as const,
      getStats: (txsForDay: DisplayTransaction[]) => {
        let netAmount = 0;

        txsForDay.forEach(tx => {
          let amount = 0;
          if (tx.currencyCode === baseCurrency) {
            amount = tx.amount;
          } else {
            const rate = ratesMap[tx.currencyCode];
            if (rate && rate > 0) {
              amount = tx.amount / rate;
            }
          }

          // In budget view, we sum everything flowing in/out of the scoped expenses.
          if (tx.transactionType === 'DEBIT') {
            netAmount = safeAdd(netAmount, amount, precision);
          } else if (tx.transactionType === 'CREDIT') {
            netAmount = safeSubtract(netAmount, amount, precision);
          }
        });

        return {
          count: txsForDay.length,
          netAmount,
          currencyCode: baseCurrency,
        };
      },
      renderItem: (tx: DisplayTransaction) => {
        const displayType = tx.displayType as JournalDisplayType;
        const presentation = journalPresenter.getPresentation(
          displayType,
          tx.journalDescription || '',
        );

        let typeIcon: IconName = 'document';
        let amountPrefix = '';

        if (tx.transactionType === 'DEBIT') {
          typeIcon = 'arrowUp';
          amountPrefix = '+ ';
        } else if (tx.transactionType === 'CREDIT') {
          typeIcon = 'arrowDown';
          amountPrefix = '− ';
        }

        const badges: TransactionBadge[] = [
          {
            text: tx.accountName || AppConfig.strings.journal.transaction,
            variant: getAccountTypeVariant(tx.accountType as any),
            icon: (tx.icon as IconName) || 'tag',
          },
        ];

        return {
          id: tx.id,
          type: 'transaction' as const,
          date: tx.transactionDate,
          onPress: () => handleJournalPress(tx.journalId),
          cardProps: {
            title:
              tx.displayTitle || tx.journalDescription || AppConfig.strings.journal.transaction,
            amount: tx.amount,
            currencyCode: tx.currencyCode,
            transactionDate: tx.transactionDate,
            presentation: {
              label: presentation.label,
              typeColor: tx.transactionType === 'DEBIT' ? 'warning' : 'success',
              typeIcon,
              amountPrefix,
            },
            badges,
            notes: tx.notes,
          },
        };
      },
    }),
    [transactions, baseCurrency, ratesMap, handleJournalPress, precision],
  );

  const { groupedItems: items } = useTransactionGrouping(transactionGroupingOptions);

  useEffect(() => {
    const toFetch = new Set<string>();
    transactions.forEach((tx: DisplayTransaction) => {
      if (tx.currencyCode !== baseCurrency) {
        const rate = ratesMap[tx.currencyCode];
        if (!rate || rate <= 0) {
          if (!missingCurrenciesCache.current.has(tx.currencyCode)) {
            toFetch.add(tx.currencyCode);
            missingCurrenciesCache.current.add(tx.currencyCode);
          }
        }
      }
    });

    toFetch.forEach(currencyCode => {
      exchangeRateService
        .getRate(baseCurrency, currencyCode)
        .catch(e =>
          logger.error(`Failed to dynamically fetch rate for missing currency ${currencyCode}`, e),
        );
    });
  }, [transactions, baseCurrency, ratesMap]);

  const chartData = useMemo(() => {
    if (!budget) return null;

    const sortedTxs = [...transactions].sort((a, b) => a.transactionDate - b.transactionDate);
    const data: { x: number; y: number }[] = [];
    let cumulativeSpent = 0;

    const { startDate, endDate } = BudgetPeriodUtils.getCurrentPeriod(budget, refTimestamp);
    const startOfCycle = dayjs(startDate);
    const endOfCycle = dayjs(endDate);
    const daysInCycle = endOfCycle.diff(startOfCycle, 'day') + 1;

    let txIndex = 0;

    for (let d = 0; d < daysInCycle; d++) {
      const currentDay = startOfCycle.add(d, 'day');
      const dayStart = currentDay.startOf('day').valueOf();
      const dayEnd = currentDay.endOf('day').valueOf();

      // Add anchor point at start of day
      data.push({ x: dayStart, y: cumulativeSpent });

      // Process all transactions that occurred on this day
      while (
        txIndex < sortedTxs.length &&
        dayjs(sortedTxs[txIndex].transactionDate).isSame(currentDay, 'day')
      ) {
        const tx = sortedTxs[txIndex];
        let amount = 0;
        if (tx.currencyCode === baseCurrency) {
          amount = tx.amount;
        } else {
          const rate = ratesMap[tx.currencyCode];
          if (rate && rate > 0) {
            amount = tx.amount / rate;
          }
        }

        // Step function: point before transaction
        data.push({ x: tx.transactionDate, y: cumulativeSpent });

        if (tx.transactionType === 'DEBIT') {
          cumulativeSpent = safeAdd(cumulativeSpent, amount, precision);
        } else if (tx.transactionType === 'CREDIT') {
          cumulativeSpent = safeSubtract(cumulativeSpent, amount, precision);
        }

        // Step function: point after transaction
        data.push({ x: tx.transactionDate, y: cumulativeSpent });
        txIndex++;
      }

      // Add anchor point at end of day
      data.push({ x: dayEnd, y: cumulativeSpent });
    }

    // If no data points were added (e.g. start of month with no transactions yet), add start point
    if (data.length === 0) {
      data.push({ x: startDate, y: 0 });
    }

    return {
      data,
      domainX: [startDate, endDate] as [number, number],
    };
  }, [transactions, refTimestamp, budget, baseCurrency, ratesMap, precision]);

  const nextMonth = useCallback(() => {
    if (!budget) return;
    const { endDate } = BudgetPeriodUtils.getCurrentPeriod(budget, refTimestamp);
    setRefTimestamp(endDate + 1);
  }, [budget, refTimestamp]);

  const prevMonth = useCallback(() => {
    if (!budget) return;
    const { startDate } = BudgetPeriodUtils.getCurrentPeriod(budget, refTimestamp);
    setRefTimestamp(startDate - 1);
  }, [budget, refTimestamp]);

  const resetToToday = useCallback(() => {
    setRefTimestamp(Date.now());
  }, []);

  const isCurrentMonth = useMemo(() => {
    if (!budget) return true;
    const { startDate } = BudgetPeriodUtils.getCurrentPeriod(budget);
    const { startDate: currentRefStart } = BudgetPeriodUtils.getCurrentPeriod(budget, refTimestamp);
    return startDate === currentRefStart;
  }, [budget, refTimestamp]);

  const handleDelete = useCallback(() => {
    if (!budget) return;
    confirm.show({
      title: AppConfig.strings.budget.details.deleteTitle,
      message: AppConfig.strings.budget.details.deleteConfirm,
      confirmText: AppConfig.strings.common.delete,
      destructive: true,
      onConfirm: async () => {
        try {
          await budgetWriteService.deleteBudget(workplaceId, budget);
          AppNavigation.back();
        } catch (e: any) {
          logger.error('Failed to delete budget', e);
        }
      },
    });
  }, [budget, workplaceId]);

  return {
    budget,
    usage,
    items,
    isLoading,
    targetMonth: dayjs(refTimestamp).format('YYYY-MM'),
    nextMonth,
    prevMonth,
    resetToToday,
    isCurrentMonth,
    chartData,
    periodLabel: budget ? BudgetPeriodUtils.getPeriodLabel(budget, refTimestamp) : '',
    handleDelete,
  };
}
