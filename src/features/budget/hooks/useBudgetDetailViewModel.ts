import { AppConfig } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import Budget from '@/src/data/models/Budget';
import {
  buildBudgetDetailPreview,
  buildBudgetUsagePreview,
} from '@/src/features/budget/helpers/budgetDetailPresentation';
import { journalsToBudgetChartTxs } from '@/src/features/budget/helpers/journalsToBudgetChartTxs';
import { useJournalEntryList } from '@/src/features/journal';
import { useCurrencyPrecision } from '@/src/hooks/use-currencies';
import { useExchangeRates } from '@/src/hooks/useExchangeRates';
import { useObservable } from '@/src/hooks/useObservable';
import { analytics } from '@/src/services/analytics-service';
import { BudgetPeriodUtils } from '@/src/services/budget/BudgetPeriodUtils';
import { budgetReadService, BudgetUsage } from '@/src/services/budget/budgetReadService';
import { budgetWriteService } from '@/src/services/budget/budgetWriteService';
import { buildBudgetCumulativeSeries } from '@/src/services/projections';
import { AccountId, BudgetId, PlainBudget } from '@/src/types/domain';
import { confirm } from '@/src/utils/alerts';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import dayjs from 'dayjs';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { combineLatest, of, switchMap } from 'rxjs';
import { JournalListItem } from '@/src/types/ui';

export interface BudgetDetailViewModel {
  budget: Budget | PlainBudget | null;
  usage: BudgetUsage | null;
  items: JournalListItem[];
  isLoading: boolean;
  targetMonth: string;
  nextMonth: () => void;
  prevMonth: () => void;
  resetToToday: () => void;
  isCurrentMonth: boolean;
  chartData: { data: { x: number; y: number }[]; domainX: [number, number] } | null;
  periodLabel: string;
  handleDelete: () => void;
  handleEdit: () => void;
}

export function useBudgetDetailViewModel(): BudgetDetailViewModel {
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
  const baseCurrency = workplaceCurrency;

  const { rateMap: ratesMap = {} } = useExchangeRates(baseCurrency);
  const { precision } = useCurrencyPrecision(baseCurrency);

  const budgetData$ = useMemo(() => {
    return budgetReadService.observeById(workplaceId, budgetId).pipe(
      switchMap(budget => {
        if (!budget) return of(null);
        return combineLatest([
          of(budget),
          budgetReadService.observeBudgetUsage(workplaceId, budget, refTimestamp),
        ]);
      }),
    );
  }, [workplaceId, budgetId, refTimestamp]);

  const { data: dbBudgetData, isLoading: dbLoading } = useObservable(
    () => budgetData$,
    [workplaceId, budgetId, refTimestamp],
    null,
  );

  const { data: scopeRecords = [] } = useObservable(
    () => (budgetId ? budgetReadService.observeScopes(workplaceId, budgetId) : of([])),
    [workplaceId, budgetId],
    [],
  );

  const pName = params.pName as string;
  const pAmount = params.pAmount as string;
  const pCurrency = params.pCurrency as string;
  const pPeriod = params.pPeriod as string;

  const previewInput = useMemo(
    () => ({
      budgetId,
      name: pName,
      amount: pAmount,
      currency: pCurrency,
      period: pPeriod,
      baseCurrency,
    }),
    [baseCurrency, budgetId, pAmount, pCurrency, pName, pPeriod],
  );

  const budget: Budget | PlainBudget | null = dbBudgetData
    ? dbBudgetData[0]
    : buildBudgetDetailPreview(previewInput);

  const usage = dbBudgetData ? dbBudgetData[1] : buildBudgetUsagePreview(previewInput);

  const isLoading = dbLoading && !pName;

  const scopeAccountIds = useMemo(
    () => scopeRecords.map(scope => scope.account.id as AccountId),
    [scopeRecords],
  );

  const budgetDateRange = useMemo(() => {
    if (!budget) return undefined;
    const { startDate, endDate } = BudgetPeriodUtils.getCurrentPeriod(budget, refTimestamp);
    return { startDate, endDate };
  }, [budget, refTimestamp]);

  const journalList = useJournalEntryList({
    workplaceId,
    pageSize: AppConfig.pagination.budgetDetailsTransactionsPageSize,
    dateRange: budgetDateRange,
    queryOptions: { accountIds: scopeAccountIds },
    expandScopedLegs: scopeAccountIds.length > 0 ? scopeAccountIds : undefined,
    paginationPolicy: 'always',
  });

  const chartData = useMemo(() => {
    if (!budget) return null;

    const { startDate, endDate } = BudgetPeriodUtils.getCurrentPeriod(budget, refTimestamp);
    const chartTransactions = journalsToBudgetChartTxs(journalList.journals, scopeAccountIds);

    return buildBudgetCumulativeSeries({
      transactions: chartTransactions,
      periodStart: startDate,
      periodEnd: endDate,
      baseCurrency,
      rateMap: ratesMap,
      precision,
    });
  }, [
    journalList.journals,
    refTimestamp,
    budget,
    baseCurrency,
    ratesMap,
    precision,
    scopeAccountIds,
  ]);

  const nextMonth = useCallback(() => {
    if (!budget) return;
    const { startDate: nowStart } = BudgetPeriodUtils.getCurrentPeriod(budget);
    const { startDate: refStart } = BudgetPeriodUtils.getCurrentPeriod(budget, refTimestamp);
    if (nowStart === refStart) return;

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
            analytics.trackFeatureUsage('budget', 'delete', {
              budget_id: budget.id,
              currency: budget.currencyCode,
            });
            AppNavigation.back();
          } else {
            logger.warn('Cannot delete preview/mock budget');
          }
        } catch (error: unknown) {
          logger.error(
            'Failed to delete budget',
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      },
    });
  }, [budget, workplaceId]);

  const handleEdit = useCallback(() => {
    if (!budget) return;
    AppNavigation.toBudgetForm(budget.id, {
      name: budget.name,
      amount: budget.amount,
      currency: budget.currencyCode,
    });
  }, [budget]);

  return {
    budget,
    usage,
    items: journalList.items,
    isLoading: isLoading || journalList.isLoading,
    targetMonth: dayjs(refTimestamp).format('YYYY-MM'),
    nextMonth,
    prevMonth,
    resetToToday,
    isCurrentMonth,
    chartData,
    periodLabel: budget ? BudgetPeriodUtils.getPeriodLabel(budget, refTimestamp) : '',
    handleDelete,
    handleEdit,
  };
}
