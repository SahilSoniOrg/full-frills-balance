import { AppConfig } from '@/src/constants/app-config';
import Account, { AccountType } from '@/src/data/models/Account';
import Transaction from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { AccountDelta, DailyDelta } from '@/src/data/repositories/TransactionTypes';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import {
  calculateCalendarHeatmapFromHistory,
  calculateCalendarHeatmapFromTransactions,
  calculateSpendingHeatmapFromTransactions,
  HeatmapPoint,
} from '@/src/services/reports/heatmapCalculators';
import { calculateHistoryFromDeltas } from '@/src/services/reports/historyCalculators';
import {
  ConvertedReportTransaction,
  ReportAccount,
  ReportingDeltaInput,
} from '@/src/services/reports/reportTypes';
import {
  calculateSankeyDataFromSummaries,
  SankeyData,
  SankeyLink,
  SankeyNode,
} from '@/src/services/reports/sankeyCalculator';
import { workplaceService } from '@/src/services/WorkplaceService';
import { AccountId, WorkplaceId } from '@/src/types/domain';
import {
  calculateCategoryBreakdownItems,
  calculateIncomeVsExpenseSummary,
  getAccountBalanceDelta,
} from '@/src/utils/accountingHelpers';
import { logger } from '@/src/utils/logger';
import { Money } from '@/src/utils/money';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import weekOfYear from 'dayjs/plugin/weekOfYear';
import { from, Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';

dayjs.extend(weekOfYear);
dayjs.extend(isoWeek);

export interface ExpenseCategory {
  accountId: AccountId;
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

export type { HeatmapPoint, SankeyData, SankeyLink, SankeyNode };

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

export class ReportService {
  /**
   * Aggregates expenses by account for a period.
   */
  async getExpenseBreakdown(
    workplaceId: WorkplaceId,
    startDate: number,
    endDate: number,
    targetCurrency?: string,
    accountIds?: AccountId[],
  ): Promise<ExpenseCategory[]> {
    return this.getBreakdownInternal(
      AccountType.EXPENSE,
      workplaceId,
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
    workplaceId: WorkplaceId,
    startDate: number,
    endDate: number,
    targetCurrency?: string,
    accountIds?: string[],
  ): Promise<ExpenseCategory[]> {
    return this.getBreakdownInternal(
      AccountType.INCOME,
      workplaceId,
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
    workplaceId: WorkplaceId,
    startDate: number,
    endDate: number,
    targetCurrency?: string,
    accountIds?: AccountId[],
  ): Observable<ExpenseCategory[]> {
    return journalRepository
      .observeStatusMeta(workplaceId)
      .pipe(
        switchMap(() =>
          from(
            this.getExpenseBreakdown(workplaceId, startDate, endDate, targetCurrency, accountIds),
          ),
        ),
      );
  }

  /**
   * Reactive version of getIncomeBreakdown.
   */
  observeIncomeBreakdown(
    workplaceId: WorkplaceId,
    startDate: number,
    endDate: number,
    targetCurrency?: string,
    accountIds?: string[],
  ): Observable<ExpenseCategory[]> {
    return journalRepository
      .observeStatusMeta(workplaceId)
      .pipe(
        switchMap(() =>
          from(
            this.getIncomeBreakdown(workplaceId, startDate, endDate, targetCurrency, accountIds),
          ),
        ),
      );
  }

  private async getBreakdownInternal(
    type: AccountType,
    workplaceId: WorkplaceId,
    startDate: number,
    endDate: number,
    targetCurrency?: string,
    filterAccountIds?: string[],
  ): Promise<ExpenseCategory[]> {
    const { currency, incomeAccounts, expenseAccounts } = await this.getReportAccounts(
      workplaceId,
      targetCurrency,
    );
    let accounts = type === AccountType.INCOME ? incomeAccounts : expenseAccounts;

    if (filterAccountIds && filterAccountIds.length > 0) {
      const filterSet = new Set(filterAccountIds);
      accounts = accounts.filter(a => filterSet.has(a.id));
    }

    const accountIds = accounts.map(a => a.id);
    if (accountIds.length === 0) return [];

    const normalizedDeltas = await this.getScopedDeltas<AccountDelta>(
      workplaceId,
      accountIds,
      startDate,
      endDate,
      currency,
      accounts,
      (ids, start, end) =>
        transactionRawRepository.getAccountDeltasGroupedRaw(workplaceId, ids, start, end),
    );

    return this.calculateBreakdownFromDeltas(accounts, normalizedDeltas, currency);
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

  /**
   * Aggregates by category (AccountSubtype).
   */
  async getCategoryBreakdown(
    type: AccountType,
    workplaceId: WorkplaceId,
    startDate: number,
    endDate: number,
    targetCurrency?: string,
    filterAccountIds?: string[],
  ): Promise<CategoryBreakdown[]> {
    const { currency, incomeAccounts, expenseAccounts } = await this.getReportAccounts(
      workplaceId,
      targetCurrency,
    );
    let accounts = type === AccountType.INCOME ? incomeAccounts : expenseAccounts;

    if (filterAccountIds && filterAccountIds.length > 0) {
      const filterSet = new Set(filterAccountIds);
      accounts = accounts.filter(a => filterSet.has(a.id));
    }

    const accountIds = accounts.map(a => a.id);
    if (accountIds.length === 0) return [];

    const normalizedDeltas = await this.getScopedDeltas<AccountDelta>(
      workplaceId,
      accountIds,
      startDate,
      endDate,
      currency,
      accounts,
      (ids, start, end) =>
        transactionRawRepository.getAccountDeltasGroupedRaw(workplaceId, ids, start, end),
    );

    return this.calculateCategoryBreakdownFromDeltas(accounts, normalizedDeltas, currency);
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
        return { category, amount: val };
      })
      .filter((item): item is { category: string; amount: number } => item !== null);

    return calculateCategoryBreakdownItems(items);
  }

  /**
   * Calculates Income vs Expense for the period.
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
    let allAccounts = [...incomeAccounts, ...expenseAccounts];

    if (filterAccountIds && filterAccountIds.length > 0) {
      const filterSet = new Set(filterAccountIds);
      allAccounts = allAccounts.filter(a => filterSet.has(a.id));
    }

    const allIds = allAccounts.map(a => a.id);
    if (allIds.length === 0) return { income: 0, expense: 0 };

    const normalizedDeltas = await this.getScopedDeltas<AccountDelta>(
      workplaceId,
      allIds,
      startDate,
      endDate,
      currency,
      allAccounts,
      (ids, start, end) =>
        transactionRawRepository.getAccountDeltasGroupedRaw(workplaceId, ids, start, end),
    );

    return this.calculateIncomeVsExpenseFromDeltas(normalizedDeltas, allAccounts, currency);
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
    let currency = targetCurrency;
    if (!currency) {
      currency = await workplaceService.getCurrency(accounts[0]?.workplaceId);
    }
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
    workplaceId: WorkplaceId,
    startDate: number,
    endDate: number,
    targetCurrency?: string,
    filterAccountIds?: AccountId[],
  ): Promise<IncomeVsExpense[]> {
    const { currency, incomeAccounts, expenseAccounts } = await this.getReportAccounts(
      workplaceId,
      targetCurrency,
    );
    let allAccounts = [...incomeAccounts, ...expenseAccounts];

    if (filterAccountIds && filterAccountIds.length > 0) {
      const filterSet = new Set(filterAccountIds);
      allAccounts = allAccounts.filter(a => filterSet.has(a.id));
    }

    const allIds = allAccounts.map(a => a.id);
    if (allIds.length === 0) return [];

    const normalizedDeltas = await this.getScopedDeltas<DailyDelta>(
      workplaceId,
      allIds,
      startDate,
      endDate,
      currency,
      allAccounts,
      (ids, start, end) =>
        transactionRawRepository.getDailyDeltasGroupedRaw(workplaceId, ids, start, end),
    );

    return calculateHistoryFromDeltas(normalizedDeltas, startDate, endDate, currency);
  }

  /**
   * Calculates Daily Income vs Expense for the period.
   */
  async getDailyIncomeVsExpense(
    workplaceId: WorkplaceId,
    startDate: number,
    endDate: number,
    targetCurrency?: string,
    filterAccountIds?: AccountId[],
  ): Promise<{ date: number; income: number; expense: number }[]> {
    const { currency, incomeAccounts, expenseAccounts } = await this.getReportAccounts(
      workplaceId,
      targetCurrency,
    );
    let allAccounts = [...incomeAccounts, ...expenseAccounts];

    if (filterAccountIds && filterAccountIds.length > 0) {
      const filterSet = new Set(filterAccountIds);
      allAccounts = allAccounts.filter(a => filterSet.has(a.id));
    }

    const allIds = allAccounts.map(a => a.id);
    if (allIds.length === 0) return [];

    const normalizedDeltas = await this.getScopedDeltas<DailyDelta>(
      workplaceId,
      allIds,
      startDate,
      endDate,
      currency,
      allAccounts,
      (ids, start, end) =>
        transactionRawRepository.getDailyDeltasGroupedRaw(workplaceId, ids, start, end),
    );

    return this.calculateDailyVsDeltas(normalizedDeltas, startDate, endDate, currency);
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

  /** Helper to centralize currency conversion and rate caching */
  private async getNormalizedDeltas<T extends ReportingDeltaInput>(
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
  ): ReportingDeltaInput[] {
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
  private async getScopedDeltas<T extends ReportingDeltaInput>(
    workplaceId: WorkplaceId,
    accountIds: AccountId[],
    startDate: number,
    endDate: number,
    targetCurrency: string,
    accounts: ReportAccount[],
    fetchRaw: (ids: AccountId[], start: number, end: number) => Promise<T[]>,
  ): Promise<T[]> {
    const items = await fetchRaw(accountIds, startDate, endDate);
    if (items.length > 0) {
      return this.getNormalizedDeltas(items, targetCurrency);
    }

    if (accountIds.length > 0) {
      logger.metric('ReportService.getScopedDeltas.fallbackTriggered', 1, {
        accountCount: accountIds.length,
        rangeDays: dayjs(endDate).diff(dayjs(startDate), 'days'),
      });

      const converted = await this.getConvertedReportTransactions(
        workplaceId,
        startDate,
        endDate,
        targetCurrency,
        accounts,
      );
      const accountTypeMap = new Map(accounts.map(a => [a.id, a.accountType]));

      const accountIdsSet = new Set(accountIds);
      return converted
        .filter(tx => accountIdsSet.has(tx.accountId))
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

    return [];
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
    let allAccounts = [...incomeAccounts, ...expenseAccounts];
    if (filterAccountIds && filterAccountIds.length > 0) {
      const filterSet = new Set(filterAccountIds);
      allAccounts = allAccounts.filter(a => filterSet.has(a.id));
    }

    const allIds = allAccounts.map(a => a.id);
    const transactions = await transactionRepository.findByAccountsAndDateRange(
      workplaceId,
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

    const history = calculateHistoryFromDeltas(deltas, startDate, endDate, currency);
    const dailyIncomeVsExpense = this.calculateDailyVsDeltas(deltas, startDate, endDate, currency);

    const sankeyData = calculateSankeyDataFromSummaries(incomeBreakdown, expenseCategoryBreakdown);
    const spendingHeatmap = calculateSpendingHeatmapFromTransactions(converted);
    const calendarHeatmap = calculateCalendarHeatmapFromHistory(history);

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

  /**
   * Aggregates money flow for a Sankey diagram.
   * Income Sources -> Total Income -> Expense Categories -> Surplus.
   */
  async getSankeyData(
    workplaceId: WorkplaceId,
    startDate: number,
    endDate: number,
    targetCurrency?: string,
    filterAccountIds?: string[],
  ): Promise<SankeyData> {
    const [incomeSummary, expenseCategorySummary] = await Promise.all([
      this.getIncomeBreakdown(workplaceId, startDate, endDate, targetCurrency, filterAccountIds),
      this.getCategoryBreakdown(
        AccountType.EXPENSE,
        workplaceId,
        startDate,
        endDate,
        targetCurrency,
        filterAccountIds,
      ),
    ]);

    return calculateSankeyDataFromSummaries(incomeSummary, expenseCategorySummary);
  }

  /**
   * Aggregates spending density by day and hour.
   */
  async getSpendingHeatmapData(
    workplaceId: WorkplaceId,
    startDate: number,
    endDate: number,
    targetCurrency?: string,
    filterAccountIds?: string[],
  ): Promise<HeatmapPoint[]> {
    const { currency, expenseAccounts } = await this.getReportAccounts(workplaceId, targetCurrency);
    let accounts = expenseAccounts;
    if (filterAccountIds && filterAccountIds.length > 0) {
      accounts = accounts.filter(a => filterAccountIds.includes(a.id));
    }

    const accountIds = accounts.map(a => a.id);
    const transactions = await transactionRepository.findByAccountsAndDateRange(
      workplaceId,
      accountIds,
      startDate,
      endDate,
    );
    const converted = await this.getConvertedReportTransactionsFromRaw(
      transactions,
      currency,
      accounts,
    );

    return calculateSpendingHeatmapFromTransactions(converted);
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
    return journalRepository
      .observeStatusMeta(workplaceId)
      .pipe(
        switchMap(() =>
          from(
            this.getReportSnapshot(
              workplaceId,
              startDate,
              endDate,
              targetCurrency,
              filterAccountIds,
            ),
          ),
        ),
      );
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
      accountRepository.findByType(workplaceId, AccountType.INCOME),
      accountRepository.findByType(workplaceId, AccountType.EXPENSE),
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
    workplaceId: WorkplaceId,
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
      workplaceId,
      accountIds,
      startDate,
      endDate,
    );

    if (transactions.length === 0) return [];

    // 1. Identify unique currencies
    const sourceCurrencies = new Set<string>();
    transactions.forEach(tx => {
      const txCurrency = tx.currencyCode || accountCurrencyById.get(tx.accountId) || currency;
      sourceCurrencies.add(txCurrency);
    });

    // 2. Pre-fetch all required rates
    await Promise.all(
      Array.from(sourceCurrencies).map(base => {
        const promise = exchangeRateService.fetchRatesForBase?.(base);
        return promise && typeof promise.catch === 'function'
          ? promise.catch(() => {})
          : Promise.resolve();
      }),
    );

    // 3. Synchronous conversion
    return transactions
      .map(tx => {
        const accountType = accountTypeById.get(tx.accountId);
        if (!accountType) return null;

        const txCurrency = tx.currencyCode || accountCurrencyById.get(tx.accountId) || currency;
        const rate = exchangeRateService.getRateSafe(txCurrency, currency);
        const convertedAmount = tx.amount * rate;

        return {
          accountId: tx.accountId,
          accountType,
          transactionType: tx.transactionType,
          transactionDate: tx.transactionDate,
          amount: convertedAmount,
        } as ConvertedReportTransaction;
      })
      .filter((row): row is ConvertedReportTransaction => !!row);
  }

  private async getConvertedReportTransactionsFromRaw(
    transactions: Transaction[],
    targetCurrency: string,
    accounts: ReportAccount[],
  ): Promise<ConvertedReportTransaction[]> {
    if (transactions.length === 0) return [];

    // 1. Identify unique source currencies
    const sourceCurrencies = new Set<string>();
    transactions.forEach(tx => {
      if (tx.currencyCode) sourceCurrencies.add(tx.currencyCode);
    });

    // 2. Pre-fetch all required rates in parallel
    await Promise.all(
      Array.from(sourceCurrencies).map(base => {
        const promise = exchangeRateService.fetchRatesForBase?.(base);
        return promise && typeof promise.catch === 'function'
          ? promise.catch(() => {})
          : Promise.resolve();
      }),
    );

    const accountMap = new Map(accounts.map(a => [a.id, a]));

    // 3. Synchronous conversion pass
    return transactions.map(tx => {
      const rate = exchangeRateService.getRateSafe(tx.currencyCode, targetCurrency);
      const convertedAmount = tx.amount * rate;
      const account = accountMap.get(tx.accountId);

      return {
        accountId: tx.accountId,
        accountType: account?.accountType || AccountType.EXPENSE,
        transactionType: tx.transactionType,
        transactionDate: tx.transactionDate,
        amount: convertedAmount,
      };
    });
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

  /**
   * Aggregates spending by day of week and week of month (Calendar view).
   */
  async getCalendarHeatmapData(
    workplaceId: WorkplaceId,
    startDate: number,
    endDate: number,
    targetCurrency?: string,
    filterAccountIds?: string[],
  ): Promise<HeatmapPoint[]> {
    const { currency, expenseAccounts } = await this.getReportAccounts(workplaceId, targetCurrency);
    let accounts = expenseAccounts;
    if (filterAccountIds && filterAccountIds.length > 0) {
      accounts = accounts.filter(a => filterAccountIds.includes(a.id));
    }
    const accountIds = accounts.map(a => a.id);
    if (accountIds.length === 0) return [];

    const transactions = await transactionRepository.findByAccountsAndDateRange(
      workplaceId,
      accountIds,
      startDate,
      endDate,
    );
    const converted = await this.getConvertedReportTransactionsFromRaw(
      transactions,
      currency,
      accounts,
    );

    return calculateCalendarHeatmapFromTransactions(converted, startDate, endDate);
  }
}

export const reportService = new ReportService();
