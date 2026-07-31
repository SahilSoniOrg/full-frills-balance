import { SankeyData } from '@/src/services/reports/reportSnapshot';
import { ReportBarChartDatum, ReportNetWorthPoint, ReportOverviewTabVm } from './reportTabTypes';

interface UseReportOverviewTabProps {
  netWorthSeries: ReportNetWorthPoint[];
  barChartData: ReportBarChartDatum[];
  displayedNetWorthText: string;
  displayedIncomeText: string;
  displayedExpenseText: string;
  incomeBarFlex: number;
  expenseBarFlex: number;
  sankeyData: SankeyData;
  targetCurrency: string;
  onViewTransactions: (start: number, end?: number) => void;
  onViewSelectedTransactions: () => void;
}

/** Focused overview-tab view-model — charts + income/expense balance only. */
export function useReportOverviewTab({
  netWorthSeries,
  barChartData,
  displayedNetWorthText,
  displayedIncomeText,
  displayedExpenseText,
  incomeBarFlex,
  expenseBarFlex,
  sankeyData,
  targetCurrency,
  onViewTransactions,
  onViewSelectedTransactions,
}: UseReportOverviewTabProps): ReportOverviewTabVm {
  return {
    netWorthSeries,
    barChartData,
    displayedNetWorthText,
    displayedIncomeText,
    displayedExpenseText,
    incomeBarFlex,
    expenseBarFlex,
    sankeyData,
    targetCurrency,
    onViewTransactions,
    onViewSelectedTransactions,
  };
}
