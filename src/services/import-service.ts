/**
 * Import Service
 * 
 * Handles data import from JSON files.
 * Replaces current database with imported data.
 */

import { database } from '../data/database/Database';
import Account from '../data/models/Account';
import Journal from '../data/models/Journal';
import Transaction from '../data/models/Transaction';
import { logger } from '../utils/logger';
import { preferences } from '../utils/preferences';
import { integrityService } from './integrity-service';

export interface ImportStats {
    accounts: number;
    journals: number;
    transactions: number;
    skippedTransactions: number;
    skippedItems?: Array<{ id: string; reason: string; description?: string }>;
}

// Redefining interface if circular dependency is an issue, or just for clarity. 
// Ideally should reside in a shared types file, but for now matching export-service.ts
interface ImportData {
    version: string;
    preferences: any;
    accounts: any[];
    journals: any[];
    transactions: any[];
}

class ImportService {
    /**
     * Imports data from a JSON string.
     * WARNING: This performs a full database wipe before importing.
     */
    async importFromJSON(jsonContent: string): Promise<ImportStats> {
        logger.info('[ImportService] Starting import...');

        let data: ImportData;
        try {
            data = JSON.parse(jsonContent);
        } catch (error) {
            logger.error('[ImportService] Failed to parse JSON', error);
            throw new Error('Invalid JSON file format');
        }

        // Basic validation
        if (!data.accounts || !data.journals || !data.transactions) {
            throw new Error('Invalid export file: missing required data sections');
        }

        logger.info(`[ImportService] Validated file. Found ${data.accounts.length} accounts, ${data.journals.length} journals, ${data.transactions.length} transactions.`);

        try {
            // 1. Wipe existing data
            logger.warn('[ImportService] Wiping database for import...');
            await integrityService.resetDatabase();

            // 2. Clear and restore preferences
            await preferences.clearPreferences();
            if (data.preferences) {
                // Restore critical preferences
                if (data.preferences.theme) await preferences.setTheme(data.preferences.theme);
                if (data.preferences.onboardingCompleted !== undefined) await preferences.setOnboardingCompleted(data.preferences.onboardingCompleted);
                if (data.preferences.userName) await preferences.setUserName(data.preferences.userName);
                if (data.preferences.defaultCurrencyCode) await preferences.setDefaultCurrencyCode(data.preferences.defaultCurrencyCode);
                if (data.preferences.isPrivacyMode !== undefined) await preferences.setIsPrivacyMode(data.preferences.isPrivacyMode);
            }

            // 3. Import Data in Batch
            await database.write(async () => {
                // Accounts
                const accountsCollection = database.collections.get<Account>('accounts');
                const journalsCollection = database.collections.get<Journal>('journals');
                const transactionsCollection = database.collections.get<Transaction>('transactions');

                logger.debug(`[ImportService] creating ${data.accounts.length} accounts...`);
                // WatermelonDB batch requires array of model preparations
                const accountPrepares = data.accounts.map(acc =>
                    accountsCollection.prepareCreate(record => {
                        record._raw.id = acc.id; // Preserve ID
                        record.name = acc.name;
                        record.accountType = acc.accountType;
                        record.currencyCode = acc.currencyCode;
                        record.parentAccountId = acc.parentAccountId;
                        record.description = acc.description;
                        record._raw._status = 'synced';
                        // Handle Date strings
                        if (acc.createdAt) (record as any)._raw.created_at = new Date(acc.createdAt).getTime();
                    })
                );

                const journalPrepares = data.journals.map(j =>
                    journalsCollection.prepareCreate(record => {
                        record._raw.id = j.id;
                        record.journalDate = new Date(j.journalDate);
                        record.description = j.description;
                        record.currencyCode = j.currencyCode;
                        record.status = j.status;
                        record.totalAmount = j.totalAmount;
                        record.transactionCount = j.transactionCount;
                        record.displayType = j.displayType;
                        record._raw._status = 'synced';
                        if (j.createdAt) (record as any)._raw.created_at = new Date(j.createdAt).getTime();
                    })
                );

                const transactionPrepares = data.transactions.map(t =>
                    transactionsCollection.prepareCreate(record => {
                        record._raw.id = t.id;
                        record.journalId = t.journalId;
                        record.accountId = t.accountId;
                        record.amount = t.amount;
                        record.transactionType = t.transactionType;
                        record.currencyCode = t.currencyCode;
                        record.transactionDate = new Date(t.transactionDate);
                        record.notes = t.notes;
                        record.exchangeRate = t.exchangeRate;
                        record._raw._status = 'synced';
                        if (t.createdAt) (record as any)._raw.created_at = new Date(t.createdAt).getTime();
                    })
                );

                // Execute batch
                logger.info('[ImportService] Executing batch insert...');
                await database.batch(
                    ...accountPrepares,
                    ...journalPrepares,
                    ...transactionPrepares
                );
            });

            logger.info('[ImportService] Import successful.');
            return {
                accounts: data.accounts.length,
                journals: data.journals.length,
                transactions: data.transactions.length,
                skippedTransactions: 0
            };
        } catch (error) {
            logger.error('[ImportService] Import failed mid-process', error);
            throw new Error('Failed to import data into database');
        }
    }
}

export const importService = new ImportService();
