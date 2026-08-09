import { Theme } from '@/src/constants/design-tokens';
import {
  colorizeBreakdownItems,
  getReportChartPalettes,
} from '@/src/features/reports/hooks/reportBreakdownColors';
import { useObservable } from '@/src/hooks/useObservable';
import { reportService } from '@/src/services/report-service';
import {
  CategoryBreakdown,
  ExpenseCategory,
  IncomeVsExpense,
  SankeyData,
} from '@/src/services/reports/reportSnapshot';
import { emptySankeyData } from '@/src/services/reports/sankeyCalculator';
import { AccountId, WorkplaceId } from '@/src/types/domain';
import { useMemo } from 'react';
import { of } from 'rxjs';
import { map } from 'rxjs/operators';

export type ReportPeriodSnapshot = {
  expenses: ExpenseCategory[];
  expenseCategories: CategoryBreakdown[];
  incomeCategories: CategoryBreakdown[];
  sankeyData: SankeyData;
  incomeVsExpense: { income: number; expense: number };
};

const emptyPeriodSnapshot = (): ReportPeriodSnapshot => ({
  expenses: [],
  expenseCategories: [],
  incomeCategories: [],
  sankeyData: emptySankeyData(),
  incomeVsExpense: { income: 0, expense: 0 },
});

interface UseSelectedReportPeriodParams {
  workplaceId: WorkplaceId;
  accountIds: AccountId[];
  targetCurrency: string;
  incomeVsExpenseHistory: IncomeVsExpense[];
  selectedBarIndex: number | undefined;
  theme: Theme;
}

/**
 * Resolves chart bar selection into a scoped date range and report snapshot.
 * Single source of truth for sub-period filtering across Overview and Spending.
 */
export function useSelectedReportPeriod({
  workplaceId,
  accountIds,
  targetCurrency,
  incomeVsExpenseHistory,
  selectedBarIndex,
  theme,
}: UseSelectedReportPeriodParams) {
  const palettes = useMemo(() => getReportChartPalettes(theme), [theme]);

  const selectedPeriod = useMemo(() => {
    if (selectedBarIndex === undefined || !incomeVsExpenseHistory[selectedBarIndex]) {
      return null;
    }
    const item = incomeVsExpenseHistory[selectedBarIndex];
    return { start: item.startDate, end: item.endDate };
  }, [selectedBarIndex, incomeVsExpenseHistory]);

  const label = useMemo(() => {
    if (selectedBarIndex === undefined) return null;
    return incomeVsExpenseHistory[selectedBarIndex]?.period ?? null;
  }, [selectedBarIndex, incomeVsExpenseHistory]);

  const { data: snapshot } = useObservable(
    () => {
      if (!selectedPeriod) return of(emptyPeriodSnapshot());

      return reportService
        .observeReportSnapshot(
          workplaceId,
          selectedPeriod.start,
          selectedPeriod.end,
          targetCurrency,
          accountIds.length > 0 ? accountIds : undefined,
        )
        .pipe(
          map(reportSnapshot => ({
            expenses: colorizeBreakdownItems(reportSnapshot.expenseBreakdown, palettes.expense),
            expenseCategories: colorizeBreakdownItems(
              reportSnapshot.expenseCategoryBreakdown,
              palettes.expense,
            ),
            incomeCategories: colorizeBreakdownItems(
              reportSnapshot.incomeCategoryBreakdown,
              palettes.income,
            ),
            sankeyData: reportSnapshot.sankeyData,
            incomeVsExpense: reportSnapshot.incomeVsExpense,
          })),
        );
    },
    [selectedPeriod, targetCurrency, accountIds, palettes, workplaceId],
    emptyPeriodSnapshot(),
  );

  return {
    isActive: selectedPeriod !== null,
    label,
    range: selectedPeriod,
    snapshot,
  };
}
