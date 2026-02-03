/**
 * Native Import Plugin
 *
 * Handles import of Full Frills Balance native backup format.
 * Refactored from import-service.ts to implement ImportPlugin interface.
 */

import { importRepository } from '@/src/data/repositories/ImportRepository';
import { ImportPlugin, ImportStats } from '@/src/services/import/types';
import { integrityService } from '@/src/services/integrity-service';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';

interface NativeImportData {
    version: string;
    preferences: {
        theme?: string;
        onboardingCompleted?: boolean;
        userName?: string;
        defaultCurrencyCode?: string;
        isPrivacyMode?: boolean;
    };
    accounts: any[];
    journals: any[];
    transactions: any[];
    auditLogs?: any[];
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

    async import(jsonContent: string): Promise<ImportStats> {
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

        try {
            // 1. Wipe existing data
            logger.warn('[NativePlugin] Wiping database for import...');
            await integrityService.resetDatabase({ seedDefaults: false });

            // 2. Clear and restore preferences
            await preferences.clearPreferences();
            if (data.preferences) {
                const validThemes = ['light', 'dark', 'system'] as const;
                if (data.preferences.theme && validThemes.includes(data.preferences.theme as typeof validThemes[number])) {
                    await preferences.setTheme(data.preferences.theme as 'light' | 'dark' | 'system');
                }
                if (data.preferences.onboardingCompleted !== undefined) await preferences.setOnboardingCompleted(data.preferences.onboardingCompleted);
                if (data.preferences.userName) await preferences.setUserName(data.preferences.userName);
                if (data.preferences.defaultCurrencyCode) await preferences.setDefaultCurrencyCode(data.preferences.defaultCurrencyCode);
                if (data.preferences.isPrivacyMode !== undefined) await preferences.setIsPrivacyMode(data.preferences.isPrivacyMode);
            }

            // 3. Import Data in Batch
            logger.info('[NativePlugin] Executing batch insert...');
            await importRepository.batchInsert({
                accounts: data.accounts.map(acc => ({
                    id: acc.id,
                    name: acc.name,
                    accountType: acc.accountType,
                    currencyCode: acc.currencyCode,
                    parentAccountId: acc.parentAccountId,
                    description: acc.description,
                    createdAt: acc.createdAt ? new Date(acc.createdAt).getTime() : undefined
                })),
                journals: data.journals.map(j => ({
                    id: j.id,
                    journalDate: new Date(j.journalDate).getTime(),
                    description: j.description,
                    currencyCode: j.currencyCode,
                    status: j.status,
                    totalAmount: j.totalAmount,
                    transactionCount: j.transactionCount,
                    displayType: j.displayType,
                    createdAt: j.createdAt ? new Date(j.createdAt).getTime() : undefined
                })),
                transactions: data.transactions.map(t => ({
                    id: t.id,
                    journalId: t.journalId,
                    accountId: t.accountId,
                    amount: t.amount,
                    transactionType: t.transactionType,
                    currencyCode: t.currencyCode,
                    transactionDate: new Date(t.transactionDate).getTime(),
                    notes: t.notes,
                    exchangeRate: t.exchangeRate,
                    createdAt: t.createdAt ? new Date(t.createdAt).getTime() : undefined
                })),
                auditLogs: (data.auditLogs || []).map((log: any) => ({
                    id: log.id,
                    entityType: log.entityType,
                    entityId: log.entityId,
                    action: log.action,
                    changes: log.changes,
                    timestamp: log.timestamp,
                    createdAt: log.createdAt ? new Date(log.createdAt).getTime() : undefined
                }))
            });

            logger.info('[NativePlugin] Import successful.');
            return {
                accounts: data.accounts.length,
                journals: data.journals.length,
                transactions: data.transactions.length,
                auditLogs: data.auditLogs?.length || 0,
                skippedTransactions: 0
            };
        } catch (error) {
            logger.error('[NativePlugin] Import failed mid-process', error);
            throw new Error('Failed to import data into database');
        }
    }
};
