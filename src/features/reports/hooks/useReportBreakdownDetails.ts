import { REPORT_CHART_LAYOUT } from '@/src/constants/report-constants';
import { Theme } from '@/src/constants/design-tokens';
import {
  mapAccountBreakdownToLegendEntry,
  mapCategoryBreakdownToLegendEntries,
  BreakdownLegendEntry,
} from '@/src/features/reports/hooks/breakdownLegendEntries';
import { ReportBreakdownViewState } from '@/src/features/reports/hooks/reportTabTypes';
import { CategoryBreakdown, ExpenseCategory } from '@/src/services/reports/reportSnapshot';
import { useMemo, useState } from 'react';

interface UseReportBreakdownDetailsProps {
  globalExpenses: ExpenseCategory[];
  expenseCategories: CategoryBreakdown[];
  incomeCategories: CategoryBreakdown[];
  theme: Theme;
}

function buildBreakdownViewState({
  globalBreakdown,
  expanded,
  fallbackColor,
}: {
  globalBreakdown: BreakdownLegendEntry[];
  expanded: boolean;
  fallbackColor: string;
}): ReportBreakdownViewState {
  const source = globalBreakdown;
  const displayLimit = expanded ? source.length : REPORT_CHART_LAYOUT.donutLegendCollapsedLimit;

  return {
    donutData: source
      .filter(entry => entry.amount > 0)
      .map(entry => ({
        value: entry.amount,
        color: entry.color || fallbackColor,
        label: entry.accountName,
      })),
    legendRows: source.slice(0, displayLimit).map(entry => ({
      id: entry.id,
      accountIds: entry.accountIds,
      color: entry.color || fallbackColor,
      accountName: entry.accountName,
      percentage: Math.round(entry.percentage),
      amount: entry.amount,
    })),
    hasData: source.length > 0,
    totalCount: source.length,
    showExpansionButton: source.length > REPORT_CHART_LAYOUT.donutLegendCollapsedLimit,
  };
}

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

  const expenseViewState = useMemo(
    () =>
      buildBreakdownViewState({
        globalBreakdown: globalExpenses.map(mapAccountBreakdownToLegendEntry),
        expanded: expandedExpenses,
        fallbackColor: theme.error,
      }),
    [expandedExpenses, globalExpenses, theme.error],
  );

  const expenseCategoryViewState = useMemo(
    () =>
      buildBreakdownViewState({
        globalBreakdown: mapCategoryBreakdownToLegendEntries(expenseCategories),
        expanded: expandedExpenseCategories,
        fallbackColor: theme.error,
      }),
    [expandedExpenseCategories, expenseCategories, theme.error],
  );

  const incomeCategoryViewState = useMemo(
    () =>
      buildBreakdownViewState({
        globalBreakdown: mapCategoryBreakdownToLegendEntries(incomeCategories),
        expanded: expandedIncomeCategories,
        fallbackColor: theme.success,
      }),
    [expandedIncomeCategories, incomeCategories, theme.success],
  );

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
