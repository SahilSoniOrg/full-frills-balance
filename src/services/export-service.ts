/**
 * Export Service
 * 
 * Handles data export in various formats.
 * Exports mandatory per project principles.
 */

import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';

export interface ExportData {
    exportDate: string;
    version: string;
    preferences: any;
    accounts: AccountExport[];
    journals: JournalExport[];
    transactions: TransactionExport[];
    auditLogs: AuditLogExport[];
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

interface AuditLogExport {
    id: string;
    entityType: string;
    entityId: string;
    action: string;
    changes: string;
    timestamp: number;
    createdAt: string;
}

class ExportService {
    /**
     * Exports all data as JSON
     */
    async exportToJSON(): Promise<string> {
        logger.info('[ExportService] Starting JSON export...');

        try {
            const accounts = await accountRepository.findAll();
            const journals = await journalRepository.findAllNonDeleted();
            const transactions = await transactionRepository.findAllNonDeleted();
            const auditLogs = await auditRepository.findAll();

            const userPreferences = await preferences.loadPreferences();

            const exportData: ExportData = {
                exportDate: new Date().toISOString(),
                version: '1.1.0',
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
                auditLogs: auditLogs.map(log => ({
                    id: log.id,
                    entityType: log.entityType,
                    entityId: log.entityId,
                    action: log.action,
                    changes: log.changes,
                    timestamp: log.timestamp,
                    createdAt: log.createdAt.toISOString(),
                })),
            };

            const json = JSON.stringify(exportData, null, 2);

            logger.info('[ExportService] Export complete', {
                accounts: accounts.length,
                journals: journals.length,
                transactions: transactions.length,
                auditLogs: auditLogs.length,
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
    async getExportSummary(): Promise<{ accounts: number; journals: number; transactions: number; auditLogs: number }> {
        const [accounts, journals, transactions, auditLogs] = await Promise.all([
            accountRepository.countNonDeleted(),
            journalRepository.countNonDeleted(),
            transactionRepository.countNonDeleted(),
            auditRepository.countAll()
        ]);

        return { accounts, journals, transactions, auditLogs };
    }
}

export const exportService = new ExportService();
