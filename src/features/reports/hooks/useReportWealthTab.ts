import { ReportBarChartDatum, ReportDailyPoint, ReportWealthTabVm } from './reportTabTypes';

interface UseReportWealthTabProps {
  wealthAreaSeries: { x: number; y: number }[][];
  barChartData: ReportBarChartDatum[];
  dailyData: ReportDailyPoint[];
  targetCurrency: string;
  onViewTransactions: (start: number, end?: number) => void;
}

/** Focused wealth-tab view-model — area/bar charts + daily series. */
export function useReportWealthTab({
  wealthAreaSeries,
  barChartData,
  dailyData,
  targetCurrency,
  onViewTransactions,
}: UseReportWealthTabProps): ReportWealthTabVm {
  return {
    wealthAreaSeries,
    barChartData,
    dailyData,
    targetCurrency,
    onViewTransactions,
  };
}
