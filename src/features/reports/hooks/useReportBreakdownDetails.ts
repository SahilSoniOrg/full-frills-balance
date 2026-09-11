import { Theme } from '@/src/constants/design-tokens';
import {
  mapAccountBreakdownToLegendEntry,
  mapCategoryBreakdownToLegendEntries,
} from '@/src/features/reports/hooks/breakdownLegendEntries';
import { useBreakdownViewState } from '@/src/features/reports/hooks/useBreakdownViewState';
import { CategoryBreakdown, ExpenseCategory } from '@/src/services/reports/reportSnapshot';
import { useState } from 'react';

interface UseReportBreakdownDetailsProps {
  globalExpenses: ExpenseCategory[];
  expenseCategories: CategoryBreakdown[];
  incomeCategories: CategoryBreakdown[];
  theme: Theme;
}

/**
 * Manages breakdown donut view state and legend expansion for the Spending tab.
 */
export function useReportBreakdownDetails({
  globalExpenses,
  expenseCategories,
  incomeCategories,
  theme,
}: UseReportBreakdownDetailsProps) {
  const [expandedExpenses, setExpandedExpenses] = useState(false);
  const [expandedExpenseCategories, setExpandedExpenseCategories] = useState(false);
  const [expandedIncomeCategories, setExpandedIncomeCategories] = useState(false);

  const toggleExpenseExpansion = () => setExpandedExpenses(prev => !prev);

  const expenseViewState = useBreakdownViewState({
    globalBreakdown: globalExpenses.map(mapAccountBreakdownToLegendEntry),
    expanded: expandedExpenses,
    fallbackColor: theme.error,
  });

  const expenseCategoryViewState = useBreakdownViewState({
    globalBreakdown: mapCategoryBreakdownToLegendEntries(expenseCategories),
    expanded: expandedExpenseCategories,
    fallbackColor: theme.error,
  });

  const incomeCategoryViewState = useBreakdownViewState({
    globalBreakdown: mapCategoryBreakdownToLegendEntries(incomeCategories),
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
