import { AppConfig } from '@/src/constants';
import Account from '@/src/data/models/Account';
import { AuditAction } from '@/src/data/models/AuditLog';
import Journal, { JournalStatus } from '@/src/data/models/Journal';
import Transaction, { TransactionType } from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { CreateJournalData, journalRepository } from '@/src/data/repositories/JournalRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { AccountDateRange } from '@/src/hooks/usePaginatedObservable';
import { analytics } from '@/src/services/analytics-service';
import { auditService } from '@/src/services/audit-service';
import { ledgerWriteService } from '@/src/services/ledger';
import { prepareJournalData } from '@/src/services/ledger/prepareJournalData';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { EnrichedJournal, JournalEntryLine } from '@/src/types/domain';
import { accountingService } from '@/src/utils/accountingService';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { logger } from '@/src/utils/logger';
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

    async updateJournal(journalId: string, data: CreateJournalData): Promise<Journal> {
        const originalJournal = await journalRepository.find(journalId);
        if (!originalJournal) throw new Error('Journal not found');

        const originalTransactions = await transactionRepository.findByJournal(journalId);
        const prepared = await prepareJournalData(data);

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

        return ledgerWriteService.createJournal({
            journalDate: Date.now(),
            description: journal.description ? `${journal.description}` : undefined,
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

        const reversalJournal = await ledgerWriteService.createJournal({
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

    async postJournal(journalId: string): Promise<Journal> {
        const journal = await journalRepository.find(journalId);
        if (!journal) throw new Error('Journal not found');
        if (journal.status !== JournalStatus.PLANNED) {
            throw new Error(`Cannot post journal with status ${journal.status}. Only PLANNED journals can be posted.`);
        }

        const transactions = await transactionRepository.findByJournal(journalId);

        // 1. Update status to POSTED
        const updatedJournal = await journalRepository.updateJournalWithTransactions(journalId, {
            journalDate: journal.journalDate,
            description: journal.description || '',
            currencyCode: journal.currencyCode,
            transactions: transactions.map(t => ({
                accountId: t.accountId,
                amount: t.amount,
                transactionType: t.transactionType as TransactionType,
                notes: t.notes,
                exchangeRate: t.exchangeRate
            })),
            status: JournalStatus.POSTED
        });

        // 2. Audit log
        await auditService.log({
            entityType: 'journal',
            entityId: journalId,
            action: AuditAction.UPDATE,
            changes: { status: JournalStatus.POSTED }
        });

        // 3. Rebuild balances
        const accountIds = Array.from(new Set(transactions.map((t: Transaction) => t.accountId)));
        rebuildQueueService.enqueueMany(accountIds, journal.journalDate);

        logger.info(`Manually posted journal ${journalId}`);
        return updatedJournal;
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
                await ledgerWriteService.createJournal(journalData);
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
    observeEnrichedJournals(limit: number, dateRange?: AccountDateRange, searchQuery?: string, status?: JournalStatus[]) {
        const clauses: any[] = [
            Q.where('deleted_at', Q.eq(null)),
            Q.where('status', Q.oneOf(status || [...ACTIVE_JOURNAL_STATUSES])),
            Q.sortBy('journal_date', 'desc'),
            Q.sortBy('created_at', 'desc'),
            Q.take(limit)
        ];

        if (dateRange?.accountId && !dateRange.plannedPaymentId) {
            clauses.push(Q.experimentalJoinTables(['transactions']));
            clauses.push(Q.on('transactions', Q.where('account_id', dateRange.accountId)));
        }

        if (dateRange) {
            if (dateRange.startDate !== undefined) {
                clauses.push(Q.where('journal_date', Q.gte(dateRange.startDate)));
            }
            if (dateRange.endDate !== undefined) {
                clauses.push(Q.where('journal_date', Q.lte(dateRange.endDate)));
            }

            if (dateRange.journalIds && dateRange.journalIds.length > 0) {
                clauses.push(Q.where('id', Q.oneOf(dateRange.journalIds)));
            }

            if (dateRange.plannedPaymentId) {
                clauses.push(Q.where('planned_payment_id', Q.eq(dateRange.plannedPaymentId)));
            }
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
