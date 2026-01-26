/**
 * Export Service
 * 
 * Handles data export in various formats.
 * Exports mandatory per project principles.
 */

import { database } from '@/src/data/database/Database';
import Account from '@/src/data/models/Account';
import Journal from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';
import { logger } from '@/src/utils/logger';
import { Q } from '@nozbe/watermelondb';
import { preferences } from '../utils/preferences';

export interface ExportData {
    exportDate: string;
    version: string;
    preferences: any;
    accounts: AccountExport[];
    journals: JournalExport[];
    transactions: TransactionExport[];
}

interface AccountExport {
    id: string;
    name: string;
    accountType: string;
    currencyCode: string;
    parentAccountId?: string;
    description?: string;
    createdAt: string;
}

interface JournalExport {
    id: string;
    journalDate: string;
    description?: string;
    currencyCode: string;
    status: string;
    totalAmount: number;
    transactionCount: number;
    displayType: string;
    createdAt: string;
}

interface TransactionExport {
    id: string;
    journalId: string;
    accountId: string;
    amount: number;
    transactionType: string;
    currencyCode: string;
    transactionDate: string;
    notes?: string;
    exchangeRate?: number;
    createdAt: string;
}

class ExportService {
    /**
     * Exports all data as JSON
     */
    async exportToJSON(): Promise<string> {
        logger.info('[ExportService] Starting JSON export...');

        try {
            const accounts = await database.collections.get<Account>('accounts')
                .query(Q.where('deleted_at', Q.eq(null)))
                .fetch();

            const journals = await database.collections.get<Journal>('journals')
                .query(Q.where('deleted_at', Q.eq(null)))
                .fetch();

            const transactions = await database.collections.get<Transaction>('transactions')
                .query(Q.where('deleted_at', Q.eq(null)))
                .fetch();

            const userPreferences = await preferences.loadPreferences();

            const exportData: ExportData = {
                exportDate: new Date().toISOString(),
                version: '1.0.0',
                preferences: userPreferences,
                accounts: accounts.map(a => ({
                    id: a.id,
                    name: a.name,
                    accountType: a.accountType,
                    currencyCode: a.currencyCode,
                    parentAccountId: a.parentAccountId,
                    description: a.description,
                    createdAt: a.createdAt.toISOString(),
                })),
                journals: journals.map(j => ({
                    id: j.id,
                    journalDate: new Date(j.journalDate).toISOString(),
                    description: j.description,
                    currencyCode: j.currencyCode,
                    status: j.status,
                    totalAmount: j.totalAmount,
                    transactionCount: j.transactionCount,
                    displayType: j.displayType,
                    createdAt: j.createdAt.toISOString(),
                })),
                transactions: transactions.map(t => ({
                    id: t.id,
                    journalId: t.journalId,
                    accountId: t.accountId,
                    amount: t.amount,
                    transactionType: t.transactionType,
                    currencyCode: t.currencyCode,
                    transactionDate: new Date(t.transactionDate).toISOString(),
                    notes: t.notes,
                    exchangeRate: t.exchangeRate,
                    createdAt: t.createdAt.toISOString(),
                })),
            };

            const json = JSON.stringify(exportData, null, 2);

            logger.info('[ExportService] Export complete', {
                accounts: accounts.length,
                journals: journals.length,
                transactions: transactions.length,
            });

            return json;
        } catch (error) {
            logger.error('[ExportService] Export failed', error);
            throw error;
        }
    }

    /**
     * Get a summary of exportable data counts
     */
    async getExportSummary(): Promise<{ accounts: number; journals: number; transactions: number }> {
        const accounts = await database.collections.get<Account>('accounts')
            .query(Q.where('deleted_at', Q.eq(null)))
            .fetchCount();

        const journals = await database.collections.get<Journal>('journals')
            .query(Q.where('deleted_at', Q.eq(null)))
            .fetchCount();

        const transactions = await database.collections.get<Transaction>('transactions')
            .query(Q.where('deleted_at', Q.eq(null)))
            .fetchCount();

        return { accounts, journals, transactions };
    }
}

export const exportService = new ExportService();
