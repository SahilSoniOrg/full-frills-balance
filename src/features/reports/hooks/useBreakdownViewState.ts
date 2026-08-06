import { REPORT_CHART_LAYOUT } from '@/src/constants/report-constants';
import { BreakdownLegendEntry } from '@/src/features/reports/hooks/breakdownLegendEntries';
import { ReportBreakdownViewState } from '@/src/features/reports/hooks/reportTabTypes';
import { useMemo } from 'react';

interface UseBreakdownViewStateParams {
  globalBreakdown: BreakdownLegendEntry[];
  selectedBreakdown: BreakdownLegendEntry[] | null;
  expanded: boolean;
  fallbackColor: string;
}

export function useBreakdownViewState({
  globalBreakdown,
  selectedBreakdown,
  expanded,
  fallbackColor,
}: UseBreakdownViewStateParams): ReportBreakdownViewState {
  return useMemo(() => {
    const source = selectedBreakdown ?? globalBreakdown;
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
  }, [expanded, fallbackColor, globalBreakdown, selectedBreakdown]);
}
