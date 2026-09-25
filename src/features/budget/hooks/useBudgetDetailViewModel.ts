import { AppConfig } from '@/src/constants';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import {
  buildBudgetDetailPreview,
  buildBudgetUsagePreview,
} from '@/src/features/budget/helpers/budgetDetailPresentation';
import { resolveLeafExpenseAccountIds } from '@/src/services/budget/budgetCalculationHelpers';
import {
  buildBudgetCumulativeChart,
  type BudgetCumulativeChart,
} from '@/src/services/budget/budgetCumulativeChartService';
import {
  useJournalEntryList,
  useJournalsBulkOperations,
  type JournalListModalsProps,
} from '@/src/features/journal';
import type { ListSelectionChrome } from '@/src/components/shared/SelectionActionBar';
import { useObservable, useObservableWithEnrichment } from '@/src/hooks/useObservable';
import { accountQueries } from '@/src/services/accounts/accountQueries';
import { analytics } from '@/src/services/analytics';
import { BudgetPeriodUtils } from '@/src/services/budget/BudgetPeriodUtils';
import { budgetReadService } from '@/src/services/budget/budgetReadService';
import { BudgetUsage } from '@/src/services/budget/types';
import { budgetWriteService } from '@/src/services/budget/budgetWriteService';
import { AccountType } from '@/src/types/enums';
import { BudgetId, JournalId } from '@/src/types/ids';
import { PlainBudget } from '@/src/types/plainDtos';
import { confirm } from '@/src/utils/alerts';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import dayjs from 'dayjs';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { combineLatest, of, switchMap } from 'rxjs';
import { JournalListItem } from '@/src/types/ui';

export interface BudgetDetailViewModel {
  budget: PlainBudget | null;
  usage: BudgetUsage | null;
  items: JournalListItem[];
  isLoading: boolean;
  targetMonth: string;
  nextMonth: () => void;
  prevMonth: () => void;
  resetToToday: () => void;
  isCurrentMonth: boolean;
  chartData: BudgetCumulativeChart | null;
  periodLabel: string;
  handleDelete: () => void;
  handleEdit: () => void;
  selectedIds: Set<JournalId>;
  isSelectionModeActive: boolean;
  onLongPressItem: (id: JournalId) => void;
  selectionChrome: ListSelectionChrome;
  modals?: JournalListModalsProps;
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

  const budgetData$ = useMemo(() => {
    return budgetReadService.observeById(workplaceId, budgetId).pipe(
      switchMap(budget => {
        if (!budget) return of(null);
        return combineLatest([
          of(budget),
          budgetReadService.observeBudgetUsage(workplaceId, budget.id, refTimestamp),
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

  const budget: PlainBudget | null = dbBudgetData
    ? dbBudgetData[0]
    : buildBudgetDetailPreview(previewInput);

  const usage = dbBudgetData ? dbBudgetData[1] : buildBudgetUsagePreview(previewInput);

  const isLoading = dbLoading && !pName;

  const scopeAccountIds = useMemo(() => scopeRecords.map(scope => scope.accountId), [scopeRecords]);

  const { data: scopeAccounts = [] } = useObservable(
    () => accountQueries.observeByIds(workplaceId, scopeAccountIds),
    [workplaceId, scopeAccountIds],
    [],
  );
  const { data: expenseAccounts = [] } = useObservable(
    () => accountQueries.observeByType(workplaceId, AccountType.EXPENSE),
    [workplaceId],
    [],
  );

  const chartAccountIds = useMemo(
    () => Array.from(resolveLeafExpenseAccountIds(scopeAccounts, expenseAccounts, workplaceId)),
    [scopeAccounts, expenseAccounts, workplaceId],
  );

  const budgetDateRange = useMemo(() => {
    if (!budget) return undefined;
    const { startDate, endDate } = BudgetPeriodUtils.getCurrentPeriod(budget, refTimestamp);
    return { startDate, endDate };
  }, [budget, refTimestamp]);

  const chartTransactions$ = useMemo(() => {
    if (!budgetDateRange || chartAccountIds.length === 0) return of([]);
    return transactionQueryRepository.observeBudgetTransactionsByJournalDateRange(
      workplaceId,
      chartAccountIds,
      budgetDateRange.startDate,
      budgetDateRange.endDate,
      ACTIVE_JOURNAL_STATUSES,
    );
  }, [budgetDateRange, chartAccountIds, workplaceId]);

  const journalList = useJournalEntryList({
    workplaceId,
    pageSize: AppConfig.pagination.budgetDetailsTransactionsPageSize,
    dateRange: budgetDateRange,
    queryOptions: { accountIds: scopeAccountIds },
    expandScopedLegs: scopeAccountIds.length > 0 ? scopeAccountIds : undefined,
    paginationPolicy: 'always',
  });

  const bulkOperations = useJournalsBulkOperations({
    workplaceId,
    journals: journalList.journals,
    selection: journalList,
    onShareSelected: journalList.onShareSelected,
  });

  const journalContextVersion = useMemo(
    () =>
      journalList.journals
        .map(journal => `${journal.id}:${journal.journalDate}:${journal.currencyCode}`)
        .join('|'),
    [journalList.journals],
  );

  const { data: chartData } = useObservableWithEnrichment(
    () => chartTransactions$,
    transactions => {
      if (!budget || !budgetDateRange) return Promise.resolve(null);
      return buildBudgetCumulativeChart({
        workplaceId,
        transactions,
        accounts: [...scopeAccounts, ...expenseAccounts],
        targetCurrency: budget.currencyCode,
        periodStart: budgetDateRange.startDate,
        periodEnd: budgetDateRange.endDate,
      });
    },
    [
      chartTransactions$,
      budget?.id,
      budget?.currencyCode,
      budgetDateRange,
      workplaceId,
      scopeAccounts,
      expenseAccounts,
      journalContextVersion,
    ],
    null,
  );

  const displayedUsage = useMemo(() => {
    if (!usage || !chartData?.hasUnvaluedEntries || usage.hasUnvaluedEntries) return usage;
    return { ...usage, hasUnvaluedEntries: true };
  }, [chartData?.hasUnvaluedEntries, usage]);

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
          if (!dbBudgetData) {
            logger.warn('Cannot delete preview/mock budget');
            return;
          }
          await budgetWriteService.deleteBudget(workplaceId, budget.id);
          analytics.trackFeatureUsage('budget', 'delete', {
            budget_id: budget.id,
            currency: budget.currencyCode,
          });
          AppNavigation.back();
        } catch (error: unknown) {
          logger.error(
            'Failed to delete budget',
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      },
    });
  }, [budget, dbBudgetData, workplaceId]);

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
    usage: displayedUsage,
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
    selectedIds: journalList.selectedIds,
    isSelectionModeActive: journalList.isSelectionModeActive,
    onLongPressItem: journalList.onLongPressItem,
    selectionChrome: bulkOperations.selectionChrome,
    modals: bulkOperations.modals,
  };
}
