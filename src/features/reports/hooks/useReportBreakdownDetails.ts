import { Theme } from '@/src/constants/design-tokens';
import { REPORT_CHART_COLOR_KEYS } from '@/src/constants/report-constants';
import { useBreakdownViewState } from '@/src/features/reports/hooks/useBreakdownViewState';
import { useObservable } from '@/src/hooks/useObservable';
import {
  CategoryBreakdown,
  ExpenseCategory,
  IncomeVsExpense,
  reportService,
} from '@/src/services/report-service';
import { useMemo, useState } from 'react';
import { combineLatest, of } from 'rxjs';
import { map } from 'rxjs/operators';

interface UseReportBreakdownDetailsProps {
  globalExpenses: ExpenseCategory[];
  globalIncomeBreakdown: ExpenseCategory[];
  expenseCategories: CategoryBreakdown[];
  incomeCategories: CategoryBreakdown[];
  incomeVsExpenseHistory: IncomeVsExpense[];
  selectedIncomeExpenseIndex: number | undefined;
  targetCurrency: string;
  theme: Theme;
  workplaceId: string;
}

/**
 * Hook to manage report breakdown details for selected periods and expansion states.
 */
export function useReportBreakdownDetails({
  globalExpenses,
  globalIncomeBreakdown,
  expenseCategories,
  incomeCategories,
  incomeVsExpenseHistory,
  selectedIncomeExpenseIndex,
  targetCurrency,
  theme,
  workplaceId,
}: UseReportBreakdownDetailsProps) {
  const [expandedExpenses, setExpandedExpenses] = useState(false);
  const [expandedIncome, setExpandedIncome] = useState(false);
  const [expandedExpenseCategories, setExpandedExpenseCategories] = useState(false);
  const [expandedIncomeCategories, setExpandedIncomeCategories] = useState(false);

  const toggleExpenseExpansion = () => setExpandedExpenses(prev => !prev);
  const toggleIncomeExpansion = () => setExpandedIncome(prev => !prev);

  const expensePalette = useMemo(
    () => REPORT_CHART_COLOR_KEYS.expense.map(colorKey => theme[colorKey]),
    [theme],
  );

  const incomePalette = useMemo(
    () => REPORT_CHART_COLOR_KEYS.income.map(colorKey => theme[colorKey]),
    [theme],
  );

  const selectedPeriod = useMemo(() => {
    if (
      selectedIncomeExpenseIndex === undefined ||
      !incomeVsExpenseHistory[selectedIncomeExpenseIndex]
    )
      return null;
    const item = incomeVsExpenseHistory[selectedIncomeExpenseIndex];
    return { start: item.startDate, end: item.endDate };
  }, [selectedIncomeExpenseIndex, incomeVsExpenseHistory]);

  const { data: selectedBreakdown } = useObservable(
    () => {
      if (!selectedPeriod)
        return of({ expenses: [] as ExpenseCategory[], income: [] as ExpenseCategory[] });

      return combineLatest([
        reportService.observeExpenseBreakdown(
          workplaceId,
          selectedPeriod.start,
          selectedPeriod.end,
          targetCurrency,
        ),
        reportService.observeIncomeBreakdown(
          workplaceId,
          selectedPeriod.start,
          selectedPeriod.end,
          targetCurrency,
        ),
      ]).pipe(
        map(([expenses, income]) => ({
          expenses: expenses.map((e, index) => ({
            ...e,
            color: expensePalette[index % expensePalette.length],
          })),
          income: income.map((i, index) => ({
            ...i,
            color: incomePalette[index % incomePalette.length],
          })),
        })),
      );
    },
    [selectedPeriod, targetCurrency, expensePalette, incomePalette, workplaceId],
    { expenses: [] as ExpenseCategory[], income: [] as ExpenseCategory[] },
  );

  const expenseViewState = useBreakdownViewState({
    globalBreakdown: globalExpenses,
    selectedBreakdown: selectedBreakdown.expenses.length > 0 ? selectedBreakdown.expenses : null,
    expanded: expandedExpenses,
    fallbackColor: theme.error,
  });
  const incomeViewState = useBreakdownViewState({
    globalBreakdown: globalIncomeBreakdown,
    selectedBreakdown: selectedBreakdown.income.length > 0 ? selectedBreakdown.income : null,
    expanded: expandedIncome,
    fallbackColor: theme.success,
  });

  const expenseCategoryViewState = useBreakdownViewState({
    globalBreakdown: expenseCategories.map(c => ({
      ...c,
      accountId: c.category,
      accountName: c.category,
    })),
    selectedBreakdown: null,
    expanded: expandedExpenseCategories,
    fallbackColor: theme.error,
  });

  const incomeCategoryViewState = useBreakdownViewState({
    globalBreakdown: incomeCategories.map(c => ({
      ...c,
      accountId: c.category,
      accountName: c.category,
    })),
    selectedBreakdown: null,
    expanded: expandedIncomeCategories,
    fallbackColor: theme.success,
  });

  return {
    selectedPeriod,
    expandedExpenses,
    expandedIncome,
    expandedExpenseCategories,
    expandedIncomeCategories,
    toggleExpenseExpansion,
    toggleIncomeExpansion,
    toggleExpenseCategoryExpansion: () => setExpandedExpenseCategories(prev => !prev),
    toggleIncomeCategoryExpansion: () => setExpandedIncomeCategories(prev => !prev),
    expenseViewState,
    incomeViewState,
    expenseCategoryViewState,
    incomeCategoryViewState,
    setExpandedExpenses,
    setExpandedIncome,
  };
}
