import type { Theme } from '@/src/constants/design-tokens';
import { HeatmapPoint, SankeyData } from '@/src/services/reports/reportSnapshot';
import { useMemo } from 'react';

interface UseReportChartDataProps {
  netWorthHistory: {
    date: number;
    netWorth: number;
    totalAssets: number;
    totalLiabilities: number;
  }[];
  incomeVsExpenseHistory: {
    period: string;
    income: number;
    expense: number;
    startDate: number;
    endDate: number;
  }[];
  incomeVsExpense: { income: number; expense: number };
  dailyIncomeVsExpense: { date: number; income: number; expense: number }[];
  sankeyData: SankeyData;
  spendingHeatmap: HeatmapPoint[];
  calendarHeatmap: HeatmapPoint[];
  theme: Theme;
}

/**
 * Hook to manage report chart data and selection states.
 * Amounts stay numeric — display masking via MoneyText under PrivacyScope.
 */
export function useReportChartData({
  netWorthHistory,
  incomeVsExpenseHistory,
  incomeVsExpense,
  dailyIncomeVsExpense,
  sankeyData,
  spendingHeatmap,
  calendarHeatmap,
  theme,
}: UseReportChartDataProps) {
  const currentNetWorth = useMemo(() => {
    return netWorthHistory.length > 0 ? netWorthHistory[netWorthHistory.length - 1].netWorth : 0;
  }, [netWorthHistory]);

  const dailyData = useMemo(() => {
    const incomeMap = new Map(dailyIncomeVsExpense.map(d => [d.date, d]));
    return netWorthHistory.map(point => {
      const dayData = incomeMap.get(point.date);
      return {
        date: point.date,
        netWorth: point.netWorth,
        income: dayData?.income || 0,
        expense: dayData?.expense || 0,
        assets: point.totalAssets,
        liabilities: point.totalLiabilities,
      };
    });
  }, [netWorthHistory, dailyIncomeVsExpense]);

  const netWorthSeries = useMemo(
    () =>
      dailyData.map(point => ({
        ...point,
        x: point.date,
        y: point.netWorth,
      })),
    [dailyData],
  );

  const wealthAreaSeries = useMemo(
    () => [
      netWorthHistory.map(p => ({ x: p.date, y: p.totalAssets })),
      netWorthHistory.map(p => ({ x: p.date, y: p.totalLiabilities })),
    ],
    [netWorthHistory],
  );

  const barChartData = useMemo(() => {
    return incomeVsExpenseHistory.map(item => ({
      label: item.period,
      values: [item.income, item.expense],
      colors: [theme.success, theme.error],
      startDate: item.startDate,
      endDate: item.endDate,
    }));
  }, [incomeVsExpenseHistory, theme.success, theme.error]);

  return {
    currentNetWorth,
    displayedIncome: incomeVsExpense.income,
    displayedExpense: incomeVsExpense.expense,
    netWorthSeries,
    wealthAreaSeries,
    dailyData,
    barChartData,
    sankeyData,
    spendingHeatmap,
    calendarHeatmap,
  };
}
