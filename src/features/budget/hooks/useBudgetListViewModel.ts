import { useCalendarDay } from '@/src/hooks/useCalendarDay';
import { useObservable } from '@/src/hooks/useObservable';
import { budgetReadService } from '@/src/services/budget/budgetReadService';
import { accountQueries } from '@/src/services/accounts/accountQueries';
import { BudgetPeriodUtils } from '@/src/services/budget/BudgetPeriodUtils';
import { parseBudgetAssetAccountIds } from '@/src/services/budget/budgetAssetAccountIds';
import { combineLatest, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { BudgetItem } from '../types';
import { sortBudgetItems, summarizeBudgetList } from '../helpers/budgetListPresentation';
import { WorkplaceId } from '@/src/types/ids';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useMemo } from 'react';

export function useBudgetListViewModel(workplaceId: WorkplaceId, currencyCode?: string) {
  const today = useCalendarDay();
  const budgetsObservable = useMemo(() => {
    const items$ = budgetReadService.observeAllActive(workplaceId).pipe(
      switchMap(budgets => {
        if (budgets.length === 0) return of([]);

        const now = today;
        const itemObservables = budgets.map(budget => {
          const { startDate } = BudgetPeriodUtils.getCurrentPeriod(budget, now);
          return combineLatest([
            budgetReadService.observeBudgetUsage(workplaceId, budget.id, now),
            budgetReadService.observeBudgetUsage(workplaceId, budget.id, startDate - 1),
            budgetReadService.observeScopes(workplaceId, budget.id),
          ]).pipe(
            map(([usage, previousUsage, scopes]) => ({ budget, usage, previousUsage, scopes })),
          );
        });
        return combineLatest(itemObservables);
      }),
    );
    return combineLatest([items$, accountQueries.observeAll(workplaceId)]).pipe(
      map(([items, accounts]): BudgetItem[] => {
        const accountsById = new Map(accounts.map(account => [String(account.id), account]));
        return items.map(({ budget, usage, previousUsage, scopes }) => ({
          budget,
          usage,
          previousUsage,
          scopeAccounts: scopes.map(scope => accountsById.get(scope.accountId)),
          fundingAccounts: parseBudgetAssetAccountIds(budget.assetAccountIds).map(id =>
            accountsById.get(id),
          ),
        }));
      }),
    );
  }, [workplaceId, today]);

  const {
    data: items = [],
    isLoading,
    error,
    retry,
  } = useObservable<BudgetItem[]>(() => budgetsObservable, [workplaceId, today], []);

  const onItemPress = useCallback((item: BudgetItem) => {
    AppNavigation.toBudgetDetail(item.budget.id);
  }, []);

  const sortedItems = useMemo(() => sortBudgetItems(items, today), [items, today]);
  const summary = useMemo(
    () => (currencyCode ? summarizeBudgetList(items, currencyCode, today) : undefined),
    [items, currencyCode, today],
  );
  return { items: sortedItems, summary, isLoading, error, retry, onItemPress };
}
