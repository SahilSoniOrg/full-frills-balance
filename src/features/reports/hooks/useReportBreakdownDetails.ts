import { Theme } from '@/src/constants/design-tokens';
import {
  mapAccountBreakdownToLegendEntry,
  mapCategoryBreakdownToLegendEntries,
} from '@/src/features/reports/hooks/breakdownLegendEntries';
import { useBreakdownViewState } from '@/src/features/reports/hooks/useBreakdownViewState';
import { ReportPeriodSnapshot } from '@/src/features/reports/hooks/useSelectedReportPeriod';
import { CategoryBreakdown, ExpenseCategory } from '@/src/services/reports/reportSnapshot';
import { useState } from 'react';

interface UseReportBreakdownDetailsProps {
  globalExpenses: ExpenseCategory[];
  expenseCategories: CategoryBreakdown[];
  incomeCategories: CategoryBreakdown[];
  periodSnapshot: ReportPeriodSnapshot | null;
  theme: Theme;
}

/**
 * Manages breakdown donut view state and legend expansion for the Spending tab.
 */
export function useReportBreakdownDetails({
  globalExpenses,
  expenseCategories,
  incomeCategories,
  periodSnapshot,
  theme,
}: UseReportBreakdownDetailsProps) {
  const [expandedExpenses, setExpandedExpenses] = useState(false);
  const [expandedExpenseCategories, setExpandedExpenseCategories] = useState(false);
  const [expandedIncomeCategories, setExpandedIncomeCategories] = useState(false);

  const toggleExpenseExpansion = () => setExpandedExpenses(prev => !prev);

  const scopedExpenses =
    periodSnapshot && periodSnapshot.expenses.length > 0 ? periodSnapshot.expenses : null;
  const scopedExpenseCategories =
    periodSnapshot && periodSnapshot.expenseCategories.length > 0
      ? periodSnapshot.expenseCategories
      : null;
  const scopedIncomeCategories =
    periodSnapshot && periodSnapshot.incomeCategories.length > 0
      ? periodSnapshot.incomeCategories
      : null;

  const expenseViewState = useBreakdownViewState({
    globalBreakdown: globalExpenses.map(mapAccountBreakdownToLegendEntry),
    selectedBreakdown: scopedExpenses?.map(mapAccountBreakdownToLegendEntry) ?? null,
    expanded: expandedExpenses,
    fallbackColor: theme.error,
  });

  const expenseCategoryViewState = useBreakdownViewState({
    globalBreakdown: mapCategoryBreakdownToLegendEntries(expenseCategories),
    selectedBreakdown: scopedExpenseCategories
      ? mapCategoryBreakdownToLegendEntries(scopedExpenseCategories)
      : null,
    expanded: expandedExpenseCategories,
    fallbackColor: theme.error,
  });

  const incomeCategoryViewState = useBreakdownViewState({
    globalBreakdown: mapCategoryBreakdownToLegendEntries(incomeCategories),
    selectedBreakdown: scopedIncomeCategories
      ? mapCategoryBreakdownToLegendEntries(scopedIncomeCategories)
      : null,
    expanded: expandedIncomeCategories,
    fallbackColor: theme.success,
  });

  return {
    expandedExpenses,
    expandedExpenseCategories,
    expandedIncomeCategories,
    toggleExpenseExpansion,
    toggleExpenseCategoryExpansion: () => setExpandedExpenseCategories(prev => !prev),
    toggleIncomeCategoryExpansion: () => setExpandedIncomeCategories(prev => !prev),
    expenseViewState,
    expenseCategoryViewState,
    incomeCategoryViewState,
    setExpandedExpenses,
  };
}
