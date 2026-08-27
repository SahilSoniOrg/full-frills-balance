import { AccountType, PlannedPaymentInterval, PlannedPaymentStatus } from '@/src/types/enums';
import type { IconName } from '@/src/types/domainIcons';
import { CanonicalImportBuilder } from '@/src/services/import/canonicalImportBuilder';
import {
  advanceOccurrence,
  mapToNearestAccountColor,
  normalizeIvyColor,
  parseSerializedIds,
  parseTimestampMs,
} from '@/src/services/import/plugins/importPluginHelpers';
import { ImportFileContext, ImportPlugin, ParsedImportResult } from '@/src/services/import/types';
import { logger } from '@/src/utils/logger';

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

export const ivyPlugin: ImportPlugin = {
  id: 'ivy',
  name: 'Ivy Wallet Backup',
  description: 'Migrate data from an Ivy Wallet backup file.',
  icon: '🌱',

  detect(context: ImportFileContext): boolean {
    if (!context.json || typeof context.json !== 'object') return false;

    const obj = context.json as Record<string, unknown>;
    const hasAccounts = Array.isArray(obj.accounts);
    const hasCategories = Array.isArray(obj.categories);
    const hasTransactions = Array.isArray(obj.transactions);

    return hasAccounts && hasCategories && hasTransactions;
  },

  async parse(
    context: ImportFileContext,
    options: {
      defaultCurrency: string;
      onProgress?: (message: string, progress: number) => void;
    },
  ): Promise<ParsedImportResult> {
    const { defaultCurrency: targetDefaultCurrency, onProgress } = options;

    if (!this.detect(context)) {
      throw new Error('Invalid Ivy Wallet backup format');
    }
    const data: IvyData = context.json as IvyData;

    onProgress?.('Parsing backup data...', 0.05);
    logger.info(
      `[IvyPlugin] Parsing backup: ${data.accounts.length} accounts, ${data.categories.length} categories, ${data.transactions.length} transactions`,
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

    const builder = new CanonicalImportBuilder(ivyBaseCurrency);
    builder.setMetadata({
      preferences: { userName: ivyUserName },
      workplace: {
        name: ivyUserName,
        defaultCurrencyCode: ivyBaseCurrency,
      },
      pluginId: 'ivy',
    });

    const rawIvyAccountCurrency = new Map<string, string>();
    data.accounts.forEach(a => {
      rawIvyAccountCurrency.set(a.id, a.currency || ivyBaseCurrency);
    });

    // 2. Register Accounts
    onProgress?.('Preparing accounts...', 0.2);
    data.accounts.forEach(ivyAcc => {
      const cat = ivyAcc.accountCategory || 'ASSET';
      let mappedType = AccountType.ASSET;
      if (cat === 'LIABILITY') mappedType = AccountType.LIABILITY;
      else if (cat === 'EQUITY') mappedType = AccountType.EQUITY;
      else if (cat === 'INCOME') mappedType = AccountType.INCOME;
      else if (cat === 'EXPENSE') mappedType = AccountType.EXPENSE;

      builder.addAccount({
        id: ivyAcc.id,
        name: ivyAcc.name,
        currencyCode: ivyAcc.currency || ivyBaseCurrency,
        accountType: mappedType,
        description: ivyAcc.archived
          ? '[ARCHIVED] ' + (ivyAcc.name || '')
          : 'Imported from Ivy Wallet',
        icon: ivyAcc.icon as IconName,
        color: mapToNearestAccountColor(normalizeIvyColor(ivyAcc.color)),
      });
    });

    // 3. Register Categories
    const ivyCategoryLookup = new Map<string, IvyCategory>();
    data.categories.forEach(c => {
      ivyCategoryLookup.set(c.id, c);
      builder.registerCategory({
        id: c.id,
        name: c.name,
        icon: c.icon as IconName,
        color: mapToNearestAccountColor(normalizeIvyColor(c.color)),
      });
    });

    // 4. Map Planned Payment Rules
    onProgress?.('Mapping planned payments...', 0.3);
    const mapIvyInterval = (ivyInterval?: string): PlannedPaymentInterval => {
      switch (ivyInterval) {
        case 'DAY':
          return PlannedPaymentInterval.DAILY;
        case 'WEEK':
          return PlannedPaymentInterval.WEEKLY;
        case 'MONTH':
          return PlannedPaymentInterval.MONTHLY;
        case 'YEAR':
          return PlannedPaymentInterval.YEARLY;
        default:
          return PlannedPaymentInterval.MONTHLY;
      }
    };

    if (data.plannedPaymentRules) {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const today = now.getTime();

      data.plannedPaymentRules.forEach(rule => {
        if (rule.isDeleted) return;

        const intervalType = mapIvyInterval(rule.intervalType);
        const startDate = rule.startDate ? new Date(rule.startDate).getTime() : Date.now();
        const startLocalDate = new Date(startDate);
        const recurrenceDay = startLocalDate.getDate();
        const recurrenceMonth = startLocalDate.getMonth() + 1;

        const normalizedNextOcc = new Date(startDate);
        normalizedNextOcc.setHours(0, 0, 0, 0);
        let finalNextOcc = normalizedNextOcc.getTime();

        if (rule.oneTime) {
          if (finalNextOcc < today) return;
        } else if (finalNextOcc < today) {
          let safetyCap = 0;
          const intervalName = rule.intervalType ? `${rule.intervalType}LY` : 'MONTHLY';
          while (finalNextOcc < today && safetyCap < 1000) {
            finalNextOcc = advanceOccurrence(
              finalNextOcc,
              rule.intervalN || 1,
              intervalName,
              recurrenceDay,
              recurrenceMonth,
            );
            safetyCap++;
          }
        }

        const currencyCode =
          (rule.accountId && rawIvyAccountCurrency.get(rule.accountId)) || ivyBaseCurrency;

        builder.addPlannedPayment({
          id: rule.id,
          name: rule.title || (rule.type === 'TRANSFER' ? 'Transfer Rule' : 'Payment Rule'),
          description: rule.description,
          amount: Math.abs(rule.amount),
          currencyCode,
          fromAccountId: rule.accountId,
          toAccountId: rule.type === 'TRANSFER' ? rule.toAccountId : rule.categoryId,
          type: rule.type,
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

    // 5. Ingest Transactions
    onProgress?.('Mapping transactions...', 0.5);
    const skippedItems: { id: string; reason: string; description?: string }[] = [];

    data.transactions.forEach(tx => {
      const txDesc = tx.title || tx.description || 'Unknown Transaction';

      if (tx.isDeleted) {
        skippedItems.push({ id: tx.id, reason: 'Deleted', description: txDesc });
        return;
      }
      if (tx.dueDate) {
        skippedItems.push({ id: tx.id, reason: 'Planned Payment', description: txDesc });
        return;
      }

      const timestamp = parseTimestampMs(tx.dateTime);
      const title = tx.title || (tx.type === 'TRANSFER' ? 'Transfer' : 'Transaction');
      const notes = tx.description;

      const descLower = title.toLowerCase();
      const catLower = tx.categoryId
        ? ivyCategoryLookup.get(tx.categoryId)?.name?.toLowerCase() || ''
        : '';

      const isOpeningBalance =
        descLower.includes('opening balance') || catLower.includes('opening balance');
      const isBalanceCorrection =
        descLower.includes('adjust balance') || catLower.includes('adjust balance');

      const currencyCode =
        (tx.accountId && rawIvyAccountCurrency.get(tx.accountId)) || ivyBaseCurrency;

      builder.addTransaction({
        id: tx.id,
        date: timestamp,
        amount: Math.abs(tx.amount),
        targetAmount: tx.toAmount !== undefined ? Math.abs(tx.toAmount) : undefined,
        currencyCode,
        type: tx.type,
        sourceAccountId: tx.accountId,
        targetAccountId: tx.toAccountId,
        categoryId: tx.categoryId,
        description: title,
        notes,
        isOpeningBalance,
        isBalanceCorrection,
      });
    });

    // 6. Ingest Budgets
    onProgress?.('Mapping budgets...', 0.9);
    if (data.budgets) {
      data.budgets.forEach(b => {
        if (b.isDeleted) return;
        const catIds = b.categoryIdsSerialized ? parseSerializedIds(b.categoryIdsSerialized) : [];
        builder.addBudget({
          id: b.id,
          name: b.name,
          amount: b.amount,
          currencyCode: ivyBaseCurrency,
          startMonth: new Date().toISOString().substring(0, 7),
          categoryIds: catIds,
        });
      });
    }

    onProgress?.('Building canonical import...', 0.95);
    const { canonical, issues } = builder.build();

    for (const issue of issues) {
      skippedItems.push({
        id: issue.sourceId || 'builder-issue',
        reason: issue.message,
        description: issue.entity,
      });
    }

    onProgress?.('Parsing complete', 1.0);
    logger.info('[IvyPlugin] Parse successful.');

    return {
      canonical,
      preferences: {
        userName: ivyUserName,
      },
      workplace: {
        name: ivyUserName,
        defaultCurrencyCode: ivyBaseCurrency,
      },
      stats: {
        accounts: canonical.accounts.length,
        journals: canonical.journals.length,
        transactions: canonical.transactions.length,
        budgets: canonical.budgets?.length || 0,
        plannedPayments: canonical.plannedPayments?.length || 0,
        auditLogs: 0,
        skippedTransactions: skippedItems.length,
        skippedItems,
      },
    };
  },
};
