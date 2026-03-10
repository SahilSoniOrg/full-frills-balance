import { REPORT_CHART_COLOR_KEYS } from '@/src/constants/report-constants';
import { useBreakdownViewState } from '@/src/features/reports/hooks/useBreakdownViewState';
import { reportService } from '@/src/services/report-service';
import { useObservable } from '@/src/hooks/useObservable';
import { combineLatest, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { useMemo, useState } from 'react';

interface UseReportBreakdownDetailsProps {
    globalExpenses: any[];
    globalIncomeBreakdown: any[];
    incomeVsExpenseHistory: any[];
    selectedIncomeExpenseIndex: number | undefined;
    targetCurrency: string;
    theme: any;
}

/**
 * Hook to manage report breakdown details for selected periods and expansion states.
 */
export function useReportBreakdownDetails({
    globalExpenses,
    globalIncomeBreakdown,
    incomeVsExpenseHistory,
    selectedIncomeExpenseIndex,
    targetCurrency,
    theme,
}: UseReportBreakdownDetailsProps) {
    const [expandedExpenses, setExpandedExpenses] = useState(false);
    const [expandedIncome, setExpandedIncome] = useState(false);

    const toggleExpenseExpansion = () => setExpandedExpenses(prev => !prev);
    const toggleIncomeExpansion = () => setExpandedIncome(prev => !prev);

    const expensePalette = useMemo(
        () => REPORT_CHART_COLOR_KEYS.expense.map((colorKey: string) => theme[colorKey]),
        [theme]
    );

    const incomePalette = useMemo(
        () => REPORT_CHART_COLOR_KEYS.income.map((colorKey: string) => theme[colorKey]),
        [theme]
    );

    const selectedPeriod = useMemo(() => {
        if (selectedIncomeExpenseIndex === undefined || !incomeVsExpenseHistory[selectedIncomeExpenseIndex]) return null;
        const item = incomeVsExpenseHistory[selectedIncomeExpenseIndex];
        return { start: item.startDate, end: item.endDate };
    }, [selectedIncomeExpenseIndex, incomeVsExpenseHistory]);

    const { data: selectedBreakdown } = useObservable(
        () => {
            if (!selectedPeriod) return of({ expenses: [] as any[], income: [] as any[] });

            return combineLatest([
                reportService.observeExpenseBreakdown(selectedPeriod.start, selectedPeriod.end, targetCurrency),
                reportService.observeIncomeBreakdown(selectedPeriod.start, selectedPeriod.end, targetCurrency)
            ]).pipe(
                map(([expenses, income]) => ({
                    expenses: expenses.map((e, index) => ({ ...e, color: expensePalette[index % expensePalette.length] })),
                    income: income.map((i, index) => ({ ...i, color: incomePalette[index % incomePalette.length] }))
                }))
            );
        },
        [selectedPeriod, targetCurrency, expensePalette, incomePalette],
        { expenses: [] as any[], income: [] as any[] }
    );

    const expenseViewState = useBreakdownViewState({
        globalBreakdown: globalExpenses,
        selectedBreakdown: selectedBreakdown.expenses.length > 0 ? selectedBreakdown.expenses : null,
        expanded: expandedExpenses,
        fallbackColor: theme.error,
    });
    const incomeViewState = useBreakdownViewState({
        globalBreakdown: globalIncomeBreakdown,
        selectedBreakdown: selectedBreakdown.income.length > 0 ? selectedBreakdown.income : null,
        expanded: expandedIncome,
        fallbackColor: theme.success,
    });

    return {
        selectedPeriod,
        expandedExpenses,
        expandedIncome,
        toggleExpenseExpansion,
        toggleIncomeExpansion,
        expenseViewState,
        incomeViewState,
        setExpandedExpenses,
        setExpandedIncome,
    };
}
