import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { useCallback, useMemo, useState } from 'react';

interface UseReportChartDataProps {
    netWorthHistory: { date: number; netWorth: number }[];
    incomeVsExpenseHistory: { period: string; income: number; expense: number; startDate: number; endDate: number }[];
    incomeVsExpense: { income: number; expense: number };
    dailyIncomeVsExpense: { date: number; income: number; expense: number }[];
    theme: any;
}

/**
 * Hook to manage report chart data and selection states.
 */
export function useReportChartData({
    netWorthHistory,
    incomeVsExpenseHistory,
    incomeVsExpense,
    dailyIncomeVsExpense,
    theme,
}: UseReportChartDataProps) {
    const [selectedNetWorthIndex, setSelectedNetWorthIndex] = useState<number | undefined>();
    const [selectedIncomeExpenseIndex, setSelectedIncomeExpenseIndex] = useState<number | undefined>();

    const onNetWorthPointSelect = useCallback((index: number) => {
        setSelectedNetWorthIndex(prev => prev === index ? undefined : index);
    }, []);

    const onIncomeExpensePointSelect = useCallback((index: number) => {
        setSelectedIncomeExpenseIndex(prev => prev === index ? undefined : index);
    }, []);

    const currentNetWorth = useMemo(() => {
        return netWorthHistory.length > 0
            ? netWorthHistory[netWorthHistory.length - 1].netWorth
            : 0;
    }, [netWorthHistory]);

    const displayedNetWorthText = useMemo(() => {
        return CurrencyFormatter.formatWithPreference(currentNetWorth);
    }, [currentNetWorth]);

    const displayedIncome = useMemo(() => {
        if (selectedIncomeExpenseIndex !== undefined && incomeVsExpenseHistory[selectedIncomeExpenseIndex]) {
            return incomeVsExpenseHistory[selectedIncomeExpenseIndex].income;
        }
        return incomeVsExpense.income;
    }, [selectedIncomeExpenseIndex, incomeVsExpenseHistory, incomeVsExpense.income]);

    const displayedExpense = useMemo(() => {
        if (selectedIncomeExpenseIndex !== undefined && incomeVsExpenseHistory[selectedIncomeExpenseIndex]) {
            return incomeVsExpenseHistory[selectedIncomeExpenseIndex].expense;
        }
        return incomeVsExpense.expense;
    }, [selectedIncomeExpenseIndex, incomeVsExpenseHistory, incomeVsExpense.expense]);

    const netWorthSeries = useMemo(
        () => netWorthHistory.map((point) => ({ x: point.date, y: point.netWorth })),
        [netWorthHistory]
    );

    const dailyData = useMemo(() => {
        const incomeMap = new Map(dailyIncomeVsExpense.map(d => [d.date, d]));
        return netWorthHistory.map(point => {
            const dayData = incomeMap.get(point.date);
            return {
                date: point.date,
                netWorth: point.netWorth,
                income: dayData?.income || 0,
                expense: dayData?.expense || 0,
            };
        });
    }, [netWorthHistory, dailyIncomeVsExpense]);

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
        selectedNetWorthIndex,
        selectedIncomeExpenseIndex,
        onNetWorthPointSelect,
        onIncomeExpensePointSelect,
        displayedNetWorthText,
        displayedIncomeText: CurrencyFormatter.formatWithPreference(displayedIncome),
        displayedExpenseText: CurrencyFormatter.formatWithPreference(displayedExpense),
        netWorthSeries,
        dailyData,
        barChartData,
        setSelectedNetWorthIndex,
        setSelectedIncomeExpenseIndex,
    };
}
