import { AppConfig } from '@/src/constants/app-config';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { useTheme } from '@/src/hooks/use-theme';
import { useObservableWithEnrichment } from '@/src/hooks/useObservable';
import { reportService } from '@/src/services/report-service';
import { DateRange, PeriodFilter, getLastNRange } from '@/src/utils/dateUtils';
import { preferences } from '@/src/utils/preferences';
import { useCallback, useMemo, useState } from 'react';

export function useReports() {
    const { theme } = useTheme();

    const [periodFilter, setPeriodFilter] = useState<PeriodFilter>({
        type: 'LAST_N',
        lastN: 30,
        lastNUnit: 'days'
    });
    const [dateRange, setDateRange] = useState<DateRange>(getLastNRange(30, 'days'));

    const triggerObservable = useMemo(() => {
        return transactionRepository.observeCountByDateRange(dateRange.startDate, dateRange.endDate, false);
    }, [dateRange.startDate, dateRange.endDate]);

    const { data, isLoading: loading, error } = useObservableWithEnrichment(
        () => triggerObservable,
        async () => {
            const { startDate, endDate } = dateRange;
            const targetCurrency = preferences.defaultCurrencyCode || AppConfig.defaultCurrency;

            const [history, breakdown, incVsExp] = await Promise.all([
                reportService.getNetWorthHistory(startDate, endDate, targetCurrency),
                reportService.getExpenseBreakdown(startDate, endDate, targetCurrency),
                reportService.getIncomeVsExpense(startDate, endDate, targetCurrency)
            ]);

            return {
                netWorthHistory: history,
                expenseBreakdown: breakdown,
                incomeVsExpense: incVsExp
            };
        },
        [dateRange, triggerObservable],
        { netWorthHistory: [], expenseBreakdown: [], incomeVsExpense: { income: 0, expense: 0 } }
    );

    const expenses = useMemo(() => {
        const colors = [
            theme.primary,
            theme.error,
            theme.success,
            theme.warning,
            theme.asset,
            theme.primaryLight
        ];
        return data.expenseBreakdown.map((b, i) => ({ ...b, color: colors[i % colors.length] }));
    }, [data.expenseBreakdown, theme.asset, theme.error, theme.primary, theme.primaryLight, theme.success, theme.warning]);

    const updateFilter = useCallback((range: DateRange, filter: PeriodFilter) => {
        setDateRange(range);
        setPeriodFilter(filter);
    }, []);

    return {
        netWorthHistory: data.netWorthHistory,
        expenses,
        incomeVsExpense: data.incomeVsExpense,
        loading,
        error,
        dateRange,
        periodFilter,
        updateFilter
    };
}
