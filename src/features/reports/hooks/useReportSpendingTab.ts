import { HeatmapPoint } from '@/src/services/reports/reportSnapshot';
import { AccountId } from '@/src/types/domain';
import {
  ReportBreakdownViewState,
  ReportDonutDatum,
  ReportLegendRow,
  ReportSpendingTabVm,
} from './reportTabTypes';

interface UseReportSpendingTabProps {
  expenseCategoryViewState: ReportBreakdownViewState;
  incomeCategoryViewState: ReportBreakdownViewState;
  expenseDonutData: ReportDonutDatum[];
  legendRows: ReportLegendRow[];
  totalExpenseCount: number;
  showExpenseExpansionButton: boolean;
  expandedExpenses: boolean;
  toggleExpenseExpansion: () => void;
  expandedExpenseCategories: boolean;
  toggleExpenseCategoryExpansion: () => void;
  expandedIncomeCategories: boolean;
  toggleIncomeCategoryExpansion: () => void;
  spendingHeatmap: HeatmapPoint[];
  calendarHeatmap: HeatmapPoint[];
  onLegendRowPress: (accountId: AccountId) => void;
  onCategoryPress: (category: string) => void;
  targetCurrency: string;
}

/** Focused spending-tab view-model — donuts, categories, heatmaps. */
export function useReportSpendingTab({
  expenseCategoryViewState,
  incomeCategoryViewState,
  expenseDonutData,
  legendRows,
  totalExpenseCount,
  showExpenseExpansionButton,
  expandedExpenses,
  toggleExpenseExpansion,
  expandedExpenseCategories,
  toggleExpenseCategoryExpansion,
  expandedIncomeCategories,
  toggleIncomeCategoryExpansion,
  spendingHeatmap,
  calendarHeatmap,
  onLegendRowPress,
  onCategoryPress,
  targetCurrency,
}: UseReportSpendingTabProps): ReportSpendingTabVm {
  return {
    expenseCategoryViewState,
    incomeCategoryViewState,
    expenseDonutData,
    legendRows,
    totalExpenseCount,
    showExpenseExpansionButton,
    expandedExpenses,
    toggleExpenseExpansion,
    expandedExpenseCategories,
    toggleExpenseCategoryExpansion,
    expandedIncomeCategories,
    toggleIncomeCategoryExpansion,
    spendingHeatmap,
    calendarHeatmap,
    onLegendRowPress,
    onCategoryPress,
    targetCurrency,
  };
}
