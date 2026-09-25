import { AppConfig } from '@/src/constants/app-config';
import { AccountType } from '@/src/types/enums';
import { WorkplaceId, AccountId } from '@/src/types/ids';

import { accountQueryRepository } from '@/src/data/repositories/account';
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
import { getCurrencyPrecision } from '@/src/utils/currencyPrecision';
import { roundToPrecision } from '@/src/utils/money';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import weekOfYear from 'dayjs/plugin/weekOfYear';

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
  ): Promise<{ income: number; expense: number; hasUnvaluedEntries?: boolean }> {
    const { currency, incomeAccounts, expenseAccounts } = await this.getReportAccounts(
      workplaceId,
      targetCurrency,
    );
    const allAccounts = this.scopeAccounts(incomeAccounts, expenseAccounts, filterAccountIds);
    const allIds = allAccounts.map(a => a.id);
    if (allIds.length === 0) return { income: 0, expense: 0 };

    const loaded = await loadAccountPeriodReportingDeltas(
      workplaceId,
      allIds,
      startDate,
      endDate,
      currency,
      allAccounts,
    );

    return {
      ...this.calculateIncomeVsExpenseFromDeltas(loaded.deltas, allAccounts, currency),
      ...(loaded.hasUnvaluedEntries ? { hasUnvaluedEntries: true } : {}),
    };
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

    const { accountPeriodDeltas, dailyDeltas, convertedTransactions, hasUnvaluedEntries } =
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
    const spendingHeatmap = calculateSpendingHeatmapFromTransactions(
      convertedTransactions,
      getCurrencyPrecision(currency),
    );
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
      ...(hasUnvaluedEntries ? { hasUnvaluedEntries: true } : {}),
    };
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
    const precision = getCurrencyPrecision(currency);
    const sums = new Map<string, number>();
    for (const d of deltas) {
      if (d.accountId) {
        sums.set(d.accountId, roundToPrecision((sums.get(d.accountId) || 0) + d.delta, precision));
      }
    }

    return this.buildBreakdownFromSums(accounts, sums);
  }

  private calculateCategoryBreakdownFromDeltas(
    accounts: ReportAccount[],
    deltas: ReportingDeltaInput[],
    currency: string,
  ): CategoryBreakdown[] {
    const accountSubtypeMap = new Map(accounts.map(a => [a.id, a.accountSubtype]));
    const items = deltas
      .map(d => {
        // The same period deltas power both category views. Only keep deltas
        // belonging to the accounts for the view being built; otherwise
        // income accounts leak into expense as "Other" (and vice versa).
        if (!d.accountId || !accountSubtypeMap.has(d.accountId)) return null;
        const category =
          accountSubtypeMap.get(d.accountId) || AppConfig.strings.reports.categoryOther;
        const val = d.delta ?? d.amount ?? 0;
        return { category, amount: val, accountId: d.accountId };
      })
      .filter((item): item is { category: string; amount: number; accountId: AccountId } => {
        return item !== null;
      });

    return calculateCategoryBreakdownItems(items, getCurrencyPrecision(currency));
  }

  private calculateIncomeVsExpenseFromDeltas(
    deltas: ReportingDeltaInput[],
    accounts: ReportAccount[],
    currency: string,
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

    const summary = calculateIncomeVsExpenseSummary(mapped, getCurrencyPrecision(currency));
    return { income: summary.income, expense: summary.expense };
  }

  private calculateDailyVsDeltas(
    deltas: ReportingDeltaInput[],
    startDate: number,
    endDate: number,
    currency: string,
  ): { date: number; income: number; expense: number }[] {
    const dailyMap = new Map<number, { income: number; expense: number }>();
    const precision = getCurrencyPrecision(currency);

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

      if (d.accountType === AccountType.INCOME) {
        bucket.income = roundToPrecision(bucket.income + d.delta, precision);
      } else if (d.accountType === AccountType.EXPENSE) {
        bucket.expense = roundToPrecision(bucket.expense + d.delta, precision);
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
    sums: Map<string, number>,
  ): ExpenseCategory[] {
    const result: ExpenseCategory[] = [];
    let totalPositiveAmount = 0;
    for (const account of scopedAccounts) {
      const amount = sums.get(account.id) || 0;
      if (amount > 0) {
        result.push({
          accountId: account.id,
          accountName: account.name,
          amount,
          percentage: 0,
          color: account.color || undefined,
        });
        totalPositiveAmount += amount;
      }
    }

    result.forEach(item => {
      item.percentage = totalPositiveAmount > 0 ? (item.amount / totalPositiveAmount) * 100 : 0;
    });
    return result.sort((a, b) => b.amount - a.amount);
  }
}

export const reportService = new ReportService();
