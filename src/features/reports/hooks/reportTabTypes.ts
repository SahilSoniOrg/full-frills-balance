import { HeatmapPoint, SankeyData } from '@/src/services/reports/reportSnapshot';
import { AccountId } from '@/src/types/domain';

export type ReportTab = 'OVERVIEW' | 'SPENDING' | 'WEALTH';

export type ReportDonutDatum = { value: number; color: string; label: string };

export type ReportLegendRow = {
  id: AccountId;
  color: string;
  accountName: string;
  percentage: number;
  amount: number;
};

export type ReportBreakdownViewState = {
  donutData: ReportDonutDatum[];
  legendRows: ReportLegendRow[];
  totalCount: number;
  showExpansionButton: boolean;
  hasData: boolean;
};

export type ReportBarChartDatum = {
  label: string;
  values: number[];
  colors: string[];
  startDate: number;
  endDate: number;
};

export type ReportNetWorthPoint = {
  x: number;
  y: number;
  date: number;
  netWorth: number;
  income: number;
  expense: number;
  assets: number;
  liabilities: number;
};

export type ReportDailyPoint = {
  date: number;
  netWorth: number;
  income: number;
  expense: number;
  assets: number;
  liabilities: number;
};

export interface ReportOverviewTabVm {
  currentNetWorth: number;
  netWorthSeries: ReportNetWorthPoint[];
  barChartData: ReportBarChartDatum[];
  income: number;
  expense: number;
  incomeBarFlex: number;
  expenseBarFlex: number;
  sankeyData: SankeyData;
  targetCurrency: string;
  selectedBarIndex: number | undefined;
  onSelectBarIndex: (index: number | undefined) => void;
  onViewTransactions: (start: number, end?: number) => void;
  onViewSelectedTransactions: () => void;
}

export interface ReportSpendingTabVm {
  /** By-account expense breakdown (donut + legend). */
  expenseViewState: ReportBreakdownViewState;
  expenseCategoryViewState: ReportBreakdownViewState;
  incomeCategoryViewState: ReportBreakdownViewState;
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

export interface ReportWealthTabVm {
  wealthAreaSeries: { x: number; y: number }[][];
  barChartData: ReportBarChartDatum[];
  dailyData: ReportDailyPoint[];
  targetCurrency: string;
  onViewTransactions: (start: number, end?: number) => void;
}
