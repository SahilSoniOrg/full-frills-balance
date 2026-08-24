import { AppConfig } from '@/src/constants/app-config';
import { generator } from '@/src/data/database/idGenerator';
import {
  getDefaultSubtypeForType,
  isAccountSubtype,
  isAccountType,
  isSubtypeAllowedForType,
} from '@/src/types/accountSubtype';
import {
  AccountId,
  AccountSubtype,
  AccountType,
  BudgetId,
  PlannedPaymentId,
  PlannedPaymentInterval,
  PlannedPaymentStatus,
} from '@/src/types/domain';
import { IconName } from '@/src/types/domainIcons';
import {
  CANONICAL_IMPORT_VERSION_V1,
  CanonicalAccount,
  CanonicalBudget,
  CanonicalBudgetScope,
  CanonicalCurrency,
  CanonicalExchangeRate,
  CanonicalImportMetadata,
  CanonicalImportV1,
  CanonicalJournal,
  CanonicalPlannedPayment,
  CanonicalTransaction,
} from './canonicalImport';
import { synthesizeTransactions as synthesizeTransactionPhase } from './phases/transactionSynthesizer';

export interface ImportAccountInput {
  id: string;
  name: string;
  currencyCode: string;
  accountType?: AccountType | string;
  accountSubtype?: AccountSubtype | string;
  description?: string;
  icon?: IconName;
  orderNum?: number;
}

export interface ImportCategoryInput {
  id: string;
  name: string;
  defaultType?: AccountType.EXPENSE | AccountType.INCOME;
  description?: string;
  icon?: IconName;
  color?: number;
}

export interface ImportTransactionInput {
  id?: string;
  journalId?: string;
  date?: number;
  amount: number;
  targetAmount?: number;
  currencyCode: string;
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  sourceAccountId: string;
  targetAccountId?: string;
  categoryId?: string;
  description?: string;
  notes?: string;
  /**
   * Stored exchange rate multiplier: destination amount / source amount.
   * e.g. 100 USD -> 85 EUR means rate = 0.85.
   */
  exchangeRate?: number;
  isOpeningBalance?: boolean;
  isBalanceCorrection?: boolean;
}

export interface ImportPlannedPaymentInput {
  id?: string;
  name: string;
  description?: string;
  amount: number;
  currencyCode: string;
  fromAccountId: string;
  toAccountId?: string;
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  intervalN?: number;
  intervalType?: PlannedPaymentInterval | string;
  startDate: number;
  endDate?: number;
  nextOccurrence?: number;
  status?: PlannedPaymentStatus | string;
  isAutoPost?: boolean;
  recurrenceDay?: number;
  recurrenceMonth?: number;
}

export interface ImportBudgetInput {
  id?: string;
  name: string;
  amount: number;
  currencyCode: string;
  startMonth: string;
  active?: boolean;
  intervalType?: string;
  intervalN?: number;
  startDate?: number;
  recurrenceDay?: number;
  recurrenceMonth?: number;
  categoryIds?: string[];
  assetAccountIds?: string[];
}

export interface ImportIssue {
  severity: 'warning' | 'error';
  entity: 'account' | 'category' | 'transaction' | 'plannedPayment' | 'budget';
  sourceId?: string;
  code:
    | 'ACCOUNT_NOT_FOUND'
    | 'CATEGORY_NOT_FOUND'
    | 'DUPLICATE_ACCOUNT_ID'
    | 'DUPLICATE_CATEGORY_ID'
    | 'INVALID_TRANSFER_DESTINATION'
    | 'INVALID_AMOUNT'
    | 'INVALID_ENUM';
  message: string;
  details?: Record<string, unknown>;
}

export interface CanonicalImportBuildResult {
  canonical: CanonicalImportV1;
  issues: readonly ImportIssue[];
}

interface CategoryUsageStat {
  expenseCount: number;
  incomeCount: number;
  currencies: Set<string>;
}

/**
 * Universal canonical import builder. Synthesizes balanced double-entry journals,
 * currency-scoped category accounts, and validates all entities before export.
 */
export class CanonicalImportBuilder {
  private defaultCurrency: string;
  private metadata?: CanonicalImportMetadata;
  private sourceFormatVersion?: string;

  private rawAccounts: ImportAccountInput[] = [];
  private rawAccountIds: Set<string> = new Set();
  private rawCategories: Map<string, ImportCategoryInput> = new Map();
  private rawTransactions: ImportTransactionInput[] = [];
  private rawPlannedPayments: ImportPlannedPaymentInput[] = [];
  private rawBudgets: ImportBudgetInput[] = [];
  private currencies: CanonicalCurrency[] = [];
  private exchangeRates: CanonicalExchangeRate[] = [];
  private registrationIssues: ImportIssue[] = [];

  constructor(defaultCurrency = 'USD') {
    this.defaultCurrency = defaultCurrency;
  }

  public setMetadata(metadata: CanonicalImportMetadata, sourceFormatVersion?: string): this {
    this.metadata = metadata;
    this.sourceFormatVersion = sourceFormatVersion;
    return this;
  }

  public addAccount(account: ImportAccountInput): this {
    if (this.rawAccountIds.has(account.id)) {
      this.registrationIssues.push({
        severity: 'warning',
        entity: 'account',
        sourceId: account.id,
        code: 'DUPLICATE_ACCOUNT_ID',
        message: `Account '${account.id}' (${account.name}) is registered more than once. Keeping first occurrence.`,
      });
      return this;
    }
    this.rawAccountIds.add(account.id);
    this.rawAccounts.push(account);
    return this;
  }

  public registerCategory(category: ImportCategoryInput): this {
    if (this.rawCategories.has(category.id)) {
      this.registrationIssues.push({
        severity: 'warning',
        entity: 'category',
        sourceId: category.id,
        code: 'DUPLICATE_CATEGORY_ID',
        message: `Category '${category.id}' (${category.name}) is registered more than once. Keeping first occurrence.`,
      });
      return this;
    }
    this.rawCategories.set(category.id, category);
    return this;
  }

  public addTransaction(transaction: ImportTransactionInput): this {
    this.rawTransactions.push(transaction);
    return this;
  }

  public addPlannedPayment(payment: ImportPlannedPaymentInput): this {
    this.rawPlannedPayments.push(payment);
    return this;
  }

  public addBudget(budget: ImportBudgetInput): this {
    this.rawBudgets.push(budget);
    return this;
  }

  public addCurrency(currency: CanonicalCurrency): this {
    this.currencies.push(currency);
    return this;
  }

  public addExchangeRate(rate: CanonicalExchangeRate): this {
    this.exchangeRates.push(rate);
    return this;
  }

  public getIssues(): readonly ImportIssue[] {
    return this.registrationIssues;
  }

  // --- Pipeline Phases ---

  private parseAccountTypeWithIssue(
    val?: AccountType | string,
    sourceId?: string,
    issues: ImportIssue[] = [],
  ): AccountType {
    if (!val) return AccountType.ASSET;
    const upper = String(val).toUpperCase();
    if (isAccountType(upper)) {
      return upper as AccountType;
    }
    issues.push({
      severity: 'warning',
      entity: 'account',
      sourceId,
      code: 'INVALID_ENUM',
      message: `Invalid accountType '${val}'. Fallback to ASSET.`,
    });
    return AccountType.ASSET;
  }

  private parseAccountSubtypeWithIssue(
    type: AccountType,
    val?: AccountSubtype | string,
    sourceId?: string,
    issues: ImportIssue[] = [],
  ): AccountSubtype {
    if (!val) return getDefaultSubtypeForType(type);
    const upper = String(val).toUpperCase();
    if (isAccountSubtype(upper) && isSubtypeAllowedForType(type, upper as AccountSubtype)) {
      return upper as AccountSubtype;
    }
    issues.push({
      severity: 'warning',
      entity: 'account',
      sourceId,
      code: 'INVALID_ENUM',
      message: `Invalid or disallowed accountSubtype '${val}' for type '${type}'. Fallback to default '${getDefaultSubtypeForType(type)}'.`,
    });
    return getDefaultSubtypeForType(type);
  }

  private parsePlannedPaymentIntervalWithIssue(
    val?: PlannedPaymentInterval | string,
    sourceId?: string,
    issues: ImportIssue[] = [],
  ): PlannedPaymentInterval {
    if (!val) return PlannedPaymentInterval.MONTHLY;
    const upper = String(val).toUpperCase();
    if (upper === 'DAILY' || upper === 'DAY') return PlannedPaymentInterval.DAILY;
    if (upper === 'WEEKLY' || upper === 'WEEK') return PlannedPaymentInterval.WEEKLY;
    if (upper === 'MONTHLY' || upper === 'MONTH') return PlannedPaymentInterval.MONTHLY;
    if (upper === 'YEARLY' || upper === 'YEAR') return PlannedPaymentInterval.YEARLY;

    issues.push({
      severity: 'warning',
      entity: 'plannedPayment',
      sourceId,
      code: 'INVALID_ENUM',
      message: `Invalid PlannedPaymentInterval '${val}'. Fallback to MONTHLY.`,
    });
    return PlannedPaymentInterval.MONTHLY;
  }

  private parsePlannedPaymentStatusWithIssue(
    val?: PlannedPaymentStatus | string,
    sourceId?: string,
    issues: ImportIssue[] = [],
  ): PlannedPaymentStatus {
    if (!val) return PlannedPaymentStatus.ACTIVE;
    const upper = String(val).toUpperCase();
    if (upper === 'ACTIVE') return PlannedPaymentStatus.ACTIVE;
    if (upper === 'PAUSED') return PlannedPaymentStatus.PAUSED;
    if (upper === 'COMPLETED' || upper === 'CANCELLED') return PlannedPaymentStatus.COMPLETED;

    issues.push({
      severity: 'warning',
      entity: 'plannedPayment',
      sourceId,
      code: 'INVALID_ENUM',
      message: `Invalid PlannedPaymentStatus '${val}'. Fallback to ACTIVE.`,
    });
    return PlannedPaymentStatus.ACTIVE;
  }

  private materializeAccounts(
    accountMap: Map<string, AccountId>,
    accountCurrencyMap: Map<string, string>,
    issues: ImportIssue[],
  ): CanonicalAccount[] {
    const canonicalAccounts: CanonicalAccount[] = [];

    for (const raw of this.rawAccounts) {
      const internalId = generator() as AccountId;
      accountMap.set(raw.id, internalId);
      accountCurrencyMap.set(raw.id, raw.currencyCode || this.defaultCurrency);

      const type = this.parseAccountTypeWithIssue(raw.accountType, raw.id, issues);
      const subtype = this.parseAccountSubtypeWithIssue(type, raw.accountSubtype, raw.id, issues);

      canonicalAccounts.push({
        id: internalId,
        name: raw.name,
        accountType: type,
        accountSubtype: subtype,
        currencyCode: raw.currencyCode || this.defaultCurrency,
        description: raw.description,
        icon: raw.icon,
        orderNum: raw.orderNum ?? canonicalAccounts.length + 1,
      });
    }

    return canonicalAccounts;
  }

  private scanCategoryUsage(): Map<string, CategoryUsageStat> {
    const categoryStats = new Map<string, CategoryUsageStat>();

    const getOrInitStat = (catId: string): CategoryUsageStat => {
      let stat = categoryStats.get(catId);
      if (!stat) {
        stat = { expenseCount: 0, incomeCount: 0, currencies: new Set() };
        categoryStats.set(catId, stat);
      }
      return stat;
    };

    // Scan transactions
    for (const tx of this.rawTransactions) {
      if (tx.type === 'TRANSFER' || !tx.categoryId) continue;
      const currency = tx.currencyCode || this.defaultCurrency;
      const stat = getOrInitStat(tx.categoryId);
      stat.currencies.add(currency);
      if (tx.type === 'INCOME') {
        stat.incomeCount++;
      } else {
        stat.expenseCount++;
      }
    }

    // Scan planned payments
    for (const p of this.rawPlannedPayments) {
      if (p.type === 'TRANSFER' || !p.toAccountId) continue;
      const currency = p.currencyCode || this.defaultCurrency;
      const stat = getOrInitStat(p.toAccountId);
      stat.currencies.add(currency);
      if (p.type === 'INCOME') {
        stat.incomeCount++;
      } else {
        stat.expenseCount++;
      }
    }

    // Scan budgets
    for (const b of this.rawBudgets) {
      if (b.categoryIds) {
        for (const catId of b.categoryIds) {
          const stat = getOrInitStat(catId);
          stat.currencies.add(b.currencyCode || this.defaultCurrency);
        }
      }
    }

    return categoryStats;
  }

  private materializeCategoryAccounts(
    categoryStats: Map<string, CategoryUsageStat>,
    categoryAccountMap: Map<string, AccountId>,
    accountCountOffset: number,
  ): CanonicalAccount[] {
    const categoryAccounts: CanonicalAccount[] = [];

    for (const [catId, catInfo] of this.rawCategories.entries()) {
      const stat = categoryStats.get(catId);
      const currencies =
        stat && stat.currencies.size > 0 ? Array.from(stat.currencies) : [this.defaultCurrency];

      const primaryType =
        catInfo.defaultType ??
        (stat && stat.incomeCount > stat.expenseCount ? AccountType.INCOME : AccountType.EXPENSE);

      for (const currency of currencies) {
        const catKey = `${catId}:::${currency}`;
        if (!categoryAccountMap.has(catKey)) {
          const internalCatId = generator() as AccountId;
          categoryAccountMap.set(catKey, internalCatId);

          categoryAccounts.push({
            id: internalCatId,
            name: `${catInfo.name} (${currency})`,
            accountType: primaryType,
            accountSubtype: getDefaultSubtypeForType(primaryType),
            currencyCode: currency,
            description: catInfo.description,
            icon: catInfo.icon,
            orderNum: accountCountOffset + categoryAccounts.length + 1,
          });
        }
      }
    }

    return categoryAccounts;
  }

  private getOrCreateUnknownCategory(
    isIncome: boolean,
    currency: string,
    categoryAccountMap: Map<string, AccountId>,
    canonicalAccounts: CanonicalAccount[],
  ): AccountId {
    const typeKey = isIncome ? 'UNKNOWN_INCOME' : 'UNKNOWN_EXPENSE';
    const key = `${typeKey}:::${currency}`;
    let accountId = categoryAccountMap.get(key);
    if (!accountId) {
      accountId = generator() as AccountId;
      categoryAccountMap.set(key, accountId);
      const accountType = isIncome ? AccountType.INCOME : AccountType.EXPENSE;
      const name = isIncome ? `Unknown Income (${currency})` : `Unknown Expense (${currency})`;

      canonicalAccounts.push({
        id: accountId,
        name,
        accountType,
        accountSubtype: getDefaultSubtypeForType(accountType),
        currencyCode: currency,
        description: isIncome ? 'Uncategorized income' : 'Uncategorized expense',
        orderNum: canonicalAccounts.length + 1,
      });
    }
    return accountId;
  }

  private getOrCreateSystemEquityAccount(
    isOpeningBalance: boolean,
    currency: string,
    categoryAccountMap: Map<string, AccountId>,
    canonicalAccounts: CanonicalAccount[],
  ): AccountId {
    const systemKey = `SYSTEM_${isOpeningBalance ? 'OPENING_BALANCE' : 'BALANCE_CORRECTION'}:::${currency}`;
    let accountId = categoryAccountMap.get(systemKey);
    if (!accountId) {
      accountId = generator() as AccountId;
      categoryAccountMap.set(systemKey, accountId);
      const accountConfig = isOpeningBalance
        ? AppConfig.systemAccounts.openingBalances
        : AppConfig.systemAccounts.balanceCorrections;

      canonicalAccounts.push({
        id: accountId,
        name: `${accountConfig.namePrefix} (${currency})`,
        accountType: AccountType.EQUITY,
        accountSubtype: isOpeningBalance
          ? AccountSubtype.OPENING_BALANCE
          : AccountSubtype.NET_WORTH_ADJUSTMENT,
        currencyCode: currency,
        description: accountConfig.description,
        icon: accountConfig.icon,
        orderNum: canonicalAccounts.length + 1,
      });
    }
    return accountId;
  }

  private synthesizeTransactions(
    accountMap: Map<string, AccountId>,
    accountCurrencyMap: Map<string, string>,
    categoryAccountMap: Map<string, AccountId>,
    canonicalAccounts: CanonicalAccount[],
    issues: ImportIssue[],
  ): { journals: CanonicalJournal[]; transactions: CanonicalTransaction[] } {
    return synthesizeTransactionPhase({
      rawTransactions: this.rawTransactions,
      defaultCurrency: this.defaultCurrency,
      accountMap,
      accountCurrencyMap,
      categoryAccountMap,
      canonicalAccounts,
      issues,
      getOrCreateSystemEquityAccount: this.getOrCreateSystemEquityAccount.bind(this),
      getOrCreateUnknownCategory: this.getOrCreateUnknownCategory.bind(this),
    });
  }

  private synthesizePlannedPayments(
    accountMap: Map<string, AccountId>,
    categoryAccountMap: Map<string, AccountId>,
    canonicalAccounts: CanonicalAccount[],
    issues: ImportIssue[],
  ): CanonicalPlannedPayment[] {
    const plannedPayments: CanonicalPlannedPayment[] = [];

    for (const p of this.rawPlannedPayments) {
      if (!Number.isFinite(p.amount) || p.amount <= 0) {
        issues.push({
          severity: 'error',
          entity: 'plannedPayment',
          sourceId: p.id,
          code: 'INVALID_AMOUNT',
          message: `Planned payment amount '${p.amount}' is invalid. Must be a finite, positive amount.`,
        });
        continue;
      }

      const fromAcc = p.fromAccountId ? accountMap.get(p.fromAccountId) : undefined;
      if (!fromAcc) {
        issues.push({
          severity: 'error',
          entity: 'plannedPayment',
          sourceId: p.id,
          code: 'ACCOUNT_NOT_FOUND',
          message: `Planned payment missing source account '${p.fromAccountId}'.`,
        });
        continue;
      }

      let toAcc: AccountId | undefined;
      if (p.type === 'TRANSFER') {
        toAcc = p.toAccountId ? accountMap.get(p.toAccountId) : undefined;
        if (!toAcc) {
          issues.push({
            severity: 'error',
            entity: 'plannedPayment',
            sourceId: p.id,
            code: 'INVALID_TRANSFER_DESTINATION',
            message: `Planned transfer destination account '${p.toAccountId}' was not found.`,
          });
          continue;
        }
      } else if (p.toAccountId) {
        toAcc = categoryAccountMap.get(
          `${p.toAccountId}:::${p.currencyCode || this.defaultCurrency}`,
        );
        if (!toAcc) {
          toAcc = this.getOrCreateUnknownCategory(
            p.type === 'INCOME',
            p.currencyCode || this.defaultCurrency,
            categoryAccountMap,
            canonicalAccounts,
          );
        }
      } else {
        toAcc = this.getOrCreateUnknownCategory(
          p.type === 'INCOME',
          p.currencyCode || this.defaultCurrency,
          categoryAccountMap,
          canonicalAccounts,
        );
      }

      let intervalN = 1;
      if (p.intervalN !== undefined) {
        if (Number.isInteger(p.intervalN) && p.intervalN > 0) {
          intervalN = p.intervalN;
        } else {
          issues.push({
            severity: 'warning',
            entity: 'plannedPayment',
            sourceId: p.id,
            code: 'INVALID_AMOUNT',
            message: `Invalid intervalN '${p.intervalN}'. Must be a positive integer. Fallback to 1.`,
          });
        }
      }

      plannedPayments.push({
        id: (p.id || generator()) as PlannedPaymentId,
        name: p.name,
        description: p.description,
        amount: Math.abs(p.amount),
        currencyCode: p.currencyCode || this.defaultCurrency,
        fromAccountId: fromAcc,
        toAccountId: toAcc,
        intervalN,
        intervalType: this.parsePlannedPaymentIntervalWithIssue(p.intervalType, p.id, issues),
        startDate: p.startDate,
        endDate: p.endDate,
        nextOccurrence: p.nextOccurrence ?? p.startDate,
        status: this.parsePlannedPaymentStatusWithIssue(p.status, p.id, issues),
        isAutoPost: p.isAutoPost ?? false,
        recurrenceDay: p.recurrenceDay,
        recurrenceMonth: p.recurrenceMonth,
      });
    }

    return plannedPayments;
  }

  private synthesizeBudgets(
    accountMap: Map<string, AccountId>,
    categoryAccountMap: Map<string, AccountId>,
    issues: ImportIssue[],
  ): { budgets: CanonicalBudget[]; scopes: CanonicalBudgetScope[] } {
    const budgets: CanonicalBudget[] = [];
    const scopes: CanonicalBudgetScope[] = [];

    for (const b of this.rawBudgets) {
      if (!Number.isFinite(b.amount) || b.amount <= 0) {
        issues.push({
          severity: 'error',
          entity: 'budget',
          sourceId: b.id,
          code: 'INVALID_AMOUNT',
          message: `Budget amount '${b.amount}' is invalid. Must be a finite, positive amount.`,
        });
        continue;
      }

      const budgetId = (b.id || generator()) as BudgetId;
      budgets.push({
        id: budgetId,
        name: b.name,
        amount: Math.abs(b.amount),
        currencyCode: b.currencyCode || this.defaultCurrency,
        startMonth: b.startMonth,
        active: b.active ?? true,
        intervalType: b.intervalType,
        intervalN: b.intervalN,
        startDate: b.startDate,
        recurrenceDay: b.recurrenceDay,
        recurrenceMonth: b.recurrenceMonth,
      });

      // Map category scopes
      if (b.categoryIds) {
        for (const catId of b.categoryIds) {
          let matched = false;
          for (const [key, accId] of categoryAccountMap.entries()) {
            if (key.startsWith(`${catId}:::`)) {
              matched = true;
              scopes.push({
                id: generator(),
                budgetId,
                accountId: accId,
              });
            }
          }
          if (!matched) {
            issues.push({
              severity: 'warning',
              entity: 'budget',
              sourceId: b.id,
              code: 'CATEGORY_NOT_FOUND',
              message: `Budget '${b.name}' references category '${catId}' which was not found or mapped.`,
            });
          }
        }
      }

      // Map asset account scopes
      if (b.assetAccountIds) {
        for (const extAccId of b.assetAccountIds) {
          const internalAccId = accountMap.get(extAccId);
          if (internalAccId) {
            scopes.push({
              id: generator(),
              budgetId,
              accountId: internalAccId,
            });
          } else {
            issues.push({
              severity: 'warning',
              entity: 'budget',
              sourceId: b.id,
              code: 'ACCOUNT_NOT_FOUND',
              message: `Budget '${b.name}' references asset account '${extAccId}' which was not found.`,
            });
          }
        }
      }
    }

    return { budgets, scopes };
  }

  public build(): CanonicalImportBuildResult {
    const buildIssues: ImportIssue[] = [];

    // Maps: externalId -> internalId / currency
    const accountMap = new Map<string, AccountId>();
    const accountCurrencyMap = new Map<string, string>();
    const categoryAccountMap = new Map<string, AccountId>();

    // 1. Materialize Registered Accounts
    const canonicalAccounts = this.materializeAccounts(accountMap, accountCurrencyMap, buildIssues);

    // 2. Scan Category Usage & Currency
    const categoryStats = this.scanCategoryUsage();

    // 3. Materialize Category Accounts
    const categoryAccounts = this.materializeCategoryAccounts(
      categoryStats,
      categoryAccountMap,
      canonicalAccounts.length,
    );
    canonicalAccounts.push(...categoryAccounts);

    // 4. Synthesize Balanced Journals & Transactions
    const { journals, transactions } = this.synthesizeTransactions(
      accountMap,
      accountCurrencyMap,
      categoryAccountMap,
      canonicalAccounts,
      buildIssues,
    );

    // 5. Synthesize Planned Payments
    const plannedPayments = this.synthesizePlannedPayments(
      accountMap,
      categoryAccountMap,
      canonicalAccounts,
      buildIssues,
    );

    // 6. Synthesize Budgets & Scopes
    const { budgets, scopes } = this.synthesizeBudgets(accountMap, categoryAccountMap, buildIssues);

    return {
      canonical: {
        version: CANONICAL_IMPORT_VERSION_V1,
        sourceFormatVersion: this.sourceFormatVersion,
        importMetadata: this.metadata,
        accounts: canonicalAccounts,
        journals,
        transactions,
        plannedPayments,
        budgets,
        budgetScopes: scopes,
        currencies: this.currencies,
        exchangeRates: this.exchangeRates,
      },
      issues: [...this.registrationIssues, ...buildIssues],
    };
  }
}
