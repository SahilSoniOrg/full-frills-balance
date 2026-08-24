import { AppConfig } from '@/src/constants/app-config';
import { AccountType } from '@/src/types/enums';
import { WorkplaceId, AccountId } from '@/src/types/ids';

import { accountQueryRepository } from '@/src/data/repositories/account';
import { observeWorkplaceJournalMeta } from '@/src/services/reactive/reactiveWorkplaceObserves';
import {
  calculateCalendarHeatmapFromHistory,
  calculateSpendingHeatmapFromTransactions,
} from '@/src/services/reports/heatmapCalculators';
import { calculateHistoryFromDeltas } from '@/src/services/reports/historyCalculators';
import {
  loadAccountPeriodReportingDeltas,
  loadReportingPeriodData,
} from '@/src/services/reports/reportingPeriodLoader';
import type {
  CategoryBreakdown,
  ExpenseCategory,
  HeatmapPoint,
  IncomeVsExpense,
  ReportSnapshot,
  SankeyData,
  SankeyLink,
  SankeyNode,
} from '@/src/services/reports/reportSnapshot';
import { calculateSankeyDataFromSummaries } from '@/src/services/reports/sankeyCalculator';
import { ReportAccount, ReportingDeltaInput } from '@/src/services/reports/reportTypes';
import { workplaceService } from '@/src/services/WorkplaceService';
import {
  calculateCategoryBreakdownItems,
  calculateIncomeVsExpenseSummary,
} from '@/src/services/accounting/accountingHelpers';
import { Money } from '@/src/utils/money';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import weekOfYear from 'dayjs/plugin/weekOfYear';
import { from, Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';

dayjs.extend(weekOfYear);
dayjs.extend(isoWeek);

/**
 * Report presentation types now live in the chart-neutral snapshot contract
 * (`@/src/services/reports/reportSnapshot`). Re-exported here for callers that
 * still reference the service; new consumers should import from the contract.
 */
export type {
  CategoryBreakdown,
  ExpenseCategory,
  HeatmapPoint,
  IncomeVsExpense,
  ReportSnapshot,
  SankeyData,
  SankeyLink,
  SankeyNode,
};

export class ReportService {
  /**
   * Period income vs expense totals for dashboard surfaces (e.g. accounts list rolling inflow).
   * Uses the same account-period delta loader as {@link getReportSnapshot} so totals stay aligned.
   */
  async getIncomeVsExpense(
    workplaceId: WorkplaceId,
    startDate: number,
    endDate: number,
    targetCurrency?: string,
    filterAccountIds?: string[],
  ): Promise<{ income: number; expense: number }> {
    const { currency, incomeAccounts, expenseAccounts } = await this.getReportAccounts(
      workplaceId,
      targetCurrency,
    );
    const allAccounts = this.scopeAccounts(incomeAccounts, expenseAccounts, filterAccountIds);
    const allIds = allAccounts.map(a => a.id);
    if (allIds.length === 0) return { income: 0, expense: 0 };

    const normalizedDeltas = await loadAccountPeriodReportingDeltas(
      workplaceId,
      allIds,
      startDate,
      endDate,
      currency,
      allAccounts,
    );

    return this.calculateIncomeVsExpenseFromDeltas(normalizedDeltas, allAccounts, currency);
  }

  async getReportSnapshot(
    workplaceId: WorkplaceId,
    startDate: number,
    endDate: number,
    targetCurrency?: string,
    filterAccountIds?: string[],
  ): Promise<ReportSnapshot> {
    const { currency, incomeAccounts, expenseAccounts } = await this.getReportAccounts(
      workplaceId,
      targetCurrency,
    );
    const allAccounts = this.scopeAccounts(incomeAccounts, expenseAccounts, filterAccountIds);
    const scopedIncome = incomeAccounts.filter(a => allAccounts.some(x => x.id === a.id));
    const scopedExpense = expenseAccounts.filter(a => allAccounts.some(x => x.id === a.id));

    const { accountPeriodDeltas, dailyDeltas, convertedTransactions } =
      await loadReportingPeriodData(workplaceId, allAccounts, startDate, endDate, currency);

    const incomeVsExpense = this.calculateIncomeVsExpenseFromDeltas(
      accountPeriodDeltas,
      allAccounts,
      currency,
    );
    const expenseBreakdown = this.calculateBreakdownFromDeltas(
      scopedExpense,
      accountPeriodDeltas,
      currency,
    );
    const expenseCategoryBreakdown = this.calculateCategoryBreakdownFromDeltas(
      scopedExpense,
      accountPeriodDeltas,
      currency,
    );
    const incomeCategoryBreakdown = this.calculateCategoryBreakdownFromDeltas(
      scopedIncome,
      accountPeriodDeltas,
      currency,
    );

    const history = calculateHistoryFromDeltas(dailyDeltas, startDate, endDate, currency);
    const dailyIncomeVsExpense = this.calculateDailyVsDeltas(
      dailyDeltas,
      startDate,
      endDate,
      currency,
    );

    const sankeyData = calculateSankeyDataFromSummaries(
      incomeCategoryBreakdown,
      expenseCategoryBreakdown,
    );
    const spendingHeatmap = calculateSpendingHeatmapFromTransactions(convertedTransactions);
    const calendarHeatmap = calculateCalendarHeatmapFromHistory(history);

    return {
      expenseBreakdown,
      expenseCategoryBreakdown,
      incomeCategoryBreakdown,
      incomeVsExpenseHistory: history,
      incomeVsExpense,
      dailyIncomeVsExpense,
      sankeyData,
      spendingHeatmap,
      calendarHeatmap,
    };
  }

  /**
   * Reactive version of getReportSnapshot.
   */
  observeReportSnapshot(
    workplaceId: WorkplaceId,
    startDate: number,
    endDate: number,
    targetCurrency?: string,
    filterAccountIds?: string[],
  ): Observable<ReportSnapshot> {
    return observeWorkplaceJournalMeta(workplaceId).pipe(
      switchMap(() =>
        from(
          this.getReportSnapshot(workplaceId, startDate, endDate, targetCurrency, filterAccountIds),
        ),
      ),
    );
  }

  private scopeAccounts(
    incomeAccounts: ReportAccount[],
    expenseAccounts: ReportAccount[],
    filterAccountIds?: string[],
  ): ReportAccount[] {
    let allAccounts = [...incomeAccounts, ...expenseAccounts];
    if (filterAccountIds && filterAccountIds.length > 0) {
      const filterSet = new Set(filterAccountIds);
      allAccounts = allAccounts.filter(a => filterSet.has(a.id));
    }
    return allAccounts;
  }

  private calculateBreakdownFromDeltas(
    accounts: ReportAccount[],
    deltas: ReportingDeltaInput[],
    currency: string,
  ): ExpenseCategory[] {
    const sums = new Map<string, Money>();
    for (const d of deltas) {
      const delta = Money.from(d.delta, currency);
      if (d.accountId) {
        sums.set(d.accountId, (sums.get(d.accountId) || Money.from(0, currency)).add(delta));
      }
    }

    return this.buildBreakdownFromSums(accounts, sums);
  }

  private calculateCategoryBreakdownFromDeltas(
    accounts: ReportAccount[],
    deltas: ReportingDeltaInput[],
    _currency: string,
  ): CategoryBreakdown[] {
    const accountSubtypeMap = new Map(accounts.map(a => [a.id, a.accountSubtype]));
    const items = deltas
      .map(d => {
        if (!d.accountId) return null;
        const category =
          accountSubtypeMap.get(d.accountId) || AppConfig.strings.reports.categoryOther;
        const val = d.delta ?? d.amount ?? 0;
        return { category, amount: val, accountId: d.accountId };
      })
      .filter((item): item is { category: string; amount: number; accountId: AccountId } => {
        return item !== null;
      });

    return calculateCategoryBreakdownItems(items);
  }

  private calculateIncomeVsExpenseFromDeltas(
    deltas: ReportingDeltaInput[],
    accounts: ReportAccount[],
    _currency: string,
  ): { income: number; expense: number } {
    const accountTypeMap = new Map(accounts.map(a => [a.id, a.accountType]));
    const mapped = deltas
      .map(d => {
        const accountType =
          d.accountType || (d.accountId ? accountTypeMap.get(d.accountId) : undefined);
        if (!accountType) return null;
        const val = d.delta !== undefined ? d.delta : (d.amount ?? 0);
        return { accountType, amount: val };
      })
      .filter((item): item is { accountType: AccountType; amount: number } => item !== null);

    const summary = calculateIncomeVsExpenseSummary(mapped);
    return { income: summary.income, expense: summary.expense };
  }

  private calculateDailyVsDeltas(
    deltas: ReportingDeltaInput[],
    startDate: number,
    endDate: number,
    currency: string,
  ): { date: number; income: number; expense: number }[] {
    const dailyMap = new Map<number, { income: number; expense: number }>();

    let current = dayjs(startDate).startOf('day');
    const end = dayjs(endDate).endOf('day');
    while (current.isBefore(end) || current.isSame(end, 'day')) {
      dailyMap.set(current.valueOf(), { income: 0, expense: 0 });
      current = current.add(1, 'day');
    }

    for (const d of deltas) {
      if (!d.dayStart) continue;
      const bucket = dailyMap.get(dayjs(d.dayStart).startOf('day').valueOf());
      if (!bucket) continue;

      const delta = Money.from(d.delta, currency);
      if (d.accountType === AccountType.INCOME) {
        bucket.income = Money.from(bucket.income, currency).add(delta).amount;
      } else if (d.accountType === AccountType.EXPENSE) {
        bucket.expense = Money.from(bucket.expense, currency).add(delta).amount;
      }
    }

    return Array.from(dailyMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date - b.date);
  }

  private async getReportAccounts(
    workplaceId: WorkplaceId,
    targetCurrency?: string,
  ): Promise<{
    currency: string;
    incomeAccounts: ReportAccount[];
    expenseAccounts: ReportAccount[];
  }> {
    let currency = targetCurrency;
    if (!currency) {
      currency = await workplaceService.getCurrency(workplaceId);
    }
    const [rawIncomeAccounts, rawExpenseAccounts] = await Promise.all([
      accountQueryRepository.findByType(workplaceId, AccountType.INCOME),
      accountQueryRepository.findByType(workplaceId, AccountType.EXPENSE),
    ]);

    const incomeAccounts = rawIncomeAccounts.map(account => ({
      id: account.id,
      name: account.name,
      currencyCode: account.currencyCode,
      accountType: AccountType.INCOME,
      accountSubtype: account.accountSubtype,
      color: account.color,
    }));
    const expenseAccounts = rawExpenseAccounts.map(account => ({
      id: account.id,
      name: account.name,
      currencyCode: account.currencyCode,
      accountType: AccountType.EXPENSE,
      accountSubtype: account.accountSubtype,
      color: account.color,
    }));

    return { currency, incomeAccounts, expenseAccounts };
  }

  private buildBreakdownFromSums(
    scopedAccounts: ReportAccount[],
    sums: Map<string, Money>,
  ): ExpenseCategory[] {
    const result: ExpenseCategory[] = [];
    let totalPositiveAmount = 0;
    for (const account of scopedAccounts) {
      const m = sums.get(account.id) || Money.from(0);
      if (m.amount > 0) {
        result.push({
          accountId: account.id,
          accountName: account.name,
          amount: m.amount,
          percentage: 0,
          color: account.color || undefined,
        });
        totalPositiveAmount += m.amount;
      }
    }

    result.forEach(item => {
      item.percentage = totalPositiveAmount > 0 ? (item.amount / totalPositiveAmount) * 100 : 0;
    });
    return result.sort((a, b) => b.amount - a.amount);
  }
}

export const reportService = new ReportService();
