/**
 * Ivy Wallet Import Plugin
 *
 * Handles import of Ivy Wallet backup format.
 * Refactored from ivy-import-service.ts to implement ImportPlugin interface.
 */

import { AppConfig } from '@/src/constants';
import { generator as generateId } from '@/src/data/database/idGenerator';
import { AccountType } from '@/src/data/models/Account';
import { JournalStatus } from '@/src/data/models/Journal';
import { PlannedPaymentStatus } from '@/src/data/models/PlannedPayment';
import { TransactionType } from '@/src/data/models/Transaction';
import {
  ImportedAccount,
  ImportedBudget,
  ImportedBudgetScope,
  ImportedJournal,
  ImportedPlannedPayment,
  ImportedTransaction,
  importRepository,
} from '@/src/data/repositories/ImportRepository';
import { ImportFileContext, ImportPlugin, ImportStats } from '@/src/services/import/types';
import { integrityService } from '@/src/services/integrity-service';
import { JournalDisplayType, WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { workplaceService } from '@/src/services/WorkplaceService';
import { preferences } from '@/src/utils/preferences';

// Ivy Wallet Interfaces
interface IvyAccount {
  id: string;
  name: string;
  currency?: string;
  color: number;
  icon?: string;
  accountCategory?: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
  archived?: boolean;
}

interface IvyBudget {
  id: string;
  name: string;
  amount: number;
  categoryIdsSerialized?: string;
  accountIdsSerialized?: string;
  isDeleted?: boolean;
  orderId?: number;
}

interface IvySettings {
  id: string;
  name: string;
  currency: string;
  isDeleted?: boolean;
}

interface IvyCategory {
  id: string;
  name: string;
  color: number;
  icon?: string;
}

interface IvyTransaction {
  id: string;
  accountId: string;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  amount: number;
  toAccountId?: string;
  toAmount?: number;
  title?: string;
  description?: string;
  dateTime?: string;
  categoryId?: string;
  isDeleted?: boolean;
  dueDate?: string | number;
  recurringRuleId?: string;
}

interface IvyPlannedPaymentRule {
  id: string;
  startDate?: string;
  intervalN?: number;
  intervalType?: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
  oneTime: boolean;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  accountId: string;
  amount: number;
  categoryId?: string;
  title?: string;
  description?: string;
  toAccountId?: string;
  toAmount?: number;
  isDeleted?: boolean;
}

interface IvyData {
  accounts: IvyAccount[];
  categories: IvyCategory[];
  transactions: IvyTransaction[];
  budgets?: IvyBudget[];
  settings?: IvySettings[];
  plannedPaymentRules?: IvyPlannedPaymentRule[];
}

/**
 * Robustly parse serialized Ivy IDs which can be either a JSON array
 * or a raw ID string.
 */
function parseSerializedIds(serialized?: string): string[] {
  if (!serialized) return [];
  try {
    const parsed = JSON.parse(serialized);
    if (Array.isArray(parsed)) return parsed;
    return [String(parsed)];
  } catch {
    // If it's not JSON, it might be a raw ID string
    return [serialized];
  }
}

/**
 * Calculates the next occurrence based on interval and recurrence rules.
 * This is a standalone version of the logic in PlannedPaymentService.
 */
function advanceOccurrence(
  current: number,
  intervalN: number,
  intervalType: string,
  recurrenceDay?: number,
  recurrenceMonth?: number,
): number {
  const date = new Date(current);
  date.setHours(0, 0, 0, 0);

  switch (intervalType) {
    case 'DAILY':
      date.setDate(date.getDate() + intervalN);
      break;
    case 'WEEKLY':
      date.setDate(date.getDate() + intervalN * 7);
      if (recurrenceDay !== undefined && recurrenceDay !== null) {
        const currentDay = date.getDay();
        const diff = (recurrenceDay - currentDay + 7) % 7;
        date.setDate(date.getDate() + diff);
      }
      break;
    case 'MONTHLY':
      {
        const targetDay = recurrenceDay ?? date.getDate();
        date.setDate(1);
        date.setMonth(date.getMonth() + intervalN);
        const lastDayOfTargetMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
        date.setDate(Math.min(targetDay, lastDayOfTargetMonth));
      }
      break;
    case 'YEARLY':
      {
        const targetMonth =
          recurrenceMonth !== undefined && recurrenceMonth !== null
            ? recurrenceMonth - 1
            : date.getMonth();
        const targetDay = recurrenceDay ?? date.getDate();
        date.setFullYear(date.getFullYear() + intervalN);
        date.setDate(1);
        date.setMonth(targetMonth);
        const lastDayOfTargetMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
        date.setDate(Math.min(targetDay, lastDayOfTargetMonth));
      }
      break;
  }
  return date.getTime();
}

export const ivyPlugin: ImportPlugin = {
  id: 'ivy',
  name: 'Ivy Wallet Backup',
  description: 'Migrate data from an Ivy Wallet backup file.',
  icon: '🌱',

  detect(context: ImportFileContext): boolean {
    if (!context.json || typeof context.json !== 'object') return false;

    const obj = context.json as Record<string, unknown>;

    // Ivy format has accounts, categories, and transactions
    // The presence of 'categories' is the strongest differentiator from native format
    const hasAccounts = Array.isArray(obj.accounts);
    const hasCategories = Array.isArray(obj.categories);
    const hasTransactions = Array.isArray(obj.transactions);

    return hasAccounts && hasCategories && hasTransactions;
  },

  async import(
    context: ImportFileContext,
    workplaceId: WorkplaceId,
    onProgress?: (message: string, progress: number) => void,
  ): Promise<ImportStats> {
    const targetDefaultCurrency = await workplaceService.getCurrency(workplaceId);

    if (!this.detect(context)) {
      throw new Error('Invalid Ivy Wallet backup format');
    }
    const data: IvyData = context.json as IvyData;

    const UNKNOWN_CATEGORY_ID = 'ivy-unknown-category';
    let needsUnknownCategory = false;

    data.transactions.forEach(tx => {
      if (!tx.title && !tx.description) {
        tx.title = 'unknown';
      }
      if (tx.type !== 'TRANSFER' && !tx.categoryId) {
        tx.categoryId = UNKNOWN_CATEGORY_ID;
        needsUnknownCategory = true;
      }
    });

    if (data.plannedPaymentRules) {
      data.plannedPaymentRules.forEach(rule => {
        if (!rule.title && !rule.description) {
          rule.title = 'unknown';
        }
        if (rule.type !== 'TRANSFER' && !rule.categoryId) {
          rule.categoryId = UNKNOWN_CATEGORY_ID;
          needsUnknownCategory = true;
        }
      });
    }

    if (needsUnknownCategory && !data.categories.some(c => c.id === UNKNOWN_CATEGORY_ID)) {
      data.categories.push({
        id: UNKNOWN_CATEGORY_ID,
        name: 'unknown',
        color: -984833, // Default grey color
        icon: 'help-circle',
      });
    }

    logger.info('[IvyPlugin] Starting Import from Ivy Wallet JSON...');
    logger.info(
      `[IvyPlugin] Found ${data.accounts.length} accounts, ${data.categories.length} categories, ${data.transactions.length} transactions, ${data.budgets?.length || 0} budgets`,
    );

    // 1. Extract base currency and name from settings
    const ivySettings = data.settings?.find(s => !s.isDeleted) || data.settings?.[0];
    const ivyBaseCurrency = ivySettings?.currency || targetDefaultCurrency;
    const ivyUserName = ivySettings?.name || '';

    if (ivySettings) {
      logger.info(
        `[IvyPlugin] Identified base currency: ${ivyBaseCurrency} and user: ${ivyUserName}`,
      );
    }

    // 2. Wipe existing data for clean import
    logger.warn(`[IvyPlugin] Wiping workplace ${workplaceId} before import...`);
    onProgress?.('Wiping workplace data...', 0.05);
    await integrityService.resetWorkplace(workplaceId);
    const accountImports: ImportedAccount[] = [];

    // 2. Pre-Scan Transactions for Category Usage (Per Currency)
    onProgress?.('Analyzing categories...', 0.1);
    interface CategoryStat {
      expenseCount: number;
      incomeCount: number;
    }

    const categoryUsageMap = new Map<string, CategoryStat>();
    const categoryCurrencies = new Map<string, Set<string>>();

    const rawIvyAccountCurrency = new Map<string, string>();
    data.accounts.forEach(a => {
      rawIvyAccountCurrency.set(a.id, a.currency || targetDefaultCurrency);
    });

    data.transactions.forEach(tx => {
      if (tx.isDeleted) return;
      if (tx.dueDate) return;
      if (!tx.categoryId) return;

      let currency = targetDefaultCurrency;
      if (tx.accountId && rawIvyAccountCurrency.has(tx.accountId)) {
        currency = rawIvyAccountCurrency.get(tx.accountId)!;
      }

      const key = `${tx.categoryId}:::${currency}`;

      if (!categoryUsageMap.has(key)) {
        categoryUsageMap.set(key, { expenseCount: 0, incomeCount: 0 });
      }
      const stats = categoryUsageMap.get(key)!;

      if (tx.type === 'EXPENSE') stats.expenseCount++;
      if (tx.type === 'INCOME') stats.incomeCount++;

      if (!categoryCurrencies.has(tx.categoryId)) {
        categoryCurrencies.set(tx.categoryId, new Set());
      }
      categoryCurrencies.get(tx.categoryId)!.add(currency);
    });

    // Add categories from budgets to ensure accounts are created for them
    if (data.budgets) {
      data.budgets.forEach(budget => {
        if (budget.isDeleted || !budget.categoryIdsSerialized) return;
        const catIds = parseSerializedIds(budget.categoryIdsSerialized);
        catIds.forEach(catId => {
          const key = `${catId}:::${ivyBaseCurrency}`;
          if (!categoryUsageMap.has(key)) {
            categoryUsageMap.set(key, { expenseCount: 0, incomeCount: 0 });
          }
          if (!categoryCurrencies.has(catId)) {
            categoryCurrencies.set(catId, new Set());
          }
          categoryCurrencies.get(catId)!.add(ivyBaseCurrency);
        });
      });
    }

    // Add categories from planned payment rules
    if (data.plannedPaymentRules) {
      data.plannedPaymentRules.forEach(rule => {
        if (rule.isDeleted || !rule.categoryId) return;

        let currency = targetDefaultCurrency;
        if (rule.accountId && rawIvyAccountCurrency.has(rule.accountId)) {
          currency = rawIvyAccountCurrency.get(rule.accountId)!;
        }

        const key = `${rule.categoryId}:::${currency}`;
        if (!categoryUsageMap.has(key)) {
          categoryUsageMap.set(key, { expenseCount: 0, incomeCount: 0 });
        }

        // Track usage type for income/expense determination
        const stats = categoryUsageMap.get(key)!;
        if (rule.type === 'EXPENSE') stats.expenseCount++;
        if (rule.type === 'INCOME') stats.incomeCount++;

        if (!categoryCurrencies.has(rule.categoryId)) {
          categoryCurrencies.set(rule.categoryId, new Set());
        }
        categoryCurrencies.get(rule.categoryId)!.add(currency);
      });
    }

    // 3. Create Accounts
    onProgress?.('Preparing accounts...', 0.15);
    const accountMap = new Map<string, string>();
    const accountCurrencyMap = new Map<string, string>();
    const categoryAccountMap = new Map<string, string>();
    const journalMap = new Map<string, string>();
    const plannedPaymentMap = new Map<string, string>();

    data.accounts.forEach(a => {
      const balanceId = generateId();
      accountMap.set(a.id, balanceId);
      accountCurrencyMap.set(balanceId, a.currency || targetDefaultCurrency);
    });

    for (const key of categoryUsageMap.keys()) {
      const balanceId = generateId();
      const [, currency] = key.split(':::');
      categoryAccountMap.set(key, balanceId);
      accountCurrencyMap.set(balanceId, currency);
    }

    // 4. Prepare ALL accounts for sorting
    interface PendingAccount {
      id: string;
      name: string;
      currency: string;
      type: AccountType;
      description: string;
      icon?: string;
      isOriginal: boolean;
    }

    const allPendingAccounts: PendingAccount[] = [];
    const ivyCategoryLookup = new Map<string, IvyCategory>();
    data.categories.forEach(c => ivyCategoryLookup.set(c.id, c));

    // Add Original Accounts
    data.accounts.forEach(ivyAcc => {
      const id = accountMap.get(ivyAcc.id)!;
      const description = ivyAcc.archived
        ? '[ARCHIVED] ' + (ivyAcc.name || '')
        : 'Imported from Ivy Wallet';
      const cat = ivyAcc.accountCategory || 'ASSET';
      let mappedType = AccountType.ASSET;
      if (cat === 'LIABILITY') mappedType = AccountType.LIABILITY;
      else if (cat === 'EQUITY') mappedType = AccountType.EQUITY;
      else if (cat === 'INCOME') mappedType = AccountType.INCOME;
      else if (cat === 'EXPENSE') mappedType = AccountType.EXPENSE;

      allPendingAccounts.push({
        id,
        name: ivyAcc.name,
        currency: ivyAcc.currency || targetDefaultCurrency,
        type: mappedType,
        description,
        icon: ivyAcc.icon,
        isOriginal: true,
      });
    });

    // Add Category Accounts
    for (const [key, stats] of categoryUsageMap.entries()) {
      const [categoryId, currency] = key.split(':::');
      const ivyCat = ivyCategoryLookup.get(categoryId);
      if (!ivyCat) continue;

      const id = categoryAccountMap.get(key)!;
      const name = `${ivyCat.name} (${currency})`;

      let type = AccountType.EXPENSE;
      if (stats.incomeCount > stats.expenseCount) {
        type = AccountType.INCOME;
      }

      allPendingAccounts.push({
        id,
        name,
        currency,
        type,
        description: 'Imported Category',
        icon: ivyCat.icon,
        isOriginal: false,
      });
    }

    // Sort Accounts
    allPendingAccounts.sort((a, b) => {
      if (a.isOriginal && !b.isOriginal) return -1;
      if (!a.isOriginal && b.isOriginal) return 1;

      if (!a.isOriginal && !b.isOriginal) {
        const nameCompare = a.name.localeCompare(b.name);
        if (nameCompare !== 0) return nameCompare;
        return a.currency.localeCompare(b.currency);
      }

      return 0;
    });

    // Create account actions
    allPendingAccounts.forEach((acc, index) => {
      accountImports.push({
        id: acc.id,
        name: acc.name,
        accountType: acc.type,
        currencyCode: acc.currency,
        description: acc.description,
        icon: acc.icon as any,
        orderNum: index + 1,
      });
    });

    // 5. Map Planned Payments (Pre-pass to establish ID mappings for journals)
    onProgress?.('Mapping planned payments...', 0.18);
    const plannedPaymentImports: ImportedPlannedPayment[] = [];
    const mapIvyInterval = (ivyInterval?: string): string => {
      switch (ivyInterval) {
        case 'DAY':
          return 'DAILY';
        case 'WEEK':
          return 'WEEKLY';
        case 'MONTH':
          return 'MONTHLY';
        case 'YEAR':
          return 'YEARLY';
        default:
          return 'MONTHLY';
      }
    };

    const allRules = data.plannedPaymentRules || [];
    if (allRules.length > 0) {
      allRules.forEach(rule => {
        if (rule.isDeleted) return;

        const fromAccountId = accountMap.get(rule.accountId);
        if (!fromAccountId) return;

        const newRuleId = generateId();
        plannedPaymentMap.set(rule.id, newRuleId);

        let currencyCode = accountCurrencyMap.get(fromAccountId) || targetDefaultCurrency;
        let toAccountId = rule.toAccountId ? accountMap.get(rule.toAccountId) : undefined;
        const intervalType = mapIvyInterval(rule.intervalType);
        const startDate = rule.startDate ? new Date(rule.startDate).getTime() : Date.now();
        const startLocalDate = new Date(startDate);
        const recurrenceDay = startLocalDate.getDate();
        const recurrenceMonth = startLocalDate.getMonth() + 1; // 1-indexed

        // Normalize occurrence date to midnight to align with PlannedPaymentService expectations
        const normalizedNextOcc = new Date(startDate);
        normalizedNextOcc.setHours(0, 0, 0, 0);
        let finalNextOcc = normalizedNextOcc.getTime();

        // Advance to future logic
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const today = now.getTime();

        if (rule.oneTime) {
          if (finalNextOcc < today) return;
        } else if (finalNextOcc < today) {
          let safetyCap = 0;
          while (finalNextOcc < today && safetyCap < 1000) {
            finalNextOcc = advanceOccurrence(
              finalNextOcc,
              rule.intervalN || 1,
              intervalType,
              recurrenceDay,
              recurrenceMonth,
            );
            safetyCap++;
          }
        }

        if (rule.categoryId) {
          const key = `${rule.categoryId}:::${currencyCode}`;
          const catAccId = categoryAccountMap.get(key);
          if (catAccId) {
            if (rule.type === 'INCOME') {
              const catFrom = catAccId;
              plannedPaymentImports.push({
                id: newRuleId,
                name: rule.title || 'Income Rule',
                description: rule.description,
                amount: Math.abs(rule.amount),
                currencyCode,
                fromAccountId: catFrom,
                toAccountId: fromAccountId,
                intervalN: rule.intervalN || 1,
                intervalType,
                startDate,
                nextOccurrence: finalNextOcc,
                status: PlannedPaymentStatus.ACTIVE,
                isAutoPost: false,
                recurrenceDay,
                recurrenceMonth,
                endDate: rule.oneTime ? finalNextOcc : undefined,
              });
              return;
            } else if (rule.type === 'EXPENSE') {
              toAccountId = catAccId;
            }
          }
        }

        plannedPaymentImports.push({
          id: newRuleId,
          name: rule.title || (rule.type === 'TRANSFER' ? 'Transfer Rule' : 'Payment Rule'),
          description: rule.description,
          amount: Math.abs(rule.amount),
          currencyCode,
          fromAccountId,
          toAccountId: toAccountId || '',
          intervalN: rule.intervalN || 1,
          intervalType,
          startDate,
          nextOccurrence: finalNextOcc,
          status: PlannedPaymentStatus.ACTIVE,
          isAutoPost: false,
          recurrenceDay,
          recurrenceMonth,
          endDate: rule.oneTime ? finalNextOcc : undefined,
        });
      });
    }

    // 6. Create Journals & Transactions
    onProgress?.('Mapping transactions...', 0.2);
    const journalImports: ImportedJournal[] = [];
    const transactionImports: ImportedTransaction[] = [];
    const skippedItems: { id: string; reason: string; description?: string }[] = [];

    const totalTransactions = data.transactions.length;
    for (let i = 0; i < totalTransactions; i++) {
      if (i % 500 === 0) {
        // Yield to UI thread every so often
        onProgress?.(
          `Processing transactions (${i} of ${totalTransactions})...`,
          0.2 + (i / totalTransactions) * 0.5,
        );
        await new Promise(r => setTimeout(r, 0));
      }

      const tx = data.transactions[i];
      const txDesc = tx.title || tx.description || 'Unknown Transaction';

      if (tx.isDeleted) {
        skippedItems.push({ id: tx.id, reason: 'Deleted', description: txDesc });
        continue;
      }

      if (tx.dueDate) {
        skippedItems.push({ id: tx.id, reason: 'Planned Payment', description: txDesc });
        continue;
      }

      const journalId = generateId();
      journalMap.set(tx.id, journalId);
      const timestamp = tx.dateTime ? new Date(tx.dateTime).getTime() : Date.now();

      const description = tx.title || (tx.type === 'TRANSFER' ? 'Transfer' : 'Transaction');
      const notes = tx.description;

      // Check for special system transactions
      const descLower = description.toLowerCase();
      const catLower = tx.categoryId
        ? ivyCategoryLookup.get(tx.categoryId)?.name?.toLowerCase() || ''
        : '';

      const isOpeningBalance =
        descLower.includes('opening balance') || catLower.includes('opening balance');
      const isAdjustBalance =
        descLower.includes('adjust balance') || catLower.includes('adjust balance');

      let sourceId: string | undefined;
      let destId: string | undefined;
      let displayType: JournalDisplayType;
      let currencyCode = targetDefaultCurrency;

      if (tx.accountId && rawIvyAccountCurrency.has(tx.accountId)) {
        currencyCode = rawIvyAccountCurrency.get(tx.accountId)!;
      }

      const key = `${tx.categoryId}:::${currencyCode}`;

      if (isOpeningBalance || isAdjustBalance) {
        // Route to the dedicated Equity account based on type
        const accountConfig = isOpeningBalance
          ? AppConfig.systemAccounts.openingBalances
          : AppConfig.systemAccounts.balanceCorrections;

        const name = `${accountConfig.namePrefix} (${currencyCode})`;
        const systemKey = `SYSTEM_${isOpeningBalance ? 'OPENING_BALANCE' : 'BALANCE_CORRECTION'}:::${currencyCode}`;

        if (!categoryAccountMap.has(systemKey)) {
          categoryAccountMap.set(systemKey, generateId());
          accountCurrencyMap.set(categoryAccountMap.get(systemKey)!, currencyCode);

          // Add this to our accounts to be created
          accountImports.push({
            id: categoryAccountMap.get(systemKey)!,
            name,
            accountType: AccountType.EQUITY,
            currencyCode,
            description: accountConfig.description,
            icon: accountConfig.icon,
            orderNum: accountImports.length + 1,
          });
        }

        // For INCOME (positive adjustment): money comes FROM equity TO account
        // For EXPENSE (negative adjustment): money goes FROM account TO equity
        if (tx.type === 'INCOME') {
          sourceId = categoryAccountMap.get(systemKey);
          destId = accountMap.get(tx.accountId);
          displayType = JournalDisplayType.INCOME;
        } else {
          sourceId = accountMap.get(tx.accountId);
          destId = categoryAccountMap.get(systemKey);
          displayType = JournalDisplayType.EXPENSE;
        }

        if (!sourceId || !destId) {
          skippedItems.push({
            id: tx.id,
            reason: `Missing account mapping for system tx (${systemKey})`,
            description: txDesc,
          });
        }
      } else if (tx.type === 'TRANSFER') {
        const sourceAccId = accountMap.get(tx.accountId);
        const destAccId = accountMap.get(tx.toAccountId || '');
        if (!sourceAccId || !destAccId) {
          skippedItems.push({
            id: tx.id,
            reason: 'Invalid Transfer Accounts',
            description: txDesc,
          });
          continue;
        }
        sourceId = sourceAccId;
        destId = destAccId;
        displayType = JournalDisplayType.TRANSFER;
      } else if (tx.type === 'EXPENSE') {
        sourceId = accountMap.get(tx.accountId);
        destId = categoryAccountMap.get(key);
        displayType = JournalDisplayType.EXPENSE;
        if (!destId) {
          skippedItems.push({
            id: tx.id,
            reason: `Missing Category Account (${key})`,
            description: txDesc,
          });
        }
      } else {
        // INCOME
        sourceId = categoryAccountMap.get(key);
        destId = accountMap.get(tx.accountId);
        displayType = JournalDisplayType.INCOME;
        if (!sourceId) {
          skippedItems.push({
            id: tx.id,
            reason: `Missing Category Account (${key})`,
            description: txDesc,
          });
        }
      }

      if (!sourceId || !destId) {
        continue;
      }

      const amount = Math.abs(tx.amount);
      const toAmount = tx.toAmount !== undefined ? Math.abs(tx.toAmount) : amount;

      journalImports.push({
        id: journalId,
        journalDate: timestamp,
        description,
        notes,
        currencyCode,
        status: JournalStatus.POSTED,
        totalAmount: amount,
        transactionCount: 2,
        displayType,
        plannedPaymentId: tx.recurringRuleId
          ? plannedPaymentMap.get(tx.recurringRuleId)
          : undefined,
      });

      // Transaction 1: SOURCE (Credit)
      transactionImports.push({
        id: generateId(),
        journalId,
        transactionDate: timestamp,
        accountId: sourceId!,
        amount,
        transactionType: TransactionType.CREDIT,
        currencyCode,
      });

      // Transaction 2: DEST (Debit)
      const txRecord: ImportedTransaction = {
        id: generateId(),
        journalId,
        transactionDate: timestamp,
        accountId: destId!,
        amount: toAmount,
        transactionType: TransactionType.DEBIT,
        currencyCode,
      };

      // Handle multi-currency transfers
      if (tx.type === 'TRANSFER' && tx.toAccountId) {
        const destAccId = accountMap.get(tx.toAccountId);
        const destCurr = accountCurrencyMap.get(destAccId!);
        if (destCurr) {
          txRecord.currencyCode = destCurr;
          if (amount !== 0 && toAmount !== 0) {
            txRecord.exchangeRate = amount / toAmount;
          }
        }
      }

      transactionImports.push(txRecord);
    }

    // 6. Map Budgets
    onProgress?.('Mapping budgets...', 0.7);
    const budgetImports: ImportedBudget[] = [];
    const budgetScopeImports: ImportedBudgetScope[] = [];

    if (data.budgets) {
      data.budgets.forEach(ivyBudget => {
        if (ivyBudget.isDeleted) return;

        const budgetId = ivyBudget.id;
        // Ivy amount is likely already in major units if it's a Double in Kotlin
        // But let's be careful. Our Budget model expects "amount: number"
        // IvyEntity says "amount: Double"
        const amount = ivyBudget.amount; // Convert to minor units if needed

        budgetImports.push({
          id: budgetId,
          name: ivyBudget.name,
          amount: amount,
          currencyCode: ivyBaseCurrency, // Use currency identified from settings
          startMonth: new Date().toISOString().substring(0, 7), // Default to current month
          active: true,
        });

        // Map category scopes
        if (ivyBudget.categoryIdsSerialized) {
          const catIds = parseSerializedIds(ivyBudget.categoryIdsSerialized);
          catIds.forEach(catId => {
            // Find all category-currency accounts for this category
            for (const [key, balanceId] of categoryAccountMap.entries()) {
              if (key.startsWith(`${catId}:::`)) {
                budgetScopeImports.push({
                  id: generateId(),
                  budgetId,
                  accountId: balanceId,
                });
              }
            }
          });
        }

        // Map account scopes
        if (ivyBudget.accountIdsSerialized) {
          const accIds = parseSerializedIds(ivyBudget.accountIdsSerialized);
          accIds.forEach(accId => {
            const balanceId = accountMap.get(accId);
            if (balanceId) {
              budgetScopeImports.push({
                id: generateId(),
                budgetId,
                accountId: balanceId,
              });
            }
          });
        }
      });
    }

    // 8. Write to DB
    onProgress?.('Saving to database...', 0.75);
    logger.info('[IvyPlugin] Writing mapped data to database...');
    await importRepository.batchInsert(workplaceId, {
      accounts: accountImports,
      journals: journalImports,
      transactions: transactionImports,
      budgets: budgetImports,
      budgetScopes: budgetScopeImports,
      plannedPayments: plannedPaymentImports,
    });

    // 7. Run integrity check to repair account balances
    onProgress?.('Running integrity check...', 0.85);
    logger.info('[IvyPlugin] Running integrity check to fix account balances...');
    const integrityResult = await integrityService.forceRunCheck(workplaceId);
    logger.info('[IvyPlugin] Integrity check complete', {
      discrepanciesFound: integrityResult.discrepanciesFound,
      repairsSuccessful: integrityResult.repairsSuccessful,
    });

    // 9. Restore Preferences
    onProgress?.('Finalizing...', 0.95);
    await preferences.setOnboardingCompleted(true);

    if (ivyUserName) {
      await preferences.setUserName(ivyUserName);
      // Also update workplace name if it's currently a default
      const workplace = await workplaceService.getWorkplace(workplaceId);
      if (workplace && workplace.name.includes('Workplace')) {
        await workplaceService.updateWorkplace(workplaceId, { name: `${ivyUserName}'s Workplace` });
      }
    }

    if (ivyBaseCurrency) {
      await workplaceService.updateWorkplace(workplaceId, { defaultCurrencyCode: ivyBaseCurrency });
    } else {
      const firstCurrency = accountCurrencyMap.values().next().value;
      if (firstCurrency) {
        await workplaceService.updateWorkplace(workplaceId, { defaultCurrencyCode: firstCurrency });
      }
    }

    logger.info('[IvyPlugin] Import successful.');

    if (skippedItems.length > 0) {
      logger.warn('[IvyPlugin] Skipped Items:', {
        count: skippedItems.length,
        items: skippedItems,
      });
    }

    return {
      accounts: accountImports.length,
      journals: journalImports.length,
      transactions: transactionImports.length,
      budgets: budgetImports.length,
      plannedPayments: plannedPaymentImports.length,
      auditLogs: 0,
      skippedTransactions: skippedItems.length,
      skippedItems,
    };
  },
};
