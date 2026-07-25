import { AppConfig } from '@/src/constants/app-config';
import { Animation } from '@/src/constants';
import { REPORT_CHART_COLOR_KEYS } from '@/src/constants/report-constants';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import {
  observeWorkplaceAccounts,
  observeWorkplaceJournalMeta,
} from '@/src/services/reactive/reactiveWorkplaceObserves';
import { useTheme } from '@/src/hooks/use-theme';
import { useObservableWithEnrichment } from '@/src/hooks/useObservable';
import { reportService } from '@/src/services/report-service';
import { wealthService } from '@/src/services/wealth-service';
import { AccountId, WorkplaceId } from '@/src/types/domain';
import { DateRange, PeriodFilter, getLastNRange } from '@/src/utils/dateUtils';
import { logger } from '@/src/utils/logger';
import { firstFastDebounce } from '@/src/utils/rxjs-operators';
import { useCallback, useMemo, useState } from 'react';
import { combineLatest, map } from 'rxjs';

export function useReports(workplaceId: WorkplaceId, currencyCode: string) {
  const { theme } = useTheme();
  const targetCurrency = currencyCode;

  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>({
    type: 'LAST_N',
    lastN: AppConfig.defaults.reportDays,
    lastNUnit: 'days',
  });
  const [dateRange, setDateRange] = useState<DateRange>(
    getLastNRange(AppConfig.defaults.reportDays, 'days'),
  );
  const [accountIds, setAccountIds] = useState<AccountId[]>([]);

  const triggerObservable = useMemo(() => {
    return combineLatest([
      observeWorkplaceAccounts(workplaceId),
      observeWorkplaceJournalMeta(workplaceId),
    ]).pipe(
      firstFastDebounce(Animation.dataRefreshDebounce),
      map(() => 0),
    );
  }, [workplaceId]);

  // Load net worth history (faster, independent)
  const {
    data: netWorthHistory,
    isLoading: loadingNetWorth,
    error: errorNetWorth,
  } = useObservableWithEnrichment(
    () => triggerObservable,
    async () => {
      const { startDate, endDate } = dateRange;
      return await wealthService.getNetWorthHistory(
        workplaceId,
        startDate,
        endDate,
        targetCurrency,
        accountIds,
      );
    },
    [workplaceId, dateRange, triggerObservable, targetCurrency, accountIds],
    [],
  );

  // Load full report snapshot (slower, richer)
  const {
    data: snapshotData,
    isLoading: loadingSnapshot,
    error: errorSnapshot,
  } = useObservableWithEnrichment(
    () => triggerObservable,
    async () => {
      const { startDate, endDate } = dateRange;
      if (__DEV__) {
        logger.debug('[DEBUG_REPORT] snapshot enricher calling getReportSnapshot', {
          startDate: new Date(startDate).toISOString(),
          endDate: new Date(endDate).toISOString(),
          accountIds,
        });
      }
      return await reportService.getReportSnapshot(
        workplaceId,
        startDate,
        endDate,
        targetCurrency,
        accountIds,
      );
    },
    [workplaceId, dateRange, triggerObservable, targetCurrency, accountIds],
    {
      expenseBreakdown: [],
      incomeBreakdown: [],
      expenseCategoryBreakdown: [],
      incomeCategoryBreakdown: [],
      incomeVsExpenseHistory: [],
      incomeVsExpense: { income: 0, expense: 0 },
      dailyIncomeVsExpense: [],
      sankeyData: { nodes: [], links: [] },
      spendingHeatmap: [],
      calendarHeatmap: [],
    },
  );

  const loading = loadingNetWorth || loadingSnapshot;
  const error = errorNetWorth || errorSnapshot;
  const data = {
    netWorthHistory,
    ...snapshotData,
  };

  const expenses = useMemo(() => {
    const colors = REPORT_CHART_COLOR_KEYS.expense.map(colorKey => theme[colorKey]);
    return data.expenseBreakdown.map((b, i) => ({ ...b, color: colors[i % colors.length] }));
  }, [data.expenseBreakdown, theme]);

  const incomeBreakdown = useMemo(() => {
    const colors = REPORT_CHART_COLOR_KEYS.income.map(colorKey => theme[colorKey]);
    return data.incomeBreakdown.map((b, i) => ({ ...b, color: colors[i % colors.length] }));
  }, [data.incomeBreakdown, theme]);

  const expenseCategories = useMemo(() => {
    const colors = REPORT_CHART_COLOR_KEYS.expense.map(colorKey => theme[colorKey]);
    return data.expenseCategoryBreakdown.map((b, i) => ({
      ...b,
      color: colors[i % colors.length],
    }));
  }, [data.expenseCategoryBreakdown, theme]);

  const incomeCategories = useMemo(() => {
    const colors = REPORT_CHART_COLOR_KEYS.income.map(colorKey => theme[colorKey]);
    return data.incomeCategoryBreakdown.map((b, i) => ({ ...b, color: colors[i % colors.length] }));
  }, [data.incomeCategoryBreakdown, theme]);

  const updateFilter = useCallback(
    (range: DateRange, filter: PeriodFilter, accounts?: AccountId[]) => {
      if (__DEV__) {
        logger.debug('[DEBUG_REPORT] updateFilter called', {
          rangeStart: new Date(range.startDate).toISOString(),
          rangeEnd: new Date(range.endDate).toISOString(),
          filter,
        });
      }
      setDateRange(range);
      setPeriodFilter(filter);
      if (accounts !== undefined) {
        setAccountIds(accounts);
      }
    },
    [],
  );

  const { data: accounts = [] } = useObservableWithEnrichment(
    () => accountRepository.observeAll(workplaceId),
    async () => await accountRepository.findAll(workplaceId),
    [workplaceId],
    [],
  );

  return {
    accounts,
    netWorthHistory: data.netWorthHistory,
    expenses,
    incomeBreakdown,
    expenseCategories,
    incomeCategories,
    incomeVsExpenseHistory: data.incomeVsExpenseHistory,
    incomeVsExpense: data.incomeVsExpense,
    dailyIncomeVsExpense: data.dailyIncomeVsExpense,
    sankeyData: data.sankeyData,
    spendingHeatmap: data.spendingHeatmap,
    calendarHeatmap: data.calendarHeatmap,
    targetCurrency,
    loading,
    error,
    dateRange,
    periodFilter,
    accountIds,
    updateFilter,
  };
}
