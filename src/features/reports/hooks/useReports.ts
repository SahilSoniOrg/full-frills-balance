import { AppConfig } from '@/src/constants/app-config';
import { REPORT_CHART_COLOR_KEYS } from '@/src/constants/report-constants';
import { useUI } from '@/src/contexts/UIContext';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { useTheme } from '@/src/hooks/use-theme';
import { useObservableWithEnrichment } from '@/src/hooks/useObservable';
import { reportService } from '@/src/services/report-service';
import { wealthService } from '@/src/services/wealth-service';
import { DateRange, PeriodFilter, getLastNRange } from '@/src/utils/dateUtils';
import { useCallback, useMemo, useState } from 'react';
import { combineLatest, map } from 'rxjs';

export function useReports() {
    const { theme } = useTheme();
    const { defaultCurrency } = useUI();
    const targetCurrency = defaultCurrency || AppConfig.defaultCurrency;

    const [periodFilter, setPeriodFilter] = useState<PeriodFilter>({
        type: 'LAST_N',
        lastN: AppConfig.defaults.reportDays,
        lastNUnit: 'days'
    });
    const [dateRange, setDateRange] = useState<DateRange>(getLastNRange(AppConfig.defaults.reportDays, 'days'));

    const triggerObservable = useMemo(() => {
        return combineLatest([
            accountRepository.observeAll(),
            journalRepository.observeStatusMeta() // Changed from transactionRepository to journalStatusMeta for performance
        ]).pipe(map(() => 0));
    }, []);

    // Load net worth history (faster, independent)
    const { data: netWorthHistory, isLoading: loadingNetWorth, error: errorNetWorth } = useObservableWithEnrichment(
        () => triggerObservable,
        async () => {
            const { startDate, endDate } = dateRange;
            return await wealthService.getNetWorthHistory(startDate, endDate, targetCurrency);
        },
        [dateRange, triggerObservable, defaultCurrency],
        []
    );

    // Load full report snapshot (slower, richer)
    const { data: snapshotData, isLoading: loadingSnapshot, error: errorSnapshot } = useObservableWithEnrichment(
        () => triggerObservable,
        async () => {
            const { startDate, endDate } = dateRange;
            return await reportService.getReportSnapshot(startDate, endDate, targetCurrency);
        },
        [dateRange, triggerObservable, defaultCurrency],
        {
            expenseBreakdown: [],
            incomeBreakdown: [],
            incomeVsExpenseHistory: [],
            incomeVsExpense: { income: 0, expense: 0 },
            dailyIncomeVsExpense: []
        }
    );

    const loading = loadingNetWorth || loadingSnapshot;
    const error = errorNetWorth || errorSnapshot;
    const data = {
        netWorthHistory,
        ...snapshotData
    };

    const expenses = useMemo(() => {
        const colors = REPORT_CHART_COLOR_KEYS.expense.map((colorKey) => theme[colorKey]);
        return data.expenseBreakdown.map((b, i) => ({ ...b, color: colors[i % colors.length] }));
    }, [data.expenseBreakdown, theme]);

    const incomeBreakdown = useMemo(() => {
        const colors = REPORT_CHART_COLOR_KEYS.income.map((colorKey) => theme[colorKey]);
        return data.incomeBreakdown.map((b, i) => ({ ...b, color: colors[i % colors.length] }));
    }, [data.incomeBreakdown, theme]);

    const updateFilter = useCallback((range: DateRange, filter: PeriodFilter) => {
        setDateRange(range);
        setPeriodFilter(filter);
    }, []);

    return {
        netWorthHistory: data.netWorthHistory,
        expenses,
        incomeBreakdown,
        incomeVsExpenseHistory: data.incomeVsExpenseHistory,
        incomeVsExpense: data.incomeVsExpense,
        dailyIncomeVsExpense: data.dailyIncomeVsExpense,
        targetCurrency,
        loading,
        error,
        dateRange,
        periodFilter,
        updateFilter
    };
}
