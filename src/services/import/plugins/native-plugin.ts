/**
 * Native Import Plugin
 *
 * Handles import of Full Frills Balance native backup format.
 * Refactored from import-service.ts to implement ImportPlugin interface.
 */

import { AppConfig } from '@/src/constants';
import { importRepository } from '@/src/data/repositories/ImportRepository';
import {
    ImportedAccount,
    ImportedAccountMetadata,
    ImportedAuditLog,
    ImportedBudget,
    ImportedBudgetScope,
    ImportedCurrency,
    ImportedExchangeRate,
    ImportedJournal,
    ImportedTransaction
} from '@/src/data/repositories/ImportRepository';
import { ImportPlugin, ImportStats } from '@/src/services/import/types';
import { integrityService } from '@/src/services/integrity-service';
import { logger } from '@/src/utils/logger';
import { preferences, UIPreferences } from '@/src/utils/preferences';

interface NativeImportData {
    version: string;
    preferences?: Partial<UIPreferences>;
    accounts: ImportedAccount[];
    journals: ImportedJournal[];
    transactions: ImportedTransaction[];
    auditLogs?: ImportedAuditLog[];
    budgets?: ImportedBudget[];
    budgetScopes?: ImportedBudgetScope[];
    currencies?: ImportedCurrency[];
    exchangeRates?: ImportedExchangeRate[];
    accountMetadata?: ImportedAccountMetadata[];
}

function parseTimestamp(value?: number | string): number | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;

    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? undefined : parsed;
}

export const nativePlugin: ImportPlugin = {
    id: 'native',
    name: 'Full Frills Backup',
    description: 'Restore from a JSON backup file created by this app.',
    icon: '⚡️',

    detect(data: unknown): boolean {
        if (!data || typeof data !== 'object') return false;

        const obj = data as Record<string, unknown>;

        // Native format has journals (not categories) and a version field
        const hasJournals = Array.isArray(obj.journals);
        const hasAccounts = Array.isArray(obj.accounts);
        const hasTransactions = Array.isArray(obj.transactions);
        const hasVersion = typeof obj.version === 'string';

        // Categories is the hallmark of Ivy format, not native
        const hasCategories = Array.isArray(obj.categories);

        return hasJournals && hasAccounts && hasTransactions && hasVersion && !hasCategories;
    },

    async import(jsonContent: string, onProgress?: (message: string, progress: number) => void): Promise<ImportStats> {
        logger.info('[NativePlugin] Starting import...');

        let data: NativeImportData;
        try {
            data = JSON.parse(jsonContent);
        } catch (error) {
            logger.error('[NativePlugin] Failed to parse JSON', error);
            throw new Error('Invalid JSON file format');
        }

        // Basic validation
        if (!data.accounts || !data.journals || !data.transactions) {
            throw new Error('Invalid export file: missing required data sections');
        }

        logger.info(`[NativePlugin] Validated file. Found ${data.accounts.length} accounts, ${data.journals.length} journals, ${data.transactions.length} transactions.`);
        const defaultCurrencyCode = data.preferences?.defaultCurrencyCode || AppConfig.defaultCurrency;

        try {
            // 1. Wipe existing data
            onProgress?.('Wiping database...', 0.1);
            logger.warn('[NativePlugin] Wiping database for import...');
            await integrityService.resetDatabase();

            // 2. Clear and restore preferences
            onProgress?.('Restoring preferences...', 0.2);
            await preferences.restorePreferences(data.preferences);

            // 3. Import Data in Batch
            onProgress?.('Saving data to database (this may take a while)...', 0.4);
            // Yield UI
            await new Promise(resolve => setTimeout(resolve, 0));
            logger.info('[NativePlugin] Executing batch insert...');
            await importRepository.batchInsert({
                accounts: data.accounts.map(acc => ({
                    id: acc.id,
                    name: acc.name,
                    accountType: acc.accountType,
                    accountSubcategory: acc.accountSubcategory,
                    currencyCode: acc.currencyCode || defaultCurrencyCode,
                    parentAccountId: acc.parentAccountId,
                    description: acc.description,
                    icon: acc.icon,
                    orderNum: acc.orderNum,
                    createdAt: parseTimestamp(acc.createdAt),
                    updatedAt: parseTimestamp(acc.updatedAt),
                    deletedAt: parseTimestamp(acc.deletedAt),
                })),
                journals: data.journals.map(j => ({
                    id: j.id,
                    journalDate: parseTimestamp(j.journalDate) ?? Date.now(),
                    description: j.description,
                    currencyCode: j.currencyCode,
                    status: j.status,
                    originalJournalId: j.originalJournalId,
                    reversingJournalId: j.reversingJournalId,
                    totalAmount: j.totalAmount,
                    transactionCount: j.transactionCount,
                    displayType: j.displayType,
                    createdAt: parseTimestamp(j.createdAt),
                    updatedAt: parseTimestamp(j.updatedAt),
                    deletedAt: parseTimestamp(j.deletedAt),
                })),
                transactions: data.transactions.map(t => ({
                    id: t.id,
                    journalId: t.journalId,
                    accountId: t.accountId,
                    amount: t.amount,
                    transactionType: t.transactionType,
                    currencyCode: t.currencyCode || data.accounts.find(a => a.id === t.accountId)?.currencyCode || defaultCurrencyCode,
                    transactionDate: parseTimestamp(t.transactionDate) ?? Date.now(),
                    notes: t.notes,
                    exchangeRate: t.exchangeRate,
                    createdAt: parseTimestamp(t.createdAt),
                    updatedAt: parseTimestamp(t.updatedAt),
                    deletedAt: parseTimestamp(t.deletedAt),
                })),
                auditLogs: (data.auditLogs || []).map((log) => ({
                    id: log.id,
                    entityType: log.entityType,
                    entityId: log.entityId,
                    action: log.action,
                    changes: log.changes,
                    timestamp: log.timestamp,
                    createdAt: parseTimestamp(log.createdAt),
                })),
                budgets: (data.budgets || []).map((budget) => ({
                    id: budget.id,
                    name: budget.name,
                    amount: budget.amount,
                    currencyCode: budget.currencyCode || defaultCurrencyCode,
                    startMonth: budget.startMonth,
                    active: budget.active,
                    createdAt: parseTimestamp(budget.createdAt),
                    updatedAt: parseTimestamp(budget.updatedAt),
                })),
                budgetScopes: (data.budgetScopes || []).map((scope) => ({
                    id: scope.id,
                    budgetId: scope.budgetId,
                    accountId: scope.accountId,
                    createdAt: parseTimestamp(scope.createdAt),
                    updatedAt: parseTimestamp(scope.updatedAt),
                })),
                currencies: (data.currencies || []).map((currency) => ({
                    id: currency.id,
                    code: currency.code,
                    symbol: currency.symbol,
                    name: currency.name,
                    precision: currency.precision,
                    createdAt: parseTimestamp(currency.createdAt),
                    updatedAt: parseTimestamp(currency.updatedAt),
                    deletedAt: parseTimestamp(currency.deletedAt),
                })),
                exchangeRates: (data.exchangeRates || []).map((rate) => ({
                    id: rate.id,
                    fromCurrency: rate.fromCurrency,
                    toCurrency: rate.toCurrency,
                    rate: rate.rate,
                    effectiveDate: parseTimestamp(rate.effectiveDate) ?? Date.now(),
                    source: rate.source,
                    createdAt: parseTimestamp(rate.createdAt),
                    updatedAt: parseTimestamp(rate.updatedAt),
                })),
                accountMetadata: (data.accountMetadata || []).map((metadata) => ({
                    id: metadata.id,
                    accountId: metadata.accountId,
                    statementDay: metadata.statementDay,
                    dueDay: metadata.dueDay,
                    minimumPaymentAmount: metadata.minimumPaymentAmount,
                    minimumBalanceAmount: metadata.minimumBalanceAmount,
                    creditLimitAmount: metadata.creditLimitAmount,
                    aprBps: metadata.aprBps,
                    emiDay: metadata.emiDay,
                    loanTenureMonths: metadata.loanTenureMonths,
                    autopayEnabled: metadata.autopayEnabled,
                    gracePeriodDays: metadata.gracePeriodDays,
                    notes: metadata.notes,
                    createdAt: parseTimestamp(metadata.createdAt),
                    updatedAt: parseTimestamp(metadata.updatedAt),
                })),
            });

            onProgress?.('Finalizing import...', 0.95);
            logger.info('[NativePlugin] Import successful.');
            return {
                accounts: data.accounts.length,
                journals: data.journals.length,
                transactions: data.transactions.length,
                budgets: data.budgets?.length || 0,
                auditLogs: data.auditLogs?.length || 0,
                skippedTransactions: 0
            };
        } catch (error) {
            logger.error('[NativePlugin] Import failed mid-process', error);
            throw new Error('Failed to import data into database');
        }
    }
};
