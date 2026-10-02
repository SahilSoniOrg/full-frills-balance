import { useObservable } from '@/src/hooks/useObservable';
import { budgetReadService } from '@/src/services/budget/budgetReadService';
import { accountQueries } from '@/src/services/accounts/accountQueries';
import { BudgetPeriodUtils } from '@/src/services/budget/BudgetPeriodUtils';
import { parseBudgetAssetAccountIds } from '@/src/services/budget/budgetAssetAccountIds';
import { combineLatest, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { BudgetItem } from '../types';
import { WorkplaceId } from '@/src/types/ids';
import { AppNavigation } from '@/src/utils/navigation';
import { getNow } from '@/src/utils/dateUtils';
import { useCallback, useMemo } from 'react';

export function useBudgetListViewModel(workplaceId: WorkplaceId) {
  const budgetsObservable = useMemo(() => {
    const items$ = budgetReadService.observeAllActive(workplaceId).pipe(
      switchMap(budgets => {
        if (budgets.length === 0) return of([]);

        const now = getNow();
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
  }, [workplaceId]);

  const {
    data: items = [],
    isLoading,
    error,
    retry,
  } = useObservable<BudgetItem[]>(() => budgetsObservable, [workplaceId], []);

  const onItemPress = useCallback((item: BudgetItem) => {
    AppNavigation.toBudgetDetail(item.budget.id);
  }, []);

  return { items, isLoading, error, retry, onItemPress };
}
