import { database } from '@/src/data/database/Database';
import { generator as generateId } from '@/src/data/database/idGenerator';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';
import Account, { AccountType } from '../data/models/Account';
import Journal, { JournalStatus } from '../data/models/Journal';
import Transaction, { TransactionType } from '../data/models/Transaction';
import { ImportStats } from './import-service';

// Ivy Wallet Interfaces (keeping these for reference)
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
    dateTime?: string; // Instant format usually
    categoryId?: string;
    isDeleted?: boolean;
    dueDate?: string | number; // Planned payments have this
}

interface IvyData {
    accounts: IvyAccount[];
    categories: IvyCategory[];
    transactions: IvyTransaction[];
    // We ignore budgets, loans, etc for now
}

class IvyImportService {

    isIvyBackup(data: any): boolean {
        // Simple check for Ivy structure
        if (!data || typeof data !== 'object') return false;

        // Check for accounts/categories arrays
        const hasAccounts = Array.isArray(data.accounts);
        const hasCategories = Array.isArray(data.categories);
        const hasTransactions = Array.isArray(data.transactions);

        // Also checks if we can find at least one hallmark property if arrays are empty?
        // Let's rely on structure existence.
        if (hasAccounts && hasCategories && hasTransactions) {
            // Deeper check: The presence of 'categories' array is the strongest signal for Ivy format
            // vs Balance format which uses 'journals'.
            // Also, Balance format (Native) does NOT have 'categories' at root.
            return true;
        }
        return false;
    }

    async importFromIvyJSON(jsonContent: string): Promise<ImportStats> {
        try {
            const data: IvyData = JSON.parse(jsonContent);

            if (!this.isIvyBackup(data)) {
                throw new Error('Invalid Ivy Wallet backup format');
            }

            logger.info('Starting Import from Ivy Wallet JSON...');
            logger.info(`Found ${data.accounts.length} accounts, ${data.categories.length} categories, ${data.transactions.length} transactions`);


            // 2. Prepare for batching
            const accountActions: any[] = [];

            // 3. Pre-Scan Transactions for Category Usage (Per Currency)
            // We need to create a unique Account for each (Category + Currency) combination
            // to allow strict double-entry with correct currency matching.

            interface CategoryStat {
                expenseCount: number;
                incomeCount: number;
            }

            // Key: `${categoryId}:::${currencyCode}`
            const categoryUsageMap = new Map<string, CategoryStat>();
            const categoryCurrencies = new Map<string, Set<string>>(); // categoryId -> Set<currencies>

            // Helper to get raw account currency map first
            // We need this to know the currency of the "Real Account" involved in the tx
            const rawIvyAccountCurrency = new Map<string, string>();
            data.accounts.forEach(a => {
                rawIvyAccountCurrency.set(a.id, a.currency || 'USD');
            });

            data.transactions.forEach(tx => {
                if (tx.isDeleted) return;
                if (tx.dueDate) return; // Skip planned payments
                if (!tx.categoryId) return; // Transfer or undefined

                // Determine currency from the "Real Account" side
                let currency = 'USD';
                if (tx.accountId && rawIvyAccountCurrency.has(tx.accountId)) {
                    currency = rawIvyAccountCurrency.get(tx.accountId)!;
                }
                // If it's a Transfer, categoryId should be empty, but just in case.

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

            // 4. Create Accounts (From Ivy Real Accounts)
            const accountMap = new Map<string, string>(); // IvyAccountID -> BalanceAccountID
            const accountCurrencyMap = new Map<string, string>(); // BalanceAccountID -> Currency
            const categoryAccountMap = new Map<string, string>(); // Key `${categoryId}:::${currency}` -> BalanceAccountID

            const accountsCollection = database.collections.get<Account>('accounts');

            // 4a. Generate IDs and currencies for mapping
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

            // 5a. Prepare ALL accounts for sorting before creating actions
            interface PendingAccount {
                id: string;
                name: string;
                currency: string;
                type: AccountType;
                description: string;
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
                    isOriginal: false
                });
            }

            // Sort Accounts: Originals first, then Category Accounts (Name then Currency)
            allPendingAccounts.sort((a, b) => {
                if (a.isOriginal && !b.isOriginal) return -1;
                if (!a.isOriginal && b.isOriginal) return 1;

                if (!a.isOriginal && !b.isOriginal) {
                    const nameCompare = a.name.localeCompare(b.name);
                    if (nameCompare !== 0) return nameCompare;
                    return a.currency.localeCompare(b.currency);
                }

                return 0; // Keep original relative order for originals
            });

            // Creates actions with OrderNum
            allPendingAccounts.forEach((acc, index) => {
                accountActions.push(
                    accountsCollection.prepareCreate(record => {
                        record._raw.id = acc.id;
                        record.name = acc.name;
                        record.accountType = acc.type;
                        record.currencyCode = acc.currency;
                        record.description = acc.description;
                        record.orderNum = index + 1;
                    })
                );
            });

            // 6. Create Journals & Transactions
            const journalsCollection = database.collections.get<Journal>('journals');
            const transactionsCollection = database.collections.get<Transaction>('transactions');
            const journalActions: any[] = [];
            const transactionActions: any[] = [];
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

                const journalId = tx.id;
                const timestamp = tx.dateTime ? new Date(tx.dateTime).getTime() : Date.now();
                const description = tx.title || tx.description || (tx.type === 'TRANSFER' ? 'Transfer' : 'Transaction');

                let sourceId: string | undefined;
                let destId: string | undefined;
                let displayType = 'EXPENSE';
                let currencyCode = 'USD'; // Main currency for Journal

                // Determine Currency First (from Real Account)
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
                    // Look up Category Account for this specific currency
                    const key = `${tx.categoryId}:::${currencyCode}`;
                    destId = categoryAccountMap.get(key);
                    displayType = 'EXPENSE';
                    if (!destId) {
                        skippedItems.push({ id: tx.id, reason: `Missing Category Account (${key})`, description: txDesc });
                    }
                } else if (tx.type === 'INCOME') {
                    // Look up Category Account for this specific currency
                    const key = `${tx.categoryId}:::${currencyCode}`;
                    sourceId = categoryAccountMap.get(key);
                    destId = accountMap.get(tx.accountId);
                    displayType = 'INCOME';
                    if (!sourceId) {
                        skippedItems.push({ id: tx.id, reason: `Missing Category Account (${key})`, description: txDesc });
                    }
                }

                if (!sourceId || !destId) {
                    return;
                }

                const amount = Math.abs(tx.amount);
                const toAmount = tx.toAmount !== undefined ? Math.abs(tx.toAmount) : amount;

                journalActions.push(
                    journalsCollection.prepareCreate(record => {
                        record._raw.id = journalId;
                        record.journalDate = timestamp;
                        record.description = description;
                        record.currencyCode = currencyCode;
                        record.status = JournalStatus.POSTED;
                        record.totalAmount = amount; // Magnitude
                        record.transactionCount = 2; // Always double entry here
                        record.displayType = displayType;
                    })
                );

                // Create Transaction 1: SOURCE (Credit)
                transactionActions.push(
                    transactionsCollection.prepareCreate(record => {
                        record._raw.id = generateId();
                        record.journalId = journalId;
                        record.transactionDate = timestamp;
                        record.accountId = sourceId!;
                        record.amount = amount; // Absolute
                        record.transactionType = TransactionType.CREDIT; // Source always Credit
                        record.currencyCode = currencyCode; // Assuming source is in main currency
                    })
                );

                // Create Transaction 2: DEST (Debit)
                transactionActions.push(
                    transactionsCollection.prepareCreate(record => {
                        record._raw.id = generateId();
                        record.journalId = journalId;
                        record.transactionDate = timestamp;
                        record.accountId = destId!;
                        record.amount = toAmount; // Absolute (handle multi-currency amount)
                        record.transactionType = TransactionType.DEBIT; // Dest always Debit
                        record.currencyCode = currencyCode; // What if destination is diff currency?
                        // If multi-currency, we should set currencyCode of this leg to Dest Account Currency?
                        // Balance App supports multi-currency journals?
                        // Transaction Model has `currencyCode`.
                        // Journal has `currencyCode` (Presentation).
                        // If Transfer A(USD) -> B(EUR):
                        // Tx1: USD, Credit, A
                        // Tx2: EUR, Debit, B

                        // Let's refine currency for Dest.
                        // If Transfer, check Dest Account Currency.
                        if (tx.type === 'TRANSFER' && tx.toAccountId) {
                            const destAccId = accountMap.get(tx.toAccountId);
                            const destCurr = accountCurrencyMap.get(destAccId!);
                            if (destCurr) {
                                record.currencyCode = destCurr;

                                // Calculate Exchange Rate implicitly?
                                // Model has exchangeRate. Rate = Source/Dest or Dest/Source?
                                // Typically Base/Quote. 
                                // Let's leave undefined for now or calculate: amount / toAmount?
                                if (amount !== 0 && toAmount !== 0) {
                                    record.exchangeRate = amount / toAmount; // Rough estimate
                                }
                            }
                        } else {
                            // Expense or Income
                            // Category Accounts assumed same currency?
                            // Or default to main currency.
                            record.currencyCode = currencyCode;
                        }
                    })
                );
            });

            // 7. Write to DB
            logger.info('Writing mapped data to database...');
            await database.write(async () => {
                await database.batch(
                    ...accountActions,
                    ...journalActions,
                    ...transactionActions
                );
            });

            // 8. Restore Preferences
            // Set onboarding complete
            await preferences.setOnboardingCompleted(true);

            // Try to set default currency from first account
            const firstCurrency = accountCurrencyMap.values().next().value;
            if (firstCurrency) {
                await preferences.setDefaultCurrencyCode(firstCurrency);
            }

            logger.info('Ivy Wallet Import successful.');

            // Log skipped items
            if (skippedItems.length > 0) {
                logger.warn('Skipped Items Report:', { count: skippedItems.length, items: skippedItems });
            }

            return {
                accounts: accountActions.length,
                journals: journalActions.length,
                transactions: transactionActions.length,
                skippedTransactions: skippedItems.length,
                skippedItems
            };

        } catch (error) {
            logger.error('Ivy Wallet Import failed', error);
            throw error;
        }
    }
}

export const ivyImportService = new IvyImportService();
