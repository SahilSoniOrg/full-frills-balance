import { useObservable } from '@/src/hooks/useObservable';
import { budgetReadService } from '@/src/services/budget/budgetReadService';
import dayjs from 'dayjs';
import { combineLatest, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { BudgetItem } from '../types';
import { WorkplaceId } from '@/src/types/domain';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback } from 'react';

export function useBudgetListViewModel(workplaceId: WorkplaceId) {
  const budgetsObservable = budgetReadService.observeAllActive(workplaceId).pipe(
    switchMap(budgets => {
      if (budgets.length === 0) return of([]);

      const currentMonth = dayjs().format('YYYY-MM');
      const previousMonth = dayjs().subtract(1, 'month').format('YYYY-MM');

      const itemObservables = budgets.map(budget =>
        combineLatest([
          budgetReadService.observeBudgetUsage(workplaceId, budget.id, currentMonth),
          budgetReadService.observeBudgetUsage(workplaceId, budget.id, previousMonth),
        ]).pipe(map(([usage, previousUsage]) => ({ budget, usage, previousUsage }) as BudgetItem)),
      );
      return combineLatest(itemObservables);
    }),
  );

  const { data: items = [], isLoading } = useObservable<BudgetItem[]>(
    () => budgetsObservable,
    [workplaceId],
    [],
  );

  const onItemPress = useCallback((item: BudgetItem) => {
    AppNavigation.toBudgetDetail(item.budget.id, {
      name: item.budget.name,
      amount: item.budget.amount,
      currency: item.budget.currencyCode,
    });
  }, []);

  return { items, isLoading, onItemPress };
}
