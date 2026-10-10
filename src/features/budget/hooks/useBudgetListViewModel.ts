import { useCalendarDay } from '@/src/hooks/useCalendarDay';
import { useObservable } from '@/src/hooks/useObservable';
import { budgetReadService } from '@/src/services/budget/budgetReadService';
import { accountQueries } from '@/src/services/accounts/accountQueries';
import { combineLatest, of } from 'rxjs';
import { map, startWith, switchMap } from 'rxjs/operators';
import { BudgetItem } from '../types';
import { sortBudgetItems, summarizeBudgetList } from '../helpers/budgetListPresentation';
import { WorkplaceId } from '@/src/types/ids';
import { AppNavigation } from '@/src/utils/navigation';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { useCallback, useMemo } from 'react';

export function useBudgetListViewModel(workplaceId: WorkplaceId, currencyCode?: string) {
  const today = useCalendarDay();
  const budgetsObservable = useMemo(() => {
    // Re-value when rates arrive (e.g. after "Fetch missing rates" in the FX sheet).
    const items$ = combineLatest([
      budgetReadService.observeAllActive(workplaceId),
      exchangeRateService.observeSpotRateUpdates().pipe(startWith('')),
    ]).pipe(
      map(([budgets]) => budgets),
      switchMap(budgets => {
        if (budgets.length === 0) return of([]);

        const itemObservables = budgets.map(budget =>
          combineLatest([
            budgetReadService.observeBudgetUsage(workplaceId, budget.id, today),
            budgetReadService.observeScopes(workplaceId, budget.id),
          ]).pipe(map(([usage, scopes]) => ({ budget, usage, scopes }))),
        );
        return combineLatest(itemObservables);
      }),
    );
    return combineLatest([items$, accountQueries.observeAll(workplaceId)]).pipe(
      map(([items, accounts]): BudgetItem[] => {
        const accountsById = new Map(accounts.map(account => [String(account.id), account]));
        return items.map(({ budget, usage, scopes }) => ({
          budget,
          usage,
          scopeAccounts: scopes.map(scope => accountsById.get(scope.accountId)),
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
  const missingRateQuotes = useMemo(
    () => items.flatMap(item => item.usage.missingRateQuotes ?? []),
    [items],
  );
  return {
    items: sortedItems,
    summary,
    isLoading,
    error,
    retry,
    onItemPress,
    missingRateQuotes,
  };
}
