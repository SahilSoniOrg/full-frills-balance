import { REPORT_CHART_COLOR_KEYS } from '@/src/constants/report-constants';
import { useBreakdownViewState } from '@/src/features/reports/hooks/useBreakdownViewState';
import { ExpenseCategory, reportService } from '@/src/services/report-service';
import { logger } from '@/src/utils/logger';
import { useEffect, useMemo, useRef, useState } from 'react';

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
    const [selectedExpenses, setSelectedExpenses] = useState<ExpenseCategory[] | null>(null);
    const [selectedIncome, setSelectedIncome] = useState<ExpenseCategory[] | null>(null);
    const [selectedPeriod, setSelectedPeriod] = useState<{ start: number; end: number } | null>(null);
    const selectedBreakdownRequestId = useRef(0);

    const [expandedExpenses, setExpandedExpenses] = useState(false);
    const [expandedIncome, setExpandedIncome] = useState(false);

    const toggleExpenseExpansion = () => setExpandedExpenses(prev => !prev);
    const toggleIncomeExpansion = () => setExpandedIncome(prev => !prev);

    const expensePalette = useMemo(
        () => REPORT_CHART_COLOR_KEYS.expense.map((colorKey) => theme[colorKey]),
        [theme]
    );

    const incomePalette = useMemo(
        () => REPORT_CHART_COLOR_KEYS.income.map((colorKey) => theme[colorKey]),
        [theme]
    );

    useEffect(() => {
        let isMounted = true;
        const requestId = ++selectedBreakdownRequestId.current;

        const fetchBreakdown = async () => {
            if (selectedIncomeExpenseIndex === undefined || !incomeVsExpenseHistory[selectedIncomeExpenseIndex]) {
                if (isMounted && selectedBreakdownRequestId.current === requestId) {
                    setSelectedExpenses(null);
                    setSelectedIncome(null);
                    setSelectedPeriod(null);
                    setExpandedExpenses(false);
                    setExpandedIncome(false);
                }
                return;
            }

            const item = incomeVsExpenseHistory[selectedIncomeExpenseIndex];
            const start = item.startDate;
            const end = item.endDate;

            if (isMounted) setSelectedPeriod({ start, end });

            try {
                const [exp, inc] = await Promise.all([
                    reportService.getExpenseBreakdown(start, end, targetCurrency),
                    reportService.getIncomeBreakdown(start, end, targetCurrency)
                ]);
                if (!isMounted || selectedBreakdownRequestId.current !== requestId) return;

                setSelectedExpenses(exp.map((e, index) => ({ ...e, color: expensePalette[index % expensePalette.length] })));
                setSelectedIncome(inc.map((incomeItem, index) => ({ ...incomeItem, color: incomePalette[index % incomePalette.length] })));
            } catch (error) {
                logger.error('[useReportBreakdownDetails] Failed to fetch selected period breakdown', error, {
                    selectedIncomeExpenseIndex,
                    start,
                    end,
                });
                if (!isMounted || selectedBreakdownRequestId.current !== requestId) return;
                setSelectedExpenses(null);
                setSelectedIncome(null);
                setSelectedPeriod(null);
                setExpandedExpenses(false);
                setExpandedIncome(false);
            }
        };

        fetchBreakdown();
        return () => { isMounted = false; };
    }, [selectedIncomeExpenseIndex, incomeVsExpenseHistory, expensePalette, incomePalette, targetCurrency]);

    const expenseViewState = useBreakdownViewState({
        globalBreakdown: globalExpenses,
        selectedBreakdown: selectedExpenses,
        expanded: expandedExpenses,
        fallbackColor: theme.error,
    });
    const incomeViewState = useBreakdownViewState({
        globalBreakdown: globalIncomeBreakdown,
        selectedBreakdown: selectedIncome,
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
