import { useCalendarDay } from '@/src/hooks/useCalendarDay';
import { useObservable } from '@/src/hooks/useObservable';
import { observeBudgetList } from '@/src/services/budget/budgetListReadModel';
import { EMPTY } from 'rxjs';
import { BudgetItem } from '../types';
import { sortBudgetItems, summarizeBudgetList } from '../helpers/budgetListPresentation';
import { WorkplaceId } from '@/src/types/ids';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useMemo } from 'react';

export function useBudgetListViewModel(
  workplaceId: WorkplaceId,
  currencyCode?: string,
  enabled = true,
) {
  const today = useCalendarDay();
  const budgetsObservable = useMemo(() => {
    if (!enabled) return EMPTY;
    return observeBudgetList(workplaceId, today);
  }, [enabled, workplaceId, today]);

  const {
    data: items = [],
    isLoading,
    error,
    retry,
  } = useObservable<BudgetItem[]>(() => budgetsObservable, [workplaceId, today, enabled], []);

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
