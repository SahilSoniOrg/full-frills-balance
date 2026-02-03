import { AccountType } from '@/src/data/models/Account';
import { AuditAction } from '@/src/data/models/AuditLog';
import Journal, { JournalStatus } from '@/src/data/models/Journal';
import Transaction, { TransactionType } from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository';
import { CreateJournalData, journalRepository } from '@/src/data/repositories/JournalRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { auditService } from '@/src/services/audit-service';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { EnrichedJournal, EnrichedTransaction } from '@/src/types/domain';
import { accountingService } from '@/src/utils/accountingService';
import { journalPresenter } from '@/src/utils/journalPresenter';
import { roundToPrecision } from '@/src/utils/money';

export class JournalService {
    /**
     * Orchestrates creation of a journal with multiple transactions.
     * Handles account lookup, validation, persistence, and post-write side effects (Audit, Rebuild).
     */
    async createJournal(data: CreateJournalData): Promise<Journal> {
        // 1. Fetch all unique accounts involved
        const accountIds = [...new Set(data.transactions.map(t => t.accountId))];
        const accounts = await accountRepository.findAllByIds(accountIds);
        const accountMap = new Map(accounts.map(a => [a.id, a]));
        const accountTypes = new Map(accounts.map(a => [a.id, a.accountType as AccountType]));

        // 2. Get precisions
        const accountPrecisions = new Map<string, number>();
        await Promise.all(accounts.map(async acc => {
            const p = await currencyRepository.getPrecision(acc.currencyCode);
            accountPrecisions.set(acc.id, p);
        }));
        const journalPrecision = await currencyRepository.getPrecision(data.currencyCode);

        // 3. Round and Validate
        const roundedTransactions = data.transactions.map(t => ({
            ...t,
            amount: roundToPrecision(t.amount, accountPrecisions.get(t.accountId) ?? 2)
        }));

        const validation = accountingService.validateJournal(roundedTransactions.map(t => ({
            amount: t.amount,
            type: t.transactionType,
            exchangeRate: t.exchangeRate
        })), journalPrecision);

        if (!validation.isValid) {
            throw new Error(`Unbalanced journal: ${validation.imbalance}`);
        }

        // 4. Calculate balances and rebuilds
        const accountsToRebuild = new Set<string>();
        const calculatedBalances = new Map<string, number>();

        for (const tx of roundedTransactions) {
            const latestTx = await transactionRepository.findLatestForAccountBeforeDate(tx.accountId, data.journalDate);
            if (accountingService.isBackdated(data.journalDate, latestTx?.transactionDate)) {
                accountsToRebuild.add(tx.accountId);
            } else {
                const balance = accountingService.calculateNewBalance(
                    latestTx?.runningBalance || 0,
                    tx.amount,
                    accountTypes.get(tx.accountId)!,
                    tx.transactionType,
                    accountPrecisions.get(tx.accountId) ?? 2
                );
                calculatedBalances.set(tx.accountId, balance);
            }
        }

        // 5. Build enriched persistence data
        const totalAmount = Math.max(Math.abs(validation.totalDebits), Math.abs(validation.totalCredits));
        const displayType = journalPresenter.getJournalDisplayType(roundedTransactions, accountTypes);

        // 6. Delegate to Repo
        const journal = await journalRepository.createJournalWithTransactions({
            ...data,
            transactions: roundedTransactions,
            totalAmount,
            displayType,
            calculatedBalances
        });

        // 7. Post-write side effects
        await auditService.log({
            entityType: 'journal',
            entityId: journal.id,
            action: AuditAction.CREATE,
            changes: { description: data.description }
        });

        if (accountsToRebuild.size > 0) {
            rebuildQueueService.enqueueMany(accountsToRebuild, data.journalDate);
        }

        return journal;
    }

    async updateJournal(journalId: string, data: CreateJournalData): Promise<Journal> {
        // Validation and Calculation logic mirrored from createJournal
        const accountIds = [...new Set(data.transactions.map(t => t.accountId))];
        const accounts = await accountRepository.findAllByIds(accountIds);
        const accountMap = new Map(accounts.map(a => [a.id, a]));
        const accountTypes = new Map(accounts.map(a => [a.id, a.accountType as AccountType]));

        const accountPrecisions = new Map<string, number>();
        await Promise.all(accounts.map(async acc => {
            const p = await currencyRepository.getPrecision(acc.currencyCode);
            accountPrecisions.set(acc.id, p);
        }));
        const journalPrecision = await currencyRepository.getPrecision(data.currencyCode);

        const roundedTransactions = data.transactions.map(t => ({
            ...t,
            amount: roundToPrecision(t.amount, accountPrecisions.get(t.accountId) ?? 2)
        }));

        const validation = accountingService.validateJournal(roundedTransactions.map(t => ({
            amount: t.amount,
            type: t.transactionType,
            exchangeRate: t.exchangeRate
        })), journalPrecision);

        if (!validation.isValid) throw new Error(`Unbalanced journal: ${validation.imbalance}`);

        const accountsToRebuild = new Set<string>();
        const calculatedBalances = new Map<string, number>();

        for (const tx of roundedTransactions) {
            const latestTx = await transactionRepository.findLatestForAccountBeforeDate(tx.accountId, data.journalDate);
            if (accountingService.isBackdated(data.journalDate, latestTx?.transactionDate)) {
                accountsToRebuild.add(tx.accountId);
            } else {
                const balance = accountingService.calculateNewBalance(
                    latestTx?.runningBalance || 0,
                    tx.amount,
                    accountTypes.get(tx.accountId)!,
                    tx.transactionType,
                    accountPrecisions.get(tx.accountId) ?? 2
                );
                calculatedBalances.set(tx.accountId, balance);
            }
        }

        const totalAmount = Math.max(Math.abs(validation.totalDebits), Math.abs(validation.totalCredits));
        const displayType = journalPresenter.getJournalDisplayType(roundedTransactions, accountTypes);

        const journal = await journalRepository.updateJournalWithTransactions(journalId, {
            ...data,
            transactions: roundedTransactions,
            totalAmount,
            displayType,
            calculatedBalances
        });

        await auditService.log({
            entityType: 'journal',
            entityId: journalId,
            action: AuditAction.UPDATE,
            changes: { description: journal.description }
        });

        // For updates, we rebuild all involved accounts to be safe
        rebuildQueueService.enqueueMany(accountIds, data.journalDate);

        return journal;
    }

    async deleteJournal(journalId: string): Promise<void> {
        const journal = await journalRepository.find(journalId);
        if (!journal) return;

        const transactions = await transactionRepository.findByJournal(journalId);

        await journalRepository.deleteJournal(journalId);

        await auditService.log({
            entityType: 'journal',
            entityId: journalId,
            action: AuditAction.DELETE,
            changes: { description: journal.description }
        });

        const accountIds = Array.from(new Set(transactions.map((t: Transaction) => t.accountId)));
        rebuildQueueService.enqueueMany(accountIds, journal.journalDate);
    }

    async duplicateJournal(journalId: string): Promise<Journal> {
        const journal = await journalRepository.find(journalId);
        if (!journal) throw new Error('Journal not found');

        const transactions = await transactionRepository.findByJournal(journalId);

        return this.createJournal({
            journalDate: Date.now(),
            description: journal.description ? `Copy of ${journal.description}` : undefined,
            currencyCode: journal.currencyCode,
            transactions: transactions.map(tx => ({
                accountId: tx.accountId,
                amount: tx.amount,
                transactionType: tx.transactionType as TransactionType,
                notes: tx.notes,
                exchangeRate: tx.exchangeRate
            }))
        });
    }

    async createReversalJournal(originalJournalId: string, reason: string = 'Reversal'): Promise<Journal> {
        const originalJournal = await journalRepository.find(originalJournalId);
        if (!originalJournal) throw new Error('Original journal not found');

        const originalTransactions = await transactionRepository.findByJournal(originalJournalId);
        const reversedTxs = originalTransactions.map(tx => ({
            accountId: tx.accountId,
            amount: tx.amount,
            transactionType: tx.transactionType === TransactionType.DEBIT ? TransactionType.CREDIT : TransactionType.DEBIT,
            notes: `Reversal: ${tx.notes || ''}`,
            exchangeRate: tx.exchangeRate || 1
        }));

        const reversalJournal = await this.createJournal({
            journalDate: Date.now(),
            description: `Reversal of: ${originalJournal.description || originalJournalId} (${reason})`,
            currencyCode: originalJournal.currencyCode,
            transactions: reversedTxs
        });

        // Link them
        await journalRepository.markReversed(originalJournalId, reversalJournal.id);

        return reversalJournal;
    }

    /**
     * READS: Enriched models for UI
     */
    async findEnrichedJournals(limit: number, dateRange?: { startDate: number, endDate: number }): Promise<EnrichedJournal[]> {
        const journals = await journalRepository.findAll();
        // dateRange filtering and limit should be handled better, but keeping it simple for now
        const journalIds = journals.map(j => j.id).slice(0, limit);

        const transactions = await transactionRepository.findByJournals(journalIds);
        const accountIds = [...new Set(transactions.map(t => t.accountId))];
        const accounts = await accountRepository.findAllByIds(accountIds);
        const accountMap = new Map<string, any>(accounts.map(a => [a.id, a]));
        const accountTypes = new Map<string, AccountType>(accounts.map(a => [a.id, a.accountType as AccountType]));

        return journals.slice(0, limit).map(j => {
            const jTxs = transactions.filter(t => t.journalId === j.id);
            const enrichedAccounts = Array.from(new Set(jTxs.map(t => t.accountId))).map(id => {
                const acc = accountMap.get(id);
                return {
                    id,
                    name: acc?.name || 'Unknown',
                    accountType: acc?.accountType || 'ASSET',
                    role: jTxs.find(t => t.accountId === id)?.transactionType === TransactionType.CREDIT ? 'SOURCE' : 'DESTINATION'
                };
            });

            return {
                id: j.id,
                journalDate: j.journalDate,
                description: j.description,
                currencyCode: j.currencyCode,
                status: j.status as any,
                totalAmount: j.totalAmount || 0,
                transactionCount: j.transactionCount || 0,
                displayType: j.displayType as any,
                accounts: enrichedAccounts
            } as EnrichedJournal;
        });
    }

    async findEnrichedTransactionsForAccount(accountId: string, limit: number, dateRange?: { startDate: number, endDate: number }): Promise<EnrichedTransaction[]> {
        const transactions = await transactionRepository.findByAccount(accountId, limit, dateRange);
        if (transactions.length === 0) return [];

        const journalIds = Array.from(new Set(transactions.map(t => t.journalId)));
        const allJournals = await journalRepository.findAll(); // Simple fetch for now
        const journalMap = new Map<string, any>(allJournals.map(j => [j.id, j]));

        const allJournalTxs = await transactionRepository.findByJournals(journalIds);
        const allAccIds = Array.from(new Set(allJournalTxs.map(t => t.accountId)));
        const accounts = await accountRepository.findAllByIds(allAccIds);
        const accountMap = new Map<string, any>(accounts.map(a => [a.id, a]));

        return transactions.map(tx => {
            const journal = journalMap.get(tx.journalId);
            const account = accountMap.get(tx.accountId);

            return {
                id: tx.id,
                journalId: tx.journalId,
                accountId: tx.accountId,
                amount: tx.amount,
                currencyCode: tx.currencyCode,
                transactionType: tx.transactionType as any,
                transactionDate: tx.transactionDate,
                notes: tx.notes,
                journalDescription: journal?.description,
                accountName: account?.name,
                accountType: account?.accountType as any,
                runningBalance: tx.runningBalance,
                isIncrease: ['ASSET', 'EXPENSE'].includes(account?.accountType || '')
                    ? tx.transactionType === 'DEBIT'
                    : tx.transactionType === 'CREDIT'
            } as EnrichedTransaction;
        });
    }

    async findEnrichedTransactionsByJournal(journalId: string): Promise<EnrichedTransaction[]> {
        const journal = await journalRepository.find(journalId);
        if (!journal) return [];

        const transactions = await transactionRepository.findByJournal(journalId);
        const accountIds = Array.from(new Set(transactions.map(t => t.accountId)));
        const accounts = await accountRepository.findAllByIds(accountIds);
        const accountMap = new Map<string, any>(accounts.map(a => [a.id, a]));

        return transactions.map(tx => {
            const account = accountMap.get(tx.accountId);
            return {
                id: tx.id,
                journalId: tx.journalId,
                accountId: tx.accountId,
                amount: tx.amount,
                currencyCode: tx.currencyCode,
                transactionType: tx.transactionType as any,
                transactionDate: tx.transactionDate,
                notes: tx.notes,
                journalDescription: journal?.description,
                accountName: account?.name,
                accountType: account?.accountType as any,
                runningBalance: tx.runningBalance,
                isIncrease: ['ASSET', 'EXPENSE'].includes(account?.accountType || '')
                    ? tx.transactionType === 'DEBIT'
                    : tx.transactionType === 'CREDIT'
            } as EnrichedTransaction;
        });
    }
}

export const journalService = new JournalService();
