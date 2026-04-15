import { AppConfig } from '@/src/constants/app-config';
import { REPORT_CHART_STRINGS } from '@/src/constants/report-constants';
import Account, { AccountType } from '@/src/data/models/Account';
import Transaction, { TransactionType } from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { AccountDelta, DailyDelta } from '@/src/data/repositories/TransactionTypes';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { getAccountBalanceDelta } from '@/src/utils/accountingHelpers';
import { Money } from '@/src/utils/money';
import { preferences } from '@/src/utils/preferences';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import weekOfYear from 'dayjs/plugin/weekOfYear';
import { from, Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';

dayjs.extend(weekOfYear);
dayjs.extend(isoWeek);

export interface ExpenseCategory {
  accountId: string;
  accountName: string;
  amount: number;
  percentage: number;
  color?: string; // For chart
}

export interface IncomeVsExpense {
  period: string; // Label (e.g., "Jan", "Week 1")
  startDate: number;
  endDate: number;
  income: number;
  expense: number;
}

export interface CategoryBreakdown {
  category: string; // AccountSubtype
  amount: number;
  percentage: number;
  color?: string;
}

export interface SankeyNode {
  id: string;
  name: string;
  color?: string;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

export interface SankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

export interface HeatmapPoint {
  x: number; // Day of week (0-6)
  y: number; // Row index (absolute week number)
  value: number;
  label?: string; // Optional label (e.g. day of month)
  monthLabel?: string; // Optional month label (e.g. "Jan") for rows
  timestamp?: number; // Exact date/time for this point
}

export interface ReportSnapshot {
  expenseBreakdown: ExpenseCategory[];
  incomeBreakdown: ExpenseCategory[];
  expenseCategoryBreakdown: CategoryBreakdown[];
  incomeCategoryBreakdown: CategoryBreakdown[];
  incomeVsExpenseHistory: IncomeVsExpense[];
  incomeVsExpense: { income: number; expense: number };
  dailyIncomeVsExpense: { date: number; income: number; expense: number }[];
  sankeyData: SankeyData;
  spendingHeatmap: HeatmapPoint[];
  calendarHeatmap: HeatmapPoint[]; // reuse HeatmapPoint: x=dayOfWeek, y=weekOfMonth
}

interface ConvertedReportTransaction {
  accountId: string;
  accountType: AccountType;
  transactionType: TransactionType;
  transactionDate: number;
  amount: number;
}

interface ReportAccount {
  id: string;
  name: string;
  currencyCode?: string;
  accountType: AccountType;
  accountSubtype?: string;
}

interface ReportingDelta {
  accountId?: string;
  currencyCode: string;
  delta: number;
  dayStart?: number;
  accountType?: string;
}

export class ReportService {
  /**
   * Aggregates expenses by account for a period.
   */
  async getExpenseBreakdown(
    startDate: number,
    endDate: number,
    targetCurrency?: string,
    accountIds?: string[],
  ): Promise<ExpenseCategory[]> {
    return this.getBreakdownInternal(
      AccountType.EXPENSE,
      startDate,
      endDate,
      targetCurrency,
      accountIds,
    );
  }

  /**
   * Aggregates income by account for a period.
   */
  async getIncomeBreakdown(
    startDate: number,
    endDate: number,
    targetCurrency?: string,
    accountIds?: string[],
  ): Promise<ExpenseCategory[]> {
    return this.getBreakdownInternal(
      AccountType.INCOME,
      startDate,
      endDate,
      targetCurrency,
      accountIds,
    );
  }

  /**
   * Reactive version of getExpenseBreakdown.
   */
  observeExpenseBreakdown(
    startDate: number,
    endDate: number,
    targetCurrency?: string,
    accountIds?: string[],
  ): Observable<ExpenseCategory[]> {
    return journalRepository
      .observeStatusMeta()
      .pipe(
        switchMap(() =>
          from(this.getExpenseBreakdown(startDate, endDate, targetCurrency, accountIds)),
        ),
      );
  }

  /**
   * Reactive version of getIncomeBreakdown.
   */
  observeIncomeBreakdown(
    startDate: number,
    endDate: number,
    targetCurrency?: string,
    accountIds?: string[],
  ): Observable<ExpenseCategory[]> {
    return journalRepository
      .observeStatusMeta()
      .pipe(
        switchMap(() =>
          from(this.getIncomeBreakdown(startDate, endDate, targetCurrency, accountIds)),
        ),
      );
  }

  private async getBreakdownInternal(
    type: AccountType,
    startDate: number,
    endDate: number,
    targetCurrency?: string,
    filterAccountIds?: string[],
  ): Promise<ExpenseCategory[]> {
    const { currency, incomeAccounts, expenseAccounts } =
      await this.getReportAccounts(targetCurrency);
    let accounts = type === AccountType.INCOME ? incomeAccounts : expenseAccounts;

    if (filterAccountIds && filterAccountIds.length > 0) {
      accounts = accounts.filter(a => filterAccountIds.includes(a.id));
    }

    const accountIds = accounts.map(a => a.id);
    if (accountIds.length === 0) return [];

    const normalizedDeltas = await this.getScopedDeltas<AccountDelta>(
      accountIds,
      startDate,
      endDate,
      currency,
      accounts,
      (ids, start, end) => transactionRawRepository.getAccountDeltasGroupedRaw(ids, start, end),
    );

    return this.calculateBreakdownFromDeltas(accounts, normalizedDeltas, currency);
  }

  private calculateBreakdownFromDeltas(
    accounts: ReportAccount[],
    deltas: ReportingDelta[] | AccountDelta[],
    currency: string,
  ): ExpenseCategory[] {
    const sums = new Map<string, Money>();
    for (const d of deltas) {
      const delta = Money.from(d.delta, currency);
      const accountId = (d as any).accountId;
      if (accountId) {
        sums.set(accountId, (sums.get(accountId) || Money.from(0, currency)).add(delta));
      }
    }

    return this.buildBreakdownFromSums(accounts, sums);
  }

  /**
   * Aggregates by category (AccountSubtype).
   */
  async getCategoryBreakdown(
    type: AccountType,
    startDate: number,
    endDate: number,
    targetCurrency?: string,
    filterAccountIds?: string[],
  ): Promise<CategoryBreakdown[]> {
    const { currency, incomeAccounts, expenseAccounts } =
      await this.getReportAccounts(targetCurrency);
    let accounts = type === AccountType.INCOME ? incomeAccounts : expenseAccounts;

    if (filterAccountIds && filterAccountIds.length > 0) {
      accounts = accounts.filter(a => filterAccountIds.includes(a.id));
    }

    const accountIds = accounts.map(a => a.id);
    if (accountIds.length === 0) return [];

    const normalizedDeltas = await this.getScopedDeltas<AccountDelta>(
      accountIds,
      startDate,
      endDate,
      currency,
      accounts,
      (ids, start, end) => transactionRawRepository.getAccountDeltasGroupedRaw(ids, start, end),
    );

    return this.calculateCategoryBreakdownFromDeltas(accounts, normalizedDeltas, currency);
  }

  private calculateCategoryBreakdownFromDeltas(
    accounts: ReportAccount[],
    deltas: ReportingDelta[] | AccountDelta[],
    currency: string,
  ): CategoryBreakdown[] {
    const accountSubtypeMap = new Map(accounts.map(a => [a.id, a.accountSubtype]));
    const sumsMap = new Map<string, Money>();
    let grandTotal = Money.from(0, currency);

    for (const d of deltas) {
      const accountId = (d as any).accountId;
      if (!accountId) continue;
      const subtype = accountSubtypeMap.get(accountId) || REPORT_CHART_STRINGS.categoryOther;
      const delta = Money.from(d.delta, currency);
      const current = sumsMap.get(subtype) || Money.from(0, currency);
      sumsMap.set(subtype, current.add(delta));
      if (delta.amount > 0) {
        grandTotal = grandTotal.add(delta);
      }
    }

    const breakdown = Array.from(sumsMap.entries())
      .map(([category, money]) => ({
        category,
        amount: money.amount,
        percentage: grandTotal.amount > 0 ? (money.amount / grandTotal.amount) * 100 : 0,
      }))
      .filter(item => item.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    return breakdown;
  }

  /**
   * Calculates Income vs Expense for the period.
   */
  async getIncomeVsExpense(
    startDate: number,
    endDate: number,
    targetCurrency?: string,
    filterAccountIds?: string[],
  ): Promise<{ income: number; expense: number }> {
    const { currency, incomeAccounts, expenseAccounts } =
      await this.getReportAccounts(targetCurrency);
    let allAccounts = [...incomeAccounts, ...expenseAccounts];

    if (filterAccountIds && filterAccountIds.length > 0) {
      allAccounts = allAccounts.filter(a => filterAccountIds.includes(a.id));
    }

    const allIds = allAccounts.map(a => a.id);
    if (allIds.length === 0) return { income: 0, expense: 0 };

    const normalizedDeltas = await this.getScopedDeltas<AccountDelta>(
      allIds,
      startDate,
      endDate,
      currency,
      allAccounts,
      (ids, start, end) => transactionRawRepository.getAccountDeltasGroupedRaw(ids, start, end),
    );

    return this.calculateIncomeVsExpenseFromDeltas(normalizedDeltas, allAccounts, currency);
  }

  private calculateIncomeVsExpenseFromDeltas(
    deltas: ReportingDelta[],
    accounts: ReportAccount[],
    currency: string,
  ): { income: number; expense: number } {
    const accountTypeMap = new Map(accounts.map(a => [a.id, a.accountType]));
    let income = Money.from(0, currency);
    let expense = Money.from(0, currency);

    for (const d of deltas) {
      const type = d.accountType || (d.accountId ? accountTypeMap.get(d.accountId) : undefined);
      const delta = Money.from(d.delta, currency);
      if (type === AccountType.INCOME) {
        income = income.add(delta);
      } else if (type === AccountType.EXPENSE) {
        expense = expense.add(delta);
      }
    }

    return { income: income.amount, expense: expense.amount };
  }

  /**
   * Calculates Income vs Expense from an in-memory transaction list.
   */
  async getIncomeVsExpenseFromTransactions(
    transactions: Transaction[],
    accounts: Account[],
    startDate: number,
    endDate: number,
    targetCurrency?: string,
  ): Promise<{ income: number; expense: number }> {
    const currency = targetCurrency || preferences.defaultCurrencyCode || AppConfig.defaultCurrency;
    const accountMap = new Map(accounts.map(a => [a.id, a]));

    let income = Money.from(0, currency);
    let expense = Money.from(0, currency);

    const conversions = await Promise.all(
      transactions.map(async tx => {
        if (tx.transactionDate < startDate || tx.transactionDate > endDate) return null;
        const acc = accountMap.get(tx.accountId);
        if (
          !acc ||
          (acc.accountType !== AccountType.INCOME && acc.accountType !== AccountType.EXPENSE)
        )
          return null;

        const { convertedAmount } = await exchangeRateService.convert(
          tx.amount,
          tx.currencyCode || acc.currencyCode || currency,
          currency,
        );

        return {
          amount: Money.from(convertedAmount, currency),
          type: acc.accountType,
          transactionType: tx.transactionType,
        };
      }),
    );

    for (const conv of conversions) {
      if (!conv) continue;
      const delta = Money.from(
        getAccountBalanceDelta(conv.amount.amount, conv.type, conv.transactionType),
        currency,
      );
      if (conv.type === AccountType.INCOME) {
        income = income.add(delta);
      } else {
        expense = expense.add(delta);
      }
    }

    return { income: income.amount, expense: expense.amount };
  }

  /**
   * Calculates Income vs Expense history bucketed by month or day.
   */
  async getIncomeVsExpenseHistory(
    startDate: number,
    endDate: number,
    targetCurrency?: string,
    filterAccountIds?: string[],
  ): Promise<IncomeVsExpense[]> {
    const { currency, incomeAccounts, expenseAccounts } =
      await this.getReportAccounts(targetCurrency);
    let allAccounts = [...incomeAccounts, ...expenseAccounts];

    if (filterAccountIds && filterAccountIds.length > 0) {
      allAccounts = allAccounts.filter(a => filterAccountIds.includes(a.id));
    }

    const allIds = allAccounts.map(a => a.id);
    if (allIds.length === 0) return [];

    const normalizedDeltas = await this.getScopedDeltas<DailyDelta>(
      allIds,
      startDate,
      endDate,
      currency,
      allAccounts,
      (ids, start, end) => transactionRawRepository.getDailyDeltasGroupedRaw(ids, start, end),
    );

    return this.calculateHistoryFromDeltas(normalizedDeltas, startDate, endDate, currency);
  }

  private calculateHistoryFromDeltas(
    deltas: ReportingDelta[],
    startDate: number,
    endDate: number,
    currency: string,
  ): IncomeVsExpense[] {
    const historyMap = this.initializeHistoryMap(startDate, endDate);
    const { bucketUnit } = this.getHistoryConfig(startDate, endDate);

    for (const d of deltas) {
      const bucketKey = dayjs(d.dayStart).startOf(bucketUnit).valueOf();
      const bucket = historyMap.get(bucketKey);
      if (!bucket) continue;

      const delta = Money.from(d.delta, currency);
      if (d.accountType === AccountType.INCOME) {
        bucket.income = Money.from(bucket.income, currency).add(delta).amount;
      } else if (d.accountType === AccountType.EXPENSE) {
        bucket.expense = Money.from(bucket.expense, currency).add(delta).amount;
      }
    }

    return Array.from(historyMap.values()).sort((a, b) => a.startDate - b.startDate);
  }

  /**
   * Calculates Daily Income vs Expense for the period.
   */
  async getDailyIncomeVsExpense(
    startDate: number,
    endDate: number,
    targetCurrency?: string,
    filterAccountIds?: string[],
  ): Promise<{ date: number; income: number; expense: number }[]> {
    const { currency, incomeAccounts, expenseAccounts } =
      await this.getReportAccounts(targetCurrency);
    let allAccounts = [...incomeAccounts, ...expenseAccounts];

    if (filterAccountIds && filterAccountIds.length > 0) {
      allAccounts = allAccounts.filter(a => filterAccountIds.includes(a.id));
    }

    const allIds = allAccounts.map(a => a.id);
    if (allIds.length === 0) return [];

    const normalizedDeltas = await this.getScopedDeltas<DailyDelta>(
      allIds,
      startDate,
      endDate,
      currency,
      allAccounts,
      (ids, start, end) => transactionRawRepository.getDailyDeltasGroupedRaw(ids, start, end),
    );

    return this.calculateDailyVsDeltas(normalizedDeltas, startDate, endDate, currency);
  }

  private calculateDailyVsDeltas(
    deltas: ReportingDelta[],
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

  /** Helper to centralize currency conversion and rate caching */
  private async getNormalizedDeltas<T extends { currencyCode: string; delta: number }>(
    deltas: T[],
    targetCurrency: string,
  ): Promise<T[]> {
    const rates = new Map<string, number>();
    const results = [];

    for (const d of deltas) {
      if (!rates.has(d.currencyCode)) {
        const { convertedAmount } = await exchangeRateService.convert(
          1,
          d.currencyCode,
          targetCurrency,
        );
        rates.set(d.currencyCode, convertedAmount);
      }
      results.push({
        ...d,
        delta: d.delta * (rates.get(d.currencyCode) || 1),
      });
    }
    return results;
  }

  /** Helper to map converted transactions into signed delta objects for reporting */
  private mapToReportingDeltas(
    transactions: ConvertedReportTransaction[],
    accounts: ReportAccount[],
    targetCurrency: string,
  ): ReportingDelta[] {
    const accountMap = new Map(accounts.map(a => [a.id, a]));
    return transactions.map(tx => {
      const acc = accountMap.get(tx.accountId);
      const type = acc?.accountType || tx.accountType;
      const delta = getAccountBalanceDelta(tx.amount, type, tx.transactionType);

      return {
        accountId: tx.accountId,
        currencyCode: targetCurrency,
        delta,
        dayStart: dayjs(tx.transactionDate).startOf('day').valueOf(),
        accountType: type,
      };
    });
  }

  /** Helper to fetch deltas from raw DB or fallback to manual conversion if empty */
  private async getScopedDeltas<
    T extends { currencyCode: string; delta: number; dayStart?: number; accountId?: string },
  >(
    accountIds: string[],
    startDate: number,
    endDate: number,
    targetCurrency: string,
    accounts: ReportAccount[],
    fetchRaw: (ids: string[], start: number, end: number) => Promise<T[]>,
  ): Promise<T[]> {
    const items = await fetchRaw(accountIds, startDate, endDate);

    if (items.length === 0 && accountIds.length > 0) {
      const converted = await this.getConvertedReportTransactions(
        startDate,
        endDate,
        targetCurrency,
        accounts,
      );
      const accountTypeMap = new Map(accounts.map(a => [a.id, a.accountType]));

      return converted
        .filter(tx => accountIds.includes(tx.accountId))
        .map(tx => {
          const type = accountTypeMap.get(tx.accountId) || tx.accountType;
          const delta = getAccountBalanceDelta(tx.amount, type, tx.transactionType);

          return {
            accountId: tx.accountId,
            currencyCode: targetCurrency,
            delta,
            dayStart: tx.transactionDate,
            accountType: type,
          } as unknown as T;
        });
    }

    return this.getNormalizedDeltas(items, targetCurrency);
  }

  async getReportSnapshot(
    startDate: number,
    endDate: number,
    targetCurrency?: string,
    filterAccountIds?: string[],
  ): Promise<ReportSnapshot> {
    const { currency, incomeAccounts, expenseAccounts } =
      await this.getReportAccounts(targetCurrency);
    let allAccounts = [...incomeAccounts, ...expenseAccounts];
    if (filterAccountIds && filterAccountIds.length > 0) {
      allAccounts = allAccounts.filter(a => filterAccountIds.includes(a.id));
    }

    const allIds = allAccounts.map(a => a.id);
    const transactions = await transactionRepository.findByAccountsAndDateRange(
      allIds,
      startDate,
      endDate,
    );

    // Convert and map once
    const converted = await this.getConvertedReportTransactionsFromRaw(
      transactions,
      currency,
      allAccounts,
    );
    const deltas = this.mapToReportingDeltas(converted, allAccounts, currency);

    const incomeVsExpense = this.calculateIncomeVsExpenseFromDeltas(deltas, allAccounts, currency);
    const expenseBreakdown = this.calculateBreakdownFromDeltas(expenseAccounts, deltas, currency);
    const incomeBreakdown = this.calculateBreakdownFromDeltas(incomeAccounts, deltas, currency);
    const expenseCategoryBreakdown = this.calculateCategoryBreakdownFromDeltas(
      expenseAccounts,
      deltas,
      currency,
    );
    const incomeCategoryBreakdown = this.calculateCategoryBreakdownFromDeltas(
      incomeAccounts,
      deltas,
      currency,
    );

    const history = this.calculateHistoryFromDeltas(deltas, startDate, endDate, currency);
    const dailyIncomeVsExpense = this.calculateDailyVsDeltas(deltas, startDate, endDate, currency);

    const sankeyData = this.calculateSankeyDataFromSummaries(
      incomeBreakdown,
      expenseCategoryBreakdown,
    );
    const spendingHeatmap = this.calculateSpendingHeatmapFromTransactions(converted);
    const calendarHeatmap = this.calculateCalendarHeatmapFromHistory(history);

    return {
      expenseBreakdown,
      incomeBreakdown,
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

  private calculateSankeyDataFromSummaries(
    incomeSummary: ExpenseCategory[],
    expenseCategorySummary: CategoryBreakdown[],
  ): SankeyData {
    const nodes: SankeyNode[] = [
      { id: 'total_income', name: 'Total Income' },
      { id: 'surplus', name: 'Savings/Surplus' },
    ];

    const links: SankeyLink[] = [];

    // Income -> Total
    incomeSummary.forEach(inc => {
      nodes.push({ id: `inc_${inc.accountId}`, name: inc.accountName });
      links.push({ source: `inc_${inc.accountId}`, target: 'total_income', value: inc.amount });
    });

    // Total -> Categories
    let totalExpense = 0;
    expenseCategorySummary.forEach(cat => {
      nodes.push({ id: `exp_${cat.category}`, name: cat.category });
      links.push({ source: 'total_income', target: `exp_${cat.category}`, value: cat.amount });
      totalExpense += cat.amount;
    });

    // Total -> Surplus
    const totalIncome = incomeSummary.reduce((acc, inc) => acc + inc.amount, 0);
    const surplus = Math.max(0, totalIncome - totalExpense);

    if (surplus > 0) {
      links.push({ source: 'total_income', target: 'surplus', value: surplus });
    }

    return { nodes, links };
  }

  private calculateCalendarHeatmapFromHistory(history: IncomeVsExpense[]): HeatmapPoint[] {
    if (history.length === 0) return [];
    const startWeek = dayjs(history[0].startDate).startOf('week').valueOf();

    let lastMonth = -1;

    return history.map(h => {
      const date = dayjs(h.startDate);
      const currentMonth = date.month();
      let monthLabel: string | undefined;

      // Set label if month changes or it's the very first point
      if (currentMonth !== lastMonth) {
        monthLabel = date.format('MMM');
        lastMonth = currentMonth;
      }

      return {
        x: date.day(),
        y: Math.floor(dayjs(h.startDate).diff(startWeek, 'week')),
        value: h.expense,
        label: date.format('D'),
        timestamp: h.startDate,
        monthLabel,
      };
    });
  }

  private async getConvertedReportTransactionsFromRaw(
    transactions: Transaction[],
    targetCurrency: string,
    accounts: ReportAccount[],
  ): Promise<ConvertedReportTransaction[]> {
    return Promise.all(
      transactions.map(async tx => {
        const { convertedAmount } = await exchangeRateService.convert(
          tx.amount,
          tx.currencyCode,
          targetCurrency,
        );
        const account = accounts.find(a => a.id === tx.accountId);
        return {
          accountId: tx.accountId,
          amount: convertedAmount,
          transactionType: tx.transactionType,
          transactionDate: tx.transactionDate,
          accountType: account?.accountType || AccountType.EXPENSE,
        };
      }),
    );
  }

  /**
   * Aggregates money flow for a Sankey diagram.
   * Income Sources -> Total Income -> Expense Categories -> Surplus.
   */
  async getSankeyData(
    startDate: number,
    endDate: number,
    targetCurrency?: string,
    filterAccountIds?: string[],
  ): Promise<SankeyData> {
    const [incomeSummary, expenseCategorySummary] = await Promise.all([
      this.getIncomeBreakdown(startDate, endDate, targetCurrency, filterAccountIds),
      this.getCategoryBreakdown(
        AccountType.EXPENSE,
        startDate,
        endDate,
        targetCurrency,
        filterAccountIds,
      ),
    ]);

    return this.calculateSankeyDataFromSummaries(incomeSummary, expenseCategorySummary);
  }

  /**
   * Aggregates spending density by day and hour.
   */
  async getSpendingHeatmapData(
    startDate: number,
    endDate: number,
    targetCurrency?: string,
    filterAccountIds?: string[],
  ): Promise<HeatmapPoint[]> {
    const { currency, expenseAccounts } = await this.getReportAccounts(targetCurrency);
    let accounts = expenseAccounts;
    if (filterAccountIds && filterAccountIds.length > 0) {
      accounts = accounts.filter(a => filterAccountIds.includes(a.id));
    }

    const accountIds = accounts.map(a => a.id);
    const transactions = await transactionRepository.findByAccountsAndDateRange(
      accountIds,
      startDate,
      endDate,
    );
    const converted = await this.getConvertedReportTransactionsFromRaw(
      transactions,
      currency,
      accounts,
    );

    return this.calculateSpendingHeatmapFromTransactions(converted);
  }

  private calculateSpendingHeatmapFromTransactions(
    transactions: ConvertedReportTransaction[],
  ): HeatmapPoint[] {
    const densityMap = new Map<string, number>();

    for (const tx of transactions) {
      if (tx.transactionType !== TransactionType.DEBIT) continue;

      const dt = dayjs(tx.transactionDate);
      const key = `${dt.day()}_${dt.hour()}`;
      densityMap.set(key, (densityMap.get(key) || 0) + tx.amount);
    }

    const points: HeatmapPoint[] = [];
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const value = densityMap.get(`${day}_${hour}`) || 0;
        points.push({ x: day, y: hour, value });
      }
    }
    return points;
  }

  /**
   * Reactive version of getReportSnapshot.
   */
  observeReportSnapshot(
    startDate: number,
    endDate: number,
    targetCurrency?: string,
    filterAccountIds?: string[],
  ): Observable<ReportSnapshot> {
    return journalRepository
      .observeStatusMeta()
      .pipe(
        switchMap(() =>
          from(this.getReportSnapshot(startDate, endDate, targetCurrency, filterAccountIds)),
        ),
      );
  }

  private async getReportAccounts(targetCurrency?: string): Promise<{
    currency: string;
    incomeAccounts: ReportAccount[];
    expenseAccounts: ReportAccount[];
  }> {
    const currency = targetCurrency || preferences.defaultCurrencyCode || AppConfig.defaultCurrency;
    const [rawIncomeAccounts, rawExpenseAccounts] = await Promise.all([
      accountRepository.findByType(AccountType.INCOME),
      accountRepository.findByType(AccountType.EXPENSE),
    ]);

    const incomeAccounts = rawIncomeAccounts.map(account => ({
      id: account.id,
      name: account.name,
      currencyCode: account.currencyCode,
      accountType: AccountType.INCOME,
      accountSubtype: account.accountSubtype,
    }));
    const expenseAccounts = rawExpenseAccounts.map(account => ({
      id: account.id,
      name: account.name,
      currencyCode: account.currencyCode,
      accountType: AccountType.EXPENSE,
      accountSubtype: account.accountSubtype,
    }));

    return { currency, incomeAccounts, expenseAccounts };
  }

  private async getConvertedReportTransactions(
    startDate: number,
    endDate: number,
    currency: string,
    accounts: ReportAccount[],
  ): Promise<ConvertedReportTransaction[]> {
    const accountIds = accounts.map(account => account.id);
    if (accountIds.length === 0) return [];

    const accountTypeById = new Map(accounts.map(account => [account.id, account.accountType]));
    const accountCurrencyById = new Map(
      accounts.map(account => [account.id, account.currencyCode]),
    );
    const transactions = await transactionRepository.findByAccountsAndDateRange(
      accountIds,
      startDate,
      endDate,
    );

    const converted = await Promise.all(
      transactions.map(async tx => {
        const accountType = accountTypeById.get(tx.accountId);
        if (!accountType) return null;

        const { convertedAmount } = await exchangeRateService.convert(
          tx.amount,
          tx.currencyCode || accountCurrencyById.get(tx.accountId) || currency,
          currency,
        );

        return {
          accountId: tx.accountId,
          accountType,
          transactionType: tx.transactionType,
          transactionDate: tx.transactionDate,
          amount: convertedAmount,
        } as ConvertedReportTransaction;
      }),
    );

    return converted.filter((row): row is ConvertedReportTransaction => !!row);
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
        });
        totalPositiveAmount += m.amount;
      }
    }

    result.forEach(item => {
      item.percentage = totalPositiveAmount > 0 ? (item.amount / totalPositiveAmount) * 100 : 0;
    });
    return result.sort((a, b) => b.amount - a.amount);
  }

  private getHistoryConfig(startDate: number, endDate: number) {
    const start = dayjs(startDate);
    const end = dayjs(endDate);
    const diffDays = end.diff(start, 'day');
    const monthlyThreshold = AppConfig.defaults.reportMonthlyBucketThresholdDays;
    const bucketUnit: 'day' | 'month' = diffDays > monthlyThreshold ? 'month' : 'day';
    const format = diffDays > monthlyThreshold ? 'MMM YYYY' : 'DD MMM';
    return { bucketUnit, format };
  }

  private initializeHistoryMap(startDate: number, endDate: number): Map<number, IncomeVsExpense> {
    const historyMap = new Map<number, IncomeVsExpense>();
    const start = dayjs(startDate);
    const end = dayjs(endDate);
    const { bucketUnit, format } = this.getHistoryConfig(startDate, endDate);

    let current = start.startOf(bucketUnit);
    while (current.isBefore(end) || current.isSame(end, bucketUnit)) {
      const bucketStart = current.startOf(bucketUnit).valueOf();
      const bucketEnd = current.endOf(bucketUnit).valueOf();
      historyMap.set(bucketStart, {
        period: current.format(format),
        startDate: Math.max(bucketStart, startDate),
        endDate: Math.min(bucketEnd, endDate),
        income: 0,
        expense: 0,
      });
      current = current.add(1, bucketUnit);
    }
    return historyMap;
  }
  /**
   * Aggregates spending by day of week and week of month (Calendar view).
   */
  async getCalendarHeatmapData(
    startDate: number,
    endDate: number,
    targetCurrency?: string,
    filterAccountIds?: string[],
  ): Promise<HeatmapPoint[]> {
    const { currency, expenseAccounts } = await this.getReportAccounts(targetCurrency);
    let accounts = expenseAccounts;
    if (filterAccountIds && filterAccountIds.length > 0) {
      accounts = accounts.filter(a => filterAccountIds.includes(a.id));
    }
    const accountIds = accounts.map(a => a.id);
    if (accountIds.length === 0) return [];

    const transactions = await transactionRepository.findByAccountsAndDateRange(
      accountIds,
      startDate,
      endDate,
    );
    const densityMap = new Map<string, number>();

    // Populate densityMap with amounts per day (YYYY-MM-DD)
    for (const tx of transactions) {
      if (tx.transactionType !== TransactionType.DEBIT) continue;

      const dt = dayjs(tx.transactionDate);
      const key = dt.format('YYYY-MM-DD'); // New key format for daily aggregation

      const { convertedAmount } = await exchangeRateService.convert(
        tx.amount,
        tx.currencyCode || currency,
        currency,
      );

      densityMap.set(key, (densityMap.get(key) || 0) + convertedAmount);
    }

    const points: HeatmapPoint[] = [];
    const start = dayjs(startDate).startOf('week'); // Align with start of week (Sunday)
    const end = dayjs(endDate).endOf('day');

    let current = start;
    let lastMonth = -1;

    while (current.isBefore(end) || current.isSame(end, 'day')) {
      const x = current.day(); // 0-6 (Sunday=0, Saturday=6)
      const absoluteWeekIndex = Math.floor(current.diff(start, 'weeks'));
      const key = current.format('YYYY-MM-DD');

      // Monthly Label (e.g. "Jan") only on the first row it appears
      let monthLabel: string | undefined;
      if (current.month() !== lastMonth) {
        monthLabel = current.format('MMM');
        lastMonth = current.month();
      }

      const value = densityMap.get(key) || 0;
      points.push({
        x,
        y: absoluteWeekIndex,
        value,
        label: current.date().toString(),
        monthLabel,
        timestamp: current.valueOf(),
      });
      current = current.add(1, 'day');
    }

    return points;
  }
}

export const reportService = new ReportService();
