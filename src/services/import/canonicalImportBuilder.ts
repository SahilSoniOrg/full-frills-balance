import { AppConfig } from '@/src/constants/app-config';
import { generator } from '@/src/data/database/idGenerator';
import {
  getDefaultSubtypeForType,
  isAccountSubtype,
  isAccountType,
  isSubtypeAllowedForType,
} from '@/src/types/accountSubtype';
import { AccountId, BudgetId, PlannedPaymentId } from '@/src/types/ids';
import {
  AccountSubtype,
  AccountType,
  PlannedPaymentInterval,
  PlannedPaymentStatus,
} from '@/src/types/enums';
import { Icon, isValidIconName, parseIconName, type IconName } from '@/src/types/domainIcons';
import { getAccountFallbackIcon } from '@/src/utils/accountIcon';
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
} from '@/src/types/importContracts';
import { synthesizeTransactions as synthesizeTransactionPhase } from './phases/transactionSynthesizer';
import type {
  ImportAccountInput,
  ImportBudgetInput,
  ImportCategoryInput,
  ImportIssue,
  ImportPlannedPaymentInput,
  ImportTransactionInput,
} from './importTypes';
export type {
  ImportAccountInput,
  ImportBudgetInput,
  ImportCategoryInput,
  ImportIssue,
  ImportPlannedPaymentInput,
  ImportTransactionInput,
} from './importTypes';

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

  public addExchangeRate(rate: CanonicalExchangeRate): this {
    this.exchangeRates.push(rate);
    return this;
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
    name?: string,
  ): AccountSubtype {
    if (val) {
      const upper = String(val).toUpperCase().trim();
      if (isAccountSubtype(upper) && isSubtypeAllowedForType(type, upper as AccountSubtype)) {
        return upper as AccountSubtype;
      }
      // Common plurals or aliases
      if (type === AccountType.LIABILITY) {
        if (/loan/i.test(upper)) return AccountSubtype.LOAN;
        if (/mortgage/i.test(upper)) return AccountSubtype.MORTGAGE;
        if (/card/i.test(upper)) return AccountSubtype.CREDIT_CARD;
        if (/payable/i.test(upper)) return AccountSubtype.PAYABLE;
      } else if (type === AccountType.ASSET) {
        if (/checking/i.test(upper)) return AccountSubtype.BANK_CHECKING;
        if (/savings/i.test(upper)) return AccountSubtype.BANK_SAVINGS;
        if (/cash/i.test(upper)) return AccountSubtype.CASH;
      }
    }

    // Infer from name if subtype wasn't provided or recognized
    if (name && type === AccountType.LIABILITY) {
      if (/loan|borrow|debt|lending|advance/i.test(name)) return AccountSubtype.LOAN;
      if (/mortgage/i.test(name)) return AccountSubtype.MORTGAGE;
      if (/credit\s*card|\bcc\b/i.test(name)) return AccountSubtype.CREDIT_CARD;
      if (/payable|creditor/i.test(name)) return AccountSubtype.PAYABLE;
    }

    if (!val) {
      return type === AccountType.LIABILITY ? AccountSubtype.OTHER : getDefaultSubtypeForType(type);
    }

    issues.push({
      severity: 'warning',
      entity: 'account',
      sourceId,
      code: 'INVALID_ENUM',
      message: `Invalid or disallowed accountSubtype '${val}' for type '${type}'. Fallback to default '${getDefaultSubtypeForType(type)}'.`,
    });
    return type === AccountType.LIABILITY ? AccountSubtype.OTHER : getDefaultSubtypeForType(type);
  }

  private parseIconWithIssue(
    raw: string | null | undefined,
    fallback: IconName,
    entity: 'account' | 'category',
    sourceId: string,
    issues: ImportIssue[],
  ): IconName {
    if (raw !== undefined && raw !== null && !isValidIconName(raw)) {
      issues.push({
        severity: 'warning',
        entity,
        sourceId,
        code: 'INVALID_ICON',
        message: `Invalid ${entity} icon '${raw}'. Falling back to '${fallback}'.`,
      });
    }
    return parseIconName(raw, fallback);
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
      const subtype = this.parseAccountSubtypeWithIssue(
        type,
        raw.accountSubtype,
        raw.id,
        issues,
        raw.name,
      );
      const icon = this.parseIconWithIssue(
        raw.icon,
        getAccountFallbackIcon(type),
        'account',
        raw.id,
        issues,
      );

      canonicalAccounts.push({
        id: internalId,
        name: raw.name,
        accountType: type,
        accountSubtype: subtype,
        currencyCode: raw.currencyCode || this.defaultCurrency,
        description: raw.description,
        icon,
        color: raw.color,
        orderNum: raw.orderNum ?? canonicalAccounts.length + 1,
        reconciledAt: raw.reconciledAt,
        archivedAt: raw.archivedAt,
      });
    }

    return canonicalAccounts;
  }

  private prepareCategoryAwareInputs(): {
    categories: Map<string, ImportCategoryInput>;
    transactions: ImportTransactionInput[];
    plannedPayments: ImportPlannedPaymentInput[];
  } {
    const categories = new Map(this.rawCategories);
    const parentCategoryIds = new Set(
      [...categories.values()]
        .map(category => category.parentCategoryId)
        .filter((parentId): parentId is string => !!parentId && categories.has(parentId)),
    );
    const directPostingCategoryIds = new Set<string>();
    this.rawTransactions.forEach(transaction => {
      if (
        transaction.type !== 'TRANSFER' &&
        !transaction.isOpeningBalance &&
        !transaction.isBalanceCorrection &&
        transaction.categoryId
      ) {
        directPostingCategoryIds.add(transaction.categoryId);
      }
    });
    this.rawPlannedPayments.forEach(payment => {
      if (payment.type !== 'TRANSFER' && payment.toAccountId) {
        directPostingCategoryIds.add(payment.toAccountId);
      }
    });
    const directPostingCategoryMap = new Map<string, string>();

    for (const parentId of parentCategoryIds) {
      if (!directPostingCategoryIds.has(parentId)) continue;
      const parent = categories.get(parentId);
      if (!parent) continue;

      const baseId = `__ffb_direct_postings__${parentId}`;
      let syntheticId = baseId;
      let suffix = 2;
      while (categories.has(syntheticId)) syntheticId = `${baseId}:${suffix++}`;

      const siblingOrders = [...categories.values()]
        .filter(category => category.parentCategoryId === parentId)
        .flatMap(category => (category.orderNum === undefined ? [] : [category.orderNum]));
      categories.set(syntheticId, {
        id: syntheticId,
        name: 'Other',
        parentCategoryId: parentId,
        orderNum: siblingOrders.length > 0 ? Math.max(...siblingOrders) + 1 : undefined,
        defaultType: parent.defaultType,
        description: `Direct postings imported from ${parent.name}`,
        icon: parent.icon,
        color: parent.color,
        archivedAt: parent.archivedAt,
      });
      directPostingCategoryMap.set(parentId, syntheticId);
    }

    return {
      categories,
      transactions: this.rawTransactions.map(transaction => {
        if (transaction.type === 'TRANSFER') return transaction;
        const categoryId = transaction.categoryId
          ? directPostingCategoryMap.get(transaction.categoryId)
          : undefined;
        return categoryId ? { ...transaction, categoryId } : transaction;
      }),
      plannedPayments: this.rawPlannedPayments.map(payment => {
        if (payment.type === 'TRANSFER') return payment;
        const toAccountId = payment.toAccountId
          ? directPostingCategoryMap.get(payment.toAccountId)
          : undefined;
        return toAccountId ? { ...payment, toAccountId } : payment;
      }),
    };
  }

  private scanCategoryUsage(
    rawTransactions: ImportTransactionInput[],
    rawPlannedPayments: ImportPlannedPaymentInput[],
  ): Map<string, CategoryUsageStat> {
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
    for (const tx of rawTransactions) {
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
    for (const p of rawPlannedPayments) {
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
    issues: ImportIssue[],
    rawCategories: Map<string, ImportCategoryInput>,
  ): CanonicalAccount[] {
    const categoryAccounts: CanonicalAccount[] = [];
    const categoryCurrencies = new Map<string, Set<string>>();

    // Usage currencies roll up to parents. Unused categories inherit their parent's
    // currencies so every imported parent-child link has a matching currency.
    for (const [catId, stat] of categoryStats.entries()) {
      for (const currency of stat.currencies) {
        const visited = new Set<string>();
        let currentId: string | undefined = catId;
        while (currentId && !visited.has(currentId)) {
          visited.add(currentId);
          const currencies = categoryCurrencies.get(currentId) ?? new Set<string>();
          currencies.add(currency);
          categoryCurrencies.set(currentId, currencies);
          currentId = rawCategories.get(currentId)?.parentCategoryId;
        }
      }
    }

    const resolving = new Set<string>();
    const resolveCurrencies = (catId: string): Set<string> => {
      const existing = categoryCurrencies.get(catId);
      if (existing && existing.size > 0) return existing;
      if (resolving.has(catId)) return new Set([this.defaultCurrency]);

      resolving.add(catId);
      const parentId = rawCategories.get(catId)?.parentCategoryId;
      const parentCurrencies =
        parentId && rawCategories.has(parentId)
          ? resolveCurrencies(parentId)
          : new Set([this.defaultCurrency]);
      const currencies = new Set(parentCurrencies);
      categoryCurrencies.set(catId, currencies);
      resolving.delete(catId);
      return currencies;
    };

    for (const catId of rawCategories.keys()) resolveCurrencies(catId);

    // Allocate all IDs before building accounts so parent references do not depend
    // on the row order in the source database.
    for (const catId of rawCategories.keys()) {
      for (const currency of categoryCurrencies.get(catId) ?? [this.defaultCurrency]) {
        categoryAccountMap.set(`${catId}:::${currency}`, generator() as AccountId);
      }
    }

    for (const [catId, catInfo] of rawCategories.entries()) {
      const currencies = Array.from(categoryCurrencies.get(catId) ?? [this.defaultCurrency]);
      const stat = categoryStats.get(catId);

      const primaryType =
        catInfo.defaultType ??
        (stat && stat.incomeCount > stat.expenseCount ? AccountType.INCOME : AccountType.EXPENSE);
      const icon = this.parseIconWithIssue(
        catInfo.icon,
        primaryType === AccountType.INCOME ? Icon.TrendingUp : Icon.Tag,
        'category',
        catId,
        issues,
      );

      for (const currency of currencies) {
        const catKey = `${catId}:::${currency}`;
        const internalCatId = categoryAccountMap.get(catKey)!;
        const parentAccountId = catInfo.parentCategoryId
          ? categoryAccountMap.get(`${catInfo.parentCategoryId}:::${currency}`)
          : undefined;

        categoryAccounts.push({
          id: internalCatId,
          name: `${catInfo.name} (${currency})`,
          accountType: primaryType,
          accountSubtype: getDefaultSubtypeForType(primaryType),
          currencyCode: currency,
          parentAccountId,
          description: catInfo.description,
          icon,
          color: catInfo.color,
          orderNum: accountCountOffset + (catInfo.orderNum ?? categoryAccounts.length) + 1,
          archivedAt: catInfo.archivedAt,
        });
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
    rawTransactions: ImportTransactionInput[],
  ): { journals: CanonicalJournal[]; transactions: CanonicalTransaction[] } {
    return synthesizeTransactionPhase({
      rawTransactions,
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
    rawPlannedPayments: ImportPlannedPaymentInput[],
  ): CanonicalPlannedPayment[] {
    const plannedPayments: CanonicalPlannedPayment[] = [];

    for (const p of rawPlannedPayments) {
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
      const budgetScopes: CanonicalBudgetScope[] = [];

      // Category scopes only — funding wallets belong on CanonicalBudget.assetAccountIds.
      if (b.categoryIds) {
        for (const catId of b.categoryIds) {
          let matched = false;
          for (const [key, accId] of categoryAccountMap.entries()) {
            if (key.startsWith(`${catId}:::`)) {
              matched = true;
              budgetScopes.push({
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

      const fundingAccountIds: string[] = [];
      if (b.assetAccountIds) {
        for (const extAccId of b.assetAccountIds) {
          const internalAccId = accountMap.get(extAccId);
          if (internalAccId) {
            fundingAccountIds.push(internalAccId);
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

      // FFB spend resolution only counts leaf EXPENSE category scopes. A budget
      // with none (empty Cashew category_fks, or unresolved refs) is inert.
      if (budgetScopes.length === 0) {
        issues.push({
          severity: 'warning',
          entity: 'budget',
          sourceId: b.id,
          code: 'EMPTY_BUDGET_SCOPE',
          message: `Budget '${b.name}' has no category scopes and was skipped.`,
        });
        continue;
      }

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
        assetAccountIds: fundingAccountIds.length > 0 ? fundingAccountIds.join(',') : undefined,
      });
      scopes.push(...budgetScopes);
    }

    return { budgets, scopes };
  }

  public build(): CanonicalImportBuildResult {
    const buildIssues: ImportIssue[] = [];
    const categoryAwareInputs = this.prepareCategoryAwareInputs();

    // Maps: externalId -> internalId / currency
    const accountMap = new Map<string, AccountId>();
    const accountCurrencyMap = new Map<string, string>();
    const categoryAccountMap = new Map<string, AccountId>();

    // 1. Materialize Registered Accounts
    const canonicalAccounts = this.materializeAccounts(accountMap, accountCurrencyMap, buildIssues);

    // 2. Scan Category Usage & Currency
    const categoryStats = this.scanCategoryUsage(
      categoryAwareInputs.transactions,
      categoryAwareInputs.plannedPayments,
    );

    // 3. Materialize Category Accounts
    const categoryAccounts = this.materializeCategoryAccounts(
      categoryStats,
      categoryAccountMap,
      canonicalAccounts.length,
      buildIssues,
      categoryAwareInputs.categories,
    );
    canonicalAccounts.push(...categoryAccounts);

    // 4. Synthesize Balanced Journals & Transactions
    const { journals, transactions } = this.synthesizeTransactions(
      accountMap,
      accountCurrencyMap,
      categoryAccountMap,
      canonicalAccounts,
      buildIssues,
      categoryAwareInputs.transactions,
    );

    // 5. Synthesize Planned Payments
    const plannedPayments = this.synthesizePlannedPayments(
      accountMap,
      categoryAccountMap,
      canonicalAccounts,
      buildIssues,
      categoryAwareInputs.plannedPayments,
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
