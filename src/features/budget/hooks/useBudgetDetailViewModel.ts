import { AppConfig } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import Budget from '@/src/data/models/Budget';
import { useCurrencyPrecision } from '@/src/hooks/use-currencies';
import { useExchangeRates } from '@/src/hooks/useExchangeRates';
import { useObservable } from '@/src/hooks/useObservable';
import { usePrivacyPrefs } from '@/src/hooks/usePrivacyPrefs';
import { useTransactionGrouping } from '@/src/hooks/useTransactionGrouping';
import { amountInBaseCurrency, buildDayNetStats } from '@/src/services/ledger';
import { mapAccountLedgerTransactionToListItem } from '@/src/services/ledger/accountLedgerListItems';
import { BudgetPeriodUtils } from '@/src/services/budget/BudgetPeriodUtils';
import { budgetReadService } from '@/src/services/budget/budgetReadService';
import { budgetWriteService } from '@/src/services/budget/budgetWriteService';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { buildBudgetCumulativeSeries } from '@/src/services/projections';
import { BudgetId, DisplayTransaction, PlainBudget } from '@/src/types/domain';
import { confirm } from '@/src/utils/alerts';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import dayjs from 'dayjs';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { combineLatest, of, switchMap } from 'rxjs';

export function useBudgetDetailViewModel() {
  const { workplaceId, defaultCurrencyCode: workplaceCurrency } = useWorkplace();
  const { isPrivacyMode } = usePrivacyPrefs();
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
    return budgetReadService.observeById(workplaceId, budgetId).pipe(
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

  const budget: Budget | PlainBudget | null = useMemo(() => {
    if (dbBudgetData) return dbBudgetData[0];
    if (pName) {
      return {
        id: budgetId,
        name: pName,
        amount: pAmount ? parseFloat(pAmount) : 0,
        currencyCode: pCurrency || baseCurrency,
        intervalType: pPeriod || 'MONTHLY',
        periodType: pPeriod || 'MONTHLY',
        intervalN: 1,
        startDate: undefined,
        recurrenceDay: undefined,
        recurrenceMonth: undefined,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }
    return null;
  }, [dbBudgetData, pName, pAmount, pCurrency, pPeriod, budgetId, baseCurrency]);

  const usage = useMemo(() => {
    if (dbBudgetData) return dbBudgetData[1];
    if (pName) {
      const target = pAmount ? parseFloat(pAmount) : 0;
      return {
        spent: 0,
        remaining: target,
        budgetAmount: target,
        usagePercent: 0,
      };
    }
    return null;
  }, [dbBudgetData, pName, pAmount]);

  const transactions = useMemo(() => (dbBudgetData ? dbBudgetData[2] : []), [dbBudgetData]);

  const isLoading = dbLoading && !pName;

  const transactionGroupingOptions = useMemo(
    () => ({
      items: transactions,
      getDate: (t: DisplayTransaction) => t.transactionDate,
      sortByDate: 'desc' as const,
      getStats: (txsForDay: DisplayTransaction[]) =>
        buildDayNetStats(txsForDay, baseCurrency, precision, tx => {
          const amount = amountInBaseCurrency(tx.amount, tx.currencyCode, baseCurrency, ratesMap);
          // Budget view: debits increase spent net, credits decrease.
          if (tx.transactionType === 'DEBIT') return amount;
          if (tx.transactionType === 'CREDIT') return -amount;
          return 0;
        }),
      renderItem: (tx: DisplayTransaction) =>
        mapAccountLedgerTransactionToListItem(tx, () => handleJournalPress(tx.journalId)),
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

    const { startDate, endDate } = BudgetPeriodUtils.getCurrentPeriod(budget, refTimestamp);
    return buildBudgetCumulativeSeries({
      transactions,
      periodStart: startDate,
      periodEnd: endDate,
      baseCurrency,
      rateMap: ratesMap,
      precision,
    });
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
          if (budget && 'destroyPermanently' in budget) {
            await budgetWriteService.deleteBudget(workplaceId, budget);
            AppNavigation.back();
          } else {
            logger.warn('Cannot delete preview/mock budget');
          }
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
    isPrivacyMode,
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
