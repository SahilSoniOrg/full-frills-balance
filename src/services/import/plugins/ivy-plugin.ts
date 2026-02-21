/**
 * Ivy Wallet Import Plugin
 *
 * Handles import of Ivy Wallet backup format.
 * Refactored from ivy-import-service.ts to implement ImportPlugin interface.
 */

import { generator as generateId } from '@/src/data/database/idGenerator';
import { AccountType } from '@/src/data/models/Account';
import { JournalStatus } from '@/src/data/models/Journal';
import { TransactionType } from '@/src/data/models/Transaction';
import { importRepository } from '@/src/data/repositories/ImportRepository';
import { ImportPlugin, ImportStats } from '@/src/services/import/types';
import { integrityService } from '@/src/services/integrity-service';
import { logger } from '@/src/utils/logger';
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
}

interface IvyData {
    accounts: IvyAccount[];
    categories: IvyCategory[];
    transactions: IvyTransaction[];
}

export const ivyPlugin: ImportPlugin = {
    id: 'ivy',
    name: 'Ivy Wallet Backup',
    description: 'Migrate data from an Ivy Wallet backup file.',
    icon: '🌱',

    detect(data: unknown): boolean {
        if (!data || typeof data !== 'object') return false;

        const obj = data as Record<string, unknown>;

        // Ivy format has accounts, categories, and transactions
        // The presence of 'categories' is the strongest differentiator from native format
        const hasAccounts = Array.isArray(obj.accounts);
        const hasCategories = Array.isArray(obj.categories);
        const hasTransactions = Array.isArray(obj.transactions);

        return hasAccounts && hasCategories && hasTransactions;
    },

    async import(jsonContent: string, onProgress?: (message: string, progress: number) => void): Promise<ImportStats> {
        const data: IvyData = JSON.parse(jsonContent);

        if (!this.detect(data)) {
            throw new Error('Invalid Ivy Wallet backup format');
        }

        logger.info('[IvyPlugin] Starting Import from Ivy Wallet JSON...');
        logger.info(`[IvyPlugin] Found ${data.accounts.length} accounts, ${data.categories.length} categories, ${data.transactions.length} transactions`);

        // 1. Wipe existing data for clean import
        logger.warn('[IvyPlugin] Wiping database before import...');
        onProgress?.('Wiping database...', 0.05);
        await integrityService.resetDatabase();
        const accountImports: any[] = [];

        // 2. Pre-Scan Transactions for Category Usage (Per Currency)
        onProgress?.('Analyzing categories...', 0.10);
        interface CategoryStat {
            expenseCount: number;
            incomeCount: number;
        }

        const categoryUsageMap = new Map<string, CategoryStat>();
        const categoryCurrencies = new Map<string, Set<string>>();

        const rawIvyAccountCurrency = new Map<string, string>();
        data.accounts.forEach(a => {
            rawIvyAccountCurrency.set(a.id, a.currency || 'USD');
        });

        data.transactions.forEach(tx => {
            if (tx.isDeleted) return;
            if (tx.dueDate) return;
            if (!tx.categoryId) return;

            let currency = 'USD';
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

        // 3. Create Accounts
        onProgress?.('Preparing accounts...', 0.15);
        const accountMap = new Map<string, string>();
        const accountCurrencyMap = new Map<string, string>();
        const categoryAccountMap = new Map<string, string>();

        data.accounts.forEach(a => {
            const balanceId = generateId();
            accountMap.set(a.id, balanceId);
            accountCurrencyMap.set(balanceId, a.currency || 'USD');
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
            const description = ivyAcc.archived ? '[ARCHIVED] ' + (ivyAcc.name || '') : 'Imported from Ivy Wallet';
            const cat = ivyAcc.accountCategory || 'ASSET';
            let mappedType = AccountType.ASSET;
            if (cat === 'LIABILITY') mappedType = AccountType.LIABILITY;
            else if (cat === 'EQUITY') mappedType = AccountType.EQUITY;
            else if (cat === 'INCOME') mappedType = AccountType.INCOME;
            else if (cat === 'EXPENSE') mappedType = AccountType.EXPENSE;

            allPendingAccounts.push({
                id,
                name: ivyAcc.name,
                currency: ivyAcc.currency || 'USD',
                type: mappedType,
                description,
                icon: ivyAcc.icon,
                isOriginal: true
            });
        });

        // Add Category Accounts
        for (const [key, stats] of categoryUsageMap.entries()) {
            const [categoryId, currency] = key.split(':::');
            const ivyCat = ivyCategoryLookup.get(categoryId);
            if (!ivyCat) continue;

            const id = categoryAccountMap.get(key)!;
            const name = `${ivyCat.name} - ${currency}`;

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
                isOriginal: false
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
                icon: acc.icon,
                orderNum: index + 1
            });
        });

        // 5. Create Journals & Transactions
        onProgress?.('Mapping transactions...', 0.20);
        const journalImports: any[] = [];
        const transactionImports: any[] = [];
        const skippedItems: { id: string; reason: string; description?: string }[] = [];

        const totalTransactions = data.transactions.length;
        for (let i = 0; i < totalTransactions; i++) {
            if (i % 500 === 0) {
                // Yield to UI thread every so often
                onProgress?.(`Processing transactions (${i} of ${totalTransactions})...`, 0.20 + (i / totalTransactions) * 0.50);
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

            const journalId = tx.id;
            const timestamp = tx.dateTime ? new Date(tx.dateTime).getTime() : Date.now();
            const description = tx.title || tx.description || (tx.type === 'TRANSFER' ? 'Transfer' : 'Transaction');

            let sourceId: string | undefined;
            let destId: string | undefined;
            let displayType = 'EXPENSE';
            let currencyCode = 'USD';

            if (tx.accountId && rawIvyAccountCurrency.has(tx.accountId)) {
                currencyCode = rawIvyAccountCurrency.get(tx.accountId)!;
            }

            if (tx.type === 'TRANSFER') {
                sourceId = accountMap.get(tx.accountId);
                destId = accountMap.get(tx.toAccountId || '');
                displayType = 'TRANSFER';
                if (!destId) {
                    skippedItems.push({ id: tx.id, reason: 'Missing Destination Account', description: txDesc });
                }
            } else if (tx.type === 'EXPENSE') {
                sourceId = accountMap.get(tx.accountId);
                const key = `${tx.categoryId}:::${currencyCode}`;
                destId = categoryAccountMap.get(key);
                displayType = 'EXPENSE';
                if (!destId) {
                    skippedItems.push({ id: tx.id, reason: `Missing Category Account (${key})`, description: txDesc });
                }
            } else if (tx.type === 'INCOME') {
                const key = `${tx.categoryId}:::${currencyCode}`;
                sourceId = categoryAccountMap.get(key);
                destId = accountMap.get(tx.accountId);
                displayType = 'INCOME';
                if (!sourceId) {
                    skippedItems.push({ id: tx.id, reason: `Missing Category Account (${key})`, description: txDesc });
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
                currencyCode,
                status: JournalStatus.POSTED,
                totalAmount: amount,
                transactionCount: 2,
                displayType
            });

            // Transaction 1: SOURCE (Credit)
            transactionImports.push({
                id: generateId(),
                journalId,
                transactionDate: timestamp,
                accountId: sourceId!,
                amount,
                transactionType: TransactionType.CREDIT,
                currencyCode
            });

            // Transaction 2: DEST (Debit)
            const txRecord: any = {
                id: generateId(),
                journalId,
                transactionDate: timestamp,
                accountId: destId!,
                amount: toAmount,
                transactionType: TransactionType.DEBIT,
                currencyCode
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

        // 6. Write to DB
        onProgress?.('Saving to database...', 0.75);
        logger.info('[IvyPlugin] Writing mapped data to database...');
        await importRepository.batchInsert({
            accounts: accountImports,
            journals: journalImports,
            transactions: transactionImports
        });

        // 7. Run integrity check to repair account balances
        onProgress?.('Running integrity check...', 0.85);
        logger.info('[IvyPlugin] Running integrity check to fix account balances...');
        const integrityResult = await integrityService.runStartupCheck();
        logger.info('[IvyPlugin] Integrity check complete', {
            discrepanciesFound: integrityResult.discrepanciesFound,
            repairsSuccessful: integrityResult.repairsSuccessful
        });

        // 8. Restore Preferences
        onProgress?.('Finalizing...', 0.95);
        await preferences.setOnboardingCompleted(true);

        const firstCurrency = accountCurrencyMap.values().next().value;
        if (firstCurrency) {
            await preferences.setDefaultCurrencyCode(firstCurrency);
        }

        logger.info('[IvyPlugin] Import successful.');

        if (skippedItems.length > 0) {
            logger.warn('[IvyPlugin] Skipped Items:', { count: skippedItems.length, items: skippedItems });
        }

        return {
            accounts: accountImports.length,
            journals: journalImports.length,
            transactions: transactionImports.length,
            auditLogs: 0,
            skippedTransactions: skippedItems.length,
            skippedItems
        };
    }
};
