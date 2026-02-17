import { REPORT_CHART_LAYOUT } from '@/src/constants/report-constants';
import { ExpenseCategory } from '@/src/services/report-service';
import { useMemo } from 'react';

interface UseBreakdownViewStateParams {
    globalBreakdown: ExpenseCategory[];
    selectedBreakdown: ExpenseCategory[] | null;
    expanded: boolean;
    fallbackColor: string;
}

interface BreakdownLegendRow {
    id: string;
    color: string;
    accountName: string;
    percentage: number;
    amount: number;
}

interface BreakdownDonutDataPoint {
    value: number;
    color: string;
    label: string;
}

interface BreakdownViewState {
    donutData: BreakdownDonutDataPoint[];
    legendRows: BreakdownLegendRow[];
    hasData: boolean;
    totalCount: number;
    showExpansionButton: boolean;
}

export function useBreakdownViewState({
    globalBreakdown,
    selectedBreakdown,
    expanded,
    fallbackColor,
}: UseBreakdownViewStateParams): BreakdownViewState {
    return useMemo(() => {
        const source = selectedBreakdown ?? globalBreakdown;
        const displayLimit = expanded ? source.length : REPORT_CHART_LAYOUT.donutLegendCollapsedLimit;

        return {
            donutData: source
                .filter((entry) => entry.amount > 0)
                .map((entry) => ({
                    value: entry.amount,
                    color: entry.color || fallbackColor,
                    label: entry.accountName,
                })),
            legendRows: source.slice(0, displayLimit).map((entry) => ({
                id: entry.accountId,
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
