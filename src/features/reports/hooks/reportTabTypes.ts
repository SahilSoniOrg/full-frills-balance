import { HeatmapPoint, SankeyData } from '@/src/services/reports/reportSnapshot';
import { ReportSummary } from '@/src/services/reports/reportSummary';
import { AccountId } from '@/src/types/ids';

export interface ReportSummaryVm extends ReportSummary {
  onViewIncomeTransactions: () => void;
  onViewExpenseTransactions: () => void;
  onViewNetFlowTransactions: () => void;
  onViewLargestCategoryTransactions: () => void;
  onViewHighestSpendingDayTransactions: () => void;
}

export type ReportTab = 'OVERVIEW' | 'SPENDING' | 'WEALTH';

export type ReportDonutDatum = { value: number; color: string; label: string };

export type ReportLegendRow = {
  id: string;
  accountIds: AccountId[];
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
  summary: ReportSummaryVm;
  currentNetWorth: number;
  netWorthSeries: ReportNetWorthPoint[];
  income: number;
  expense: number;
  incomeBarFlex: number;
  expenseBarFlex: number;
  sankeyData: SankeyData;
  targetCurrency: string;
  onViewTransactions: (start: number, end?: number) => void;
}

export interface ReportSpendingTabVm {
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
  onLegendRowPress: (accountIds: AccountId[]) => void;
  targetCurrency: string;
}

export interface ReportWealthTabVm {
  wealthAreaSeries: { x: number; y: number }[][];
  barChartData: ReportBarChartDatum[];
  dailyData: ReportDailyPoint[];
  targetCurrency: string;
  onViewTransactions: (start: number, end?: number) => void;
}
