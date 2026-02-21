import { AppConfig } from '@/src/constants';
import Account, { AccountType } from '@/src/data/models/Account';
import { AuditAction } from '@/src/data/models/AuditLog';
import Journal from '@/src/data/models/Journal';
import Transaction, { TransactionType } from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository';
import { CreateJournalData, journalRepository } from '@/src/data/repositories/JournalRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { AccountDateRange } from '@/src/hooks/usePaginatedObservable';
import { analytics } from '@/src/services/analytics-service';
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

export interface SimpleEntryParams {
    type: 'expense' | 'income' | 'transfer';
    amount: number;
    sourceId: string;
    destinationId: string;
    journalDate: number;
    description?: string;
    exchangeRate?: number;
    journalId?: string;
}

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
            exchangeRate: t.exchangeRate,
            accountCurrency: t.currencyCode
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

    /**
     * Unified entry point for saving journals from Simple, Advanced, or Import flows.
     */
    async saveJournalEntry(params: {
        lines: JournalEntryLine[],
        description: string,
        journalDate: string | number, // support timestamp or ISO date
        journalTime?: string,
        journalId?: string,
        mode?: 'simple' | 'advanced' | 'import'
    }): Promise<SubmitJournalResult> {
        const { lines, description, journalDate, journalTime, journalId, mode = 'advanced' } = params;

        // 1. Basic Content Validation
        const finalDescription = description.trim();
        if (!finalDescription) {
            return { success: false, error: 'Description is required' };
        }

        if (lines.length < 2) {
            return { success: false, error: 'A journal entry must have at least 2 lines' };
        }

        if (lines.some(l => !l.accountId)) {
            return { success: false, error: 'All lines must have an account' };
        }

        const distinctValidation = accountingService.validateDistinctAccounts(lines.map(l => l.accountId));
        if (!distinctValidation.isValid) {
            return { success: false, error: 'A journal entry must involve at least 2 distinct accounts' };
        }

        // 2. Normalize Timestamp
        let combinedTimestamp: number;
        if (typeof journalDate === 'number') {
            combinedTimestamp = journalDate;
        } else {
            // Handle YYYY-MM-DD + HH:mm
            const time = journalTime || '00:00';
            const timeWithSeconds = time.split(':').length === 2 ? `${time}:00` : time;
            combinedTimestamp = new Date(`${journalDate}T${timeWithSeconds}`).getTime();
        }

        if (Number.isNaN(combinedTimestamp)) {
            return { success: false, error: 'Invalid date or time' };
        }

        // 3. Balance Validation
        const domainLines = lines.map(line => ({
            amount: sanitizeAmount(line.amount) || 0,
            type: line.transactionType,
            exchangeRate: line.exchangeRate ? parseFloat(line.exchangeRate) : 1,
            accountCurrency: line.accountCurrency
        }));

        const balanceValidation = accountingService.validateJournal(domainLines);
        if (!balanceValidation.isValid) {
            return { success: false, error: `Journal is not balanced. Discrepancy: ${balanceValidation.imbalance}` };
        }

        // 4. Persistence
        try {
            const currencyCode = preferences.defaultCurrencyCode || AppConfig.defaultCurrency;
            const journalData: CreateJournalData = {
                journalDate: combinedTimestamp,
                description: finalDescription,
                currencyCode,
                transactions: lines.map(l => ({
                    accountId: l.accountId,
                    amount: sanitizeAmount(l.amount) || 0,
                    transactionType: l.transactionType,
                    notes: l.notes.trim() || undefined,
                    exchangeRate: l.exchangeRate ? parseFloat(l.exchangeRate) : undefined,
                    currencyCode: l.accountCurrency
                }))
            };

            if (journalId) {
                await this.updateJournal(journalId, journalData);
                analytics.logTransactionCreated(mode, 'update', currencyCode);
                return { success: true, action: 'updated' };
            } else {
                await this.createJournal(journalData);
                analytics.logTransactionCreated(mode, 'create', currencyCode);
                return { success: true, action: 'created' };
            }
        } catch (error) {
            logger.error('Failed to save journal entry:', error);
            return { success: false, error: 'Failed to save transaction' };
        }
    }

    /**
     * READS: Enriched models for UI (Reactive)
     */

    /**
     * Observe journals with their associated accounts for list display.
     * Uses a reactive pipeline to enrich journals with account info without manual caching.
     */
    observeEnrichedJournals(limit: number, dateRange?: AccountDateRange, searchQuery?: string) {
        const clauses: any[] = [
            Q.where('deleted_at', Q.eq(null)),
            Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
            Q.sortBy('journal_date', 'desc'),
            Q.sortBy('created_at', 'desc'),
            Q.take(limit)
        ];

        if (dateRange?.accountId) {
            clauses.push(Q.experimentalJoinTables(['transactions']));
            clauses.push(Q.on('transactions', Q.where('account_id', dateRange.accountId)));
        }

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

        // 1. Stable stream of Journal IDs
        const journalIds$ = journalsObservable.pipe(
            map((journals) => journals.map(j => j.id).sort()),
            distinctUntilChanged((a, b) => a.length === b.length && a.every((id, idx) => id === b[idx]))
        );

        // 2. Stable Transaction Stream
        // Only re-queries if the list of visible journals changes
        const transactions$ = journalIds$.pipe(
            switchMap((journalIds) => {
                if (journalIds.length === 0) return of([] as Transaction[]);

                return transactionRepository.transactionsQuery(
                    Q.where('journal_id', Q.oneOf(journalIds)),
                    Q.where('deleted_at', Q.eq(null))
                ).observeWithColumns([
                    'account_id',
                    'journal_id',
                    'transaction_type',
                    'deleted_at'
                ]);
            })
        );

        // 3. Stable Helper Stream: Unique Account IDs involved in these transactions
        const accountIds$ = transactions$.pipe(
            map((transactions) => Array.from(new Set(transactions.map(t => t.accountId))).sort()),
            distinctUntilChanged((a, b) => a.length === b.length && a.every((id, idx) => id === b[idx]))
        );

        // 4. Stable Account Stream
        const accounts$ = accountIds$.pipe(
            switchMap((accountIds) => {
                if (accountIds.length === 0) return of([] as Account[]);
                return accountRepository.observeByIds(accountIds);
            })
        );

        // 5. Combine everything
        return combineLatest([journalsObservable, transactions$, accounts$]).pipe(
            map(([journals, transactions, accounts]) => {
                if (journals.length === 0) return [] as EnrichedJournal[];

                const accountMap = new Map(accounts.map(a => [a.id, a]));

                return journals.map(j => {
                    const jTxs = transactions.filter(t => t.journalId === j.id);
                    const journalAccountIds = Array.from(new Set(jTxs.map(t => t.accountId)));

                    const enrichedAccounts = journalAccountIds.map(id => {
                        const acc = accountMap.get(id);

                        const role = jTxs.find(t => t.accountId === id)?.transactionType === TransactionType.CREDIT
                            ? 'SOURCE'
                            : 'DESTINATION';

                        return {
                            id,
                            name: acc?.name || 'Unknown',
                            accountType: acc?.accountType || 'ASSET',
                            role: role as 'SOURCE' | 'DESTINATION' | 'NEUTRAL',
                            icon: acc?.icon
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
