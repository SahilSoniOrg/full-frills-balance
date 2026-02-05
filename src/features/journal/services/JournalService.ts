import { AppConfig } from '@/src/constants';
import { AccountType } from '@/src/data/models/Account';
import { AuditAction } from '@/src/data/models/AuditLog';
import Journal from '@/src/data/models/Journal';
import Transaction, { TransactionType } from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository';
import { CreateJournalData, journalRepository } from '@/src/data/repositories/JournalRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { auditService } from '@/src/services/audit-service';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { EnrichedJournal, JournalEntryLine } from '@/src/types/domain';
import { accountingService } from '@/src/utils/accountingService';
import { journalPresenter } from '@/src/utils/journalPresenter';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { logger } from '@/src/utils/logger';
import { roundToPrecision } from '@/src/utils/money';
import { preferences } from '@/src/utils/preferences';
import { sanitizeAmount } from '@/src/utils/validation';
import { Q } from '@nozbe/watermelondb';
import { combineLatest, distinctUntilChanged, map, of, switchMap } from 'rxjs';

export interface SubmitJournalResult {
    success: boolean;
    error?: string;
    action?: 'created' | 'updated';
}

export class JournalService {
    /**
     * Orchestrates creation of a journal with multiple transactions.
     * Handles account lookup, validation, persistence, and post-write side effects (Audit, Rebuild).
     */
    async createJournal(data: CreateJournalData): Promise<Journal> {
        const prepared = await this.prepareJournalData(data);
        const journal = await journalRepository.createJournalWithTransactions({
            ...data,
            transactions: prepared.transactions,
            totalAmount: prepared.totalAmount,
            displayType: prepared.displayType,
            calculatedBalances: prepared.calculatedBalances
        });

        await auditService.log({
            entityType: 'journal',
            entityId: journal.id,
            action: AuditAction.CREATE,
            changes: { description: data.description }
        });

        if (prepared.accountsToRebuild.size > 0) {
            rebuildQueueService.enqueueMany(prepared.accountsToRebuild, data.journalDate);
            await rebuildQueueService.flush();
        }

        return journal;
    }

    async updateJournal(journalId: string, data: CreateJournalData): Promise<Journal> {
        const originalJournal = await journalRepository.find(journalId);
        if (!originalJournal) throw new Error('Journal not found');

        const originalTransactions = await transactionRepository.findByJournal(journalId);
        const prepared = await this.prepareJournalData(data);

        const journal = await journalRepository.updateJournalWithTransactions(journalId, {
            ...data,
            transactions: prepared.transactions,
            totalAmount: prepared.totalAmount,
            displayType: prepared.displayType,
            calculatedBalances: prepared.calculatedBalances
        });

        await auditService.log({
            entityType: 'journal',
            entityId: journalId,
            action: AuditAction.UPDATE,
            changes: { description: data.description }
        });

        const originalAccountIds = new Set(originalTransactions.map(t => t.accountId));
        const allAccountsToRebuild = new Set<string>([
            ...prepared.accountsToRebuild,
            ...originalAccountIds
        ]);
        const rebuildFromDate = Math.min(originalJournal.journalDate, data.journalDate);
        rebuildQueueService.enqueueMany(allAccountsToRebuild, rebuildFromDate);
        await rebuildQueueService.flush();

        return journal;
    }

    /**
     * Internal: Shared logic for validation, rounding, and balance calculation.
     */
    private async prepareJournalData(data: CreateJournalData) {
        // 1. Fetch all unique accounts involved
        const accountIds = [...new Set(data.transactions.map(t => t.accountId))];
        const accounts = await accountRepository.findAllByIds(accountIds);
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

        // 4. Calculate balances and determine rebuild needs
        const accountsToRebuild = new Set<string>(accountIds);
        const calculatedBalances = new Map<string, number>();

        for (const tx of roundedTransactions) {
            const latestTx = await transactionRepository.findLatestForAccountBeforeDate(tx.accountId, data.journalDate);
            if (!accountingService.isBackdated(data.journalDate, latestTx?.transactionDate)) {
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

        // 5. Enriched persistence data
        const totalAmount = Math.max(Math.abs(validation.totalDebits), Math.abs(validation.totalCredits));
        const displayType = journalPresenter.getJournalDisplayType(roundedTransactions, accountTypes);

        return {
            transactions: roundedTransactions,
            totalAmount,
            displayType,
            calculatedBalances,
            accountsToRebuild
        };
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
        await rebuildQueueService.flush();
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
            transactions: reversedTxs,
            originalJournalId
        });

        // Link them
        await journalRepository.markReversed(originalJournalId, reversalJournal.id);

        return reversalJournal;
    }

    async saveReversalJournal(originalJournalId: string, reason: string = 'Reversal'): Promise<Journal> {
        // ... (this already existed as createReversalJournal but I'll rename if needed or just keep)
        // Actually I'll just add saveSimpleEntry here
        return this.createReversalJournal(originalJournalId, reason);
    }

    /**
     * Specialized method for SimpleForm/V1-style entry.
     * Handles type-to-transaction mapping and cross-currency rounding.
     */
    async saveSimpleEntry(params: {
        type: 'expense' | 'income' | 'transfer',
        amount: number,
        sourceId: string,
        destinationId: string,
        journalDate: number,
        description?: string,
        exchangeRate?: number,
        journalId?: string
    }): Promise<Journal> {
        const { type, amount, sourceId, destinationId, journalDate, description, exchangeRate, journalId } = params;

        // 1. Fetch source currency to determine journal currency
        const sourceAccount = await accountRepository.find(sourceId);
        const currencyCode = sourceAccount?.currencyCode || preferences.defaultCurrencyCode || AppConfig.defaultCurrency;

        // 2. Construct transaction lines
        let destAmount = amount;
        let destRate = exchangeRate;

        if (exchangeRate && exchangeRate > 0) {
            const destAccount = await accountRepository.find(destinationId);
            const precision = await currencyRepository.getPrecision(destAccount?.currencyCode || 'USD');

            // Calculate rounded destination amount
            const rawDestAmount = amount * exchangeRate;
            destAmount = roundToPrecision(rawDestAmount, precision);

            // Recalculate implied rate to ensure balance
            destRate = amount / destAmount;
        }

        const transactions = [
            {
                accountId: sourceId,
                amount: amount,
                transactionType: TransactionType.CREDIT,
                notes: description
            },
            {
                accountId: destinationId,
                amount: destAmount,
                transactionType: TransactionType.DEBIT,
                notes: description,
                exchangeRate: destRate
            }
        ];

        // 3. Apply type-specific mapping if different from basic CREDIT -> DEBIT
        // (In this ledger: CREDIT is SOURCE/OUT, DEBIT is DESTINATION/IN)
        if (type === 'income') {
            // Income is already CREDIT (Source) -> DEBIT (Asset)
        }

        const journalData: CreateJournalData = {
            journalDate,
            description,
            currencyCode,
            transactions
        };

        if (journalId) {
            return this.updateJournal(journalId, journalData);
        } else {
            return this.createJournal(journalData);
        }
    }

    /**
     * Specialized method for multi-line journal entry (e.g. from Advanced Mode or Import).
     * Handles normalization and validation before calling core creation.
     */
    async saveMultiLineEntry(params: {
        lines: JournalEntryLine[],
        description: string,
        journalDate: string,
        journalTime: string,
        journalId?: string
    }): Promise<SubmitJournalResult> {
        const { lines, description, journalDate, journalTime, journalId } = params;

        // 1. Validation Logic
        if (!description.trim()) {
            return { success: false, error: 'Description is required' };
        }

        if (lines.some(l => !l.accountId)) {
            return { success: false, error: 'All lines must have an account' };
        }

        const distinctValidation = accountingService.validateDistinctAccounts(lines.map(l => l.accountId));
        if (!distinctValidation.isValid) {
            return { success: false, error: 'A journal entry must involve at least 2 distinct accounts' };
        }

        // 2. Balance Validation
        const domainLines = lines.map(line => ({
            amount: sanitizeAmount(line.amount) || 0,
            type: line.transactionType,
            exchangeRate: line.exchangeRate ? parseFloat(line.exchangeRate) : 1
        }));
        const balanceValidation = accountingService.validateJournal(domainLines);
        if (!balanceValidation.isValid) {
            return { success: false, error: `Journal is not balanced. Discrepancy: ${balanceValidation.imbalance}` };
        }

        // 3. Normalize and Build Data
        try {
            const combinedTimestamp = new Date(`${journalDate}T${journalTime}`).getTime();
            const journalData: CreateJournalData = {
                journalDate: combinedTimestamp,
                description: description.trim(),
                currencyCode: preferences.defaultCurrencyCode || AppConfig.defaultCurrency,
                transactions: lines.map(l => ({
                    accountId: l.accountId,
                    amount: sanitizeAmount(l.amount) || 0,
                    transactionType: l.transactionType,
                    notes: l.notes.trim() || undefined,
                    exchangeRate: l.exchangeRate ? parseFloat(l.exchangeRate) : undefined
                }))
            };

            if (journalId) {
                await this.updateJournal(journalId, journalData);
                return { success: true, action: 'updated' };
            } else {
                await this.createJournal(journalData);
                return { success: true, action: 'created' };
            }
        } catch (error) {
            logger.error('Failed to save multi-line entry:', error);
            return { success: false, error: 'Failed to save transaction' };
        }
    }

    /**
     * READS: Enriched models for UI (Reactive)
     */

    /**
     * Observe journals with their associated accounts for list display.
     * Replaces JournalRepository.observeEnrichedJournals.
     */
    observeEnrichedJournals(limit: number, dateRange?: { startDate: number, endDate: number }, searchQuery?: string) {
        const clauses: any[] = [
            Q.where('deleted_at', Q.eq(null)),
            Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
            Q.sortBy('journal_date', 'desc'),
            Q.take(limit)
        ];

        if (dateRange) {
            clauses.push(Q.where('journal_date', Q.gte(dateRange.startDate)));
            clauses.push(Q.where('journal_date', Q.lte(dateRange.endDate)));
        }

        if (searchQuery) {
            const q = searchQuery.trim();
            if (q) {
                clauses.push(Q.where('description', Q.like(`%${Q.sanitizeLikeString(q)}%`)));
            }
        }

        const journalsObservable = journalRepository.journalsQuery(...clauses).observeWithColumns([
            'journal_date',
            'description',
            'currency_code',
            'status',
            'total_amount',
            'transaction_count',
            'display_type'
        ]);

        const journalIds$ = journalsObservable.pipe(
            map((journals) => journals.map(j => j.id).sort()),
            distinctUntilChanged((a, b) => a.length === b.length && a.every((id, idx) => id === b[idx]))
        );

        const transactions$ = journalIds$.pipe(
            switchMap((journalIds) => {
                if (journalIds.length === 0) return of([] as Transaction[]);
                return transactionRepository.transactionsQuery(
                    Q.experimentalJoinTables(['journals']),
                    Q.where('journal_id', Q.oneOf(journalIds)),
                    Q.where('deleted_at', Q.eq(null)),
                    Q.on('journals', [
                        Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
                        Q.where('deleted_at', Q.eq(null))
                    ])
                ).observeWithColumns([
                    'account_id',
                    'journal_id',
                    'transaction_type',
                    'deleted_at'
                ]);
            })
        );

        const accountIds$ = transactions$.pipe(
            map((transactions) => Array.from(new Set(transactions.map(t => t.accountId))).sort()),
            distinctUntilChanged((a, b) => a.length === b.length && a.every((id, idx) => id === b[idx]))
        );

        const accounts$ = accountIds$.pipe(
            switchMap((accountIds) => accountRepository.observeByIds(accountIds))
        );

        return combineLatest([journalsObservable, transactions$, accounts$]).pipe(
            map(([journals, transactions, accounts]) => {
                if (journals.length === 0) return [] as EnrichedJournal[];

                const accountMap = new Map(accounts.map(a => [a.id, a]));
                return journals.map(j => {
                    const jTxs = transactions.filter(t => t.journalId === j.id);
                    const enrichedAccounts = Array.from(new Set(jTxs.map(t => t.accountId))).map(id => {
                        const acc = accountMap.get(id);
                        const role = jTxs.find(t => t.accountId === id)?.transactionType === TransactionType.CREDIT
                            ? 'SOURCE'
                            : 'DESTINATION';
                        return {
                            id,
                            name: acc?.name || 'Unknown',
                            accountType: acc?.accountType || 'ASSET',
                            role: role as 'SOURCE' | 'DESTINATION' | 'NEUTRAL'
                        };
                    });

                    return {
                        id: j.id,
                        journalDate: j.journalDate,
                        description: j.description,
                        currencyCode: j.currencyCode,
                        status: j.status,
                        totalAmount: j.totalAmount || 0,
                        transactionCount: j.transactionCount || 0,
                        displayType: j.displayType as string,
                        accounts: enrichedAccounts
                    } as EnrichedJournal;
                });
            })
        );
    }

}

export const journalService = new JournalService();
