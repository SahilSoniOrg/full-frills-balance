import { MetadataKeys, MetadataSources } from '@/src/constants/ledger-constants';
import { database } from '@/src/data/database/Database';
import Account, { AccountType } from '@/src/data/models/Account';
import { AuditAction } from '@/src/data/models/AuditLog';
import Journal, { JournalStatus } from '@/src/data/models/Journal';
import SmsInboxRecord from '@/src/data/models/SmsInboxRecord';
import Transaction, { TransactionType } from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { CreateJournalData, journalRepository } from '@/src/data/repositories/JournalRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { AccountDateRange } from '@/src/hooks/usePaginatedObservable';
import { analytics } from '@/src/services/analytics-service';
import { auditService } from '@/src/services/audit-service';
import { ledgerWriteService } from '@/src/services/ledger';
import { prepareJournalData } from '@/src/services/ledger/prepareJournalData';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { workplaceService } from '@/src/services/WorkplaceService';
import {
  AccountId,
  EnrichedJournal,
  JournalEntryLine,
  JournalId,
  WorkplaceId,
  mapTransactionToAudit,
} from '@/src/types/domain';
import { accountingService } from '@/src/utils/accountingService';
import { journalPresenter } from '@/src/utils/journalPresenter';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { logger } from '@/src/utils/logger';
import { safeParseJSON } from '@/src/utils/serialization';
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
  journalId?: JournalId;
}

export class JournalService {
  async updateJournal(
    journalId: JournalId,
    data: CreateJournalData,
    workplaceId: WorkplaceId,
  ): Promise<Journal> {
    const originalJournal = await journalRepository.find(workplaceId, journalId);
    if (!originalJournal) throw new Error('Journal not found');

    const originalTransactions = await transactionRepository.findByJournal(workplaceId, journalId);
    const prepared = await prepareJournalData(data, workplaceId);

    // Build the audit op inside the synchronous callback creator.
    const extraOpCreator = () => {
      const mappedBeforeTransactions = originalTransactions.map(t => mapTransactionToAudit(t));
      const mappedAfterTransactions = data.transactions.map(t => mapTransactionToAudit(t));
      return auditRepository.prepareLog(
        {
          entityType: 'journal',
          entityId: journalId,
          action: AuditAction.UPDATE,
          changes: {
            before: {
              description: originalJournal.description,
              journalDate: originalJournal.journalDate,
              currencyCode: originalJournal.currencyCode,
              status: originalJournal.status,
              totalAmount: originalJournal.totalAmount,
              transactions: mappedBeforeTransactions,
            },
            after: {
              description: data.description,
              journalDate: data.journalDate,
              transactions: mappedAfterTransactions,
            },
          },
        },
        workplaceId,
      );
    };

    // updateJournalWithTransactions opens its own write — pass the creator.
    const journal = await journalRepository.updateJournalWithTransactions(
      workplaceId,
      journalId,
      {
        ...data,
        transactions: prepared.transactions,
        totalAmount: prepared.totalAmount,
        displayType: prepared.displayType,
        calculatedBalances: prepared.calculatedBalances,
        metadata: data.metadata,
      },
      extraOpCreator,
    );

    const originalAccountIds = new Set(originalTransactions.map(t => t.accountId));
    const allAccountsToRebuild = new Set<AccountId>([
      ...prepared.accountsToRebuild,
      ...originalAccountIds,
    ]);
    const rebuildFromDate = Math.min(originalJournal.journalDate, data.journalDate);
    rebuildQueueService.enqueueMany(allAccountsToRebuild, rebuildFromDate, workplaceId);

    return journal;
  }

  async deleteJournal(journalId: JournalId, workplaceId: WorkplaceId): Promise<void> {
    const prepared = await journalRepository.fetchJournalForDeletion(journalId, workplaceId);
    if (!prepared) return;

    const { journal, transactions } = prepared;

    await database.write(async () => {
      const now = new Date();
      const journalOp = journal.prepareUpdate(j => {
        j.deletedAt = now;
        j.updatedAt = now;
      });
      const txOps = transactions.map(tx =>
        tx.prepareUpdate(t => {
          t.deletedAt = now;
          t.updatedAt = now;
        }),
      );

      const auditOp = auditRepository.prepareLog(
        {
          entityType: 'journal',
          entityId: journalId,
          action: AuditAction.DELETE,
          changes: {
            before: {
              description: journal.description,
              totalAmount: journal.totalAmount,
              currencyCode: journal.currencyCode,
              transactions: transactions.map(t => mapTransactionToAudit(t)),
            },
            after: { deletedAt: now },
          },
        },
        workplaceId,
      );

      await database.batch(journalOp, ...txOps, auditOp);
    });

    const accountIds = Array.from(new Set(transactions.map((t: Transaction) => t.accountId)));
    rebuildQueueService.enqueueMany(accountIds, journal.journalDate, workplaceId);
  }

  async recoverJournal(journalId: JournalId, workplaceId: WorkplaceId): Promise<Journal> {
    const prepared = await journalRepository.fetchJournalForDeletion(journalId, workplaceId);
    if (!prepared) throw new Error('Journal not found');

    const { journal, transactions } = prepared;
    const prevDeletedAt = journal.deletedAt ? new Date(journal.deletedAt.getTime()) : undefined;

    await database.write(async () => {
      const now = new Date();
      const journalOp = journal.prepareUpdate(j => {
        j.deletedAt = undefined;
        j.updatedAt = now;
      });
      const txOps = transactions.map(tx =>
        tx.prepareUpdate(t => {
          t.deletedAt = undefined;
          t.updatedAt = now;
        }),
      );

      const auditOp = auditRepository.prepareLog(
        {
          entityType: 'journal',
          entityId: journalId,
          action: AuditAction.UPDATE,
          changes: {
            before: { deletedAt: prevDeletedAt },
            after: { restoredAt: now },
          },
        },
        workplaceId,
      );

      await database.batch(journalOp, ...txOps, auditOp);
    });

    const accountIds = Array.from(new Set(transactions.map((t: Transaction) => t.accountId)));
    rebuildQueueService.enqueueMany(accountIds, journal.journalDate, workplaceId);

    return journal;
  }

  async duplicateJournal(journalId: JournalId, workplaceId: WorkplaceId): Promise<Journal> {
    const journal = await journalRepository.find(workplaceId, journalId);
    if (!journal) throw new Error('Journal not found');

    const transactions = await transactionRepository.findByJournal(workplaceId, journalId);

    return ledgerWriteService.createJournal(
      {
        journalDate: Date.now(),
        description: journal.description ? `${journal.description}` : undefined,
        currencyCode: journal.currencyCode,
        transactions: transactions.map(tx => ({
          accountId: tx.accountId,
          amount: tx.amount,
          transactionType: tx.transactionType as TransactionType,
          notes: tx.notes,
          exchangeRate: tx.exchangeRate,
        })),
      },
      journal.workplaceId,
    );
  }

  async createReversalJournal(
    originalJournalId: JournalId,
    reason: string = 'Reversal',
    workplaceId: WorkplaceId,
  ): Promise<Journal> {
    const originalJournal = await journalRepository.find(workplaceId, originalJournalId);
    if (!originalJournal) throw new Error('Original journal not found');

    const originalTransactions = await transactionRepository.findByJournal(
      workplaceId,
      originalJournalId,
    );
    const reversedTxs = originalTransactions.map(tx => ({
      accountId: tx.accountId,
      amount: tx.amount,
      transactionType:
        tx.transactionType === TransactionType.DEBIT
          ? TransactionType.CREDIT
          : TransactionType.DEBIT,
      notes: `Reversal: ${tx.notes || ''}`,
      exchangeRate: tx.exchangeRate || 1,
    }));

    const reversalJournal = await ledgerWriteService.createJournal(
      {
        journalDate: Date.now(),
        description: `Reversal of: ${originalJournal.description || originalJournalId} (${reason})`,
        currencyCode: originalJournal.currencyCode,
        transactions: reversedTxs,
        originalJournalId: originalJournalId,
      },
      originalJournal.workplaceId,
    );

    // Link them
    await journalRepository.markReversed(originalJournalId, reversalJournal.id, workplaceId);

    return reversalJournal;
  }

  async postJournal(journalId: JournalId, workplaceId: WorkplaceId): Promise<Journal> {
    const journal = await journalRepository.find(workplaceId, journalId);
    if (!journal) throw new Error('Journal not found');
    if (journal.status !== JournalStatus.PLANNED) {
      throw new Error(
        `Cannot post journal with status ${journal.status}. Only PLANNED journals can be posted.`,
      );
    }

    const postTime = Date.now();
    const transactions = await transactionRepository.findByJournal(workplaceId, journalId);

    // M-3 fix evolved: status-only patch + date propagation (F-14 fix).
    // Update both the journal date and all associated transaction dates to "now".
    const originalDate = journal.journalDate;

    // Prepare metadata op BEFORE the write block (read-only work outside the lock).
    const metadataOp = await journalRepository.prepareMetadataPatch(
      workplaceId,
      journalId,
      { [MetadataKeys.ORIGINAL_PLANNED_DATE]: originalDate },
      MetadataSources.MANUAL_POST,
    );

    const journalOp = journal.prepareUpdate((record: Journal) => {
      record.status = JournalStatus.POSTED;
      record.journalDate = postTime;
      record.updatedAt = new Date();
    });

    const txOps = transactions.map(tx =>
      tx.prepareUpdate((record: Transaction) => {
        record.transactionDate = postTime;
        record.updatedAt = new Date();
      }),
    );

    // Single atomic write: metadata + journal status + transaction dates.
    await database.write(async () => {
      await database.batch(metadataOp, journalOp, ...txOps);
    });

    // 2. Audit log
    await auditService.log(
      {
        entityType: 'journal',
        entityId: journalId,
        action: AuditAction.UPDATE,
        changes: {
          before: { status: JournalStatus.PLANNED, journalDate: originalDate },
          after: { status: JournalStatus.POSTED, journalDate: postTime },
        },
      },
      workplaceId,
    );

    // 3. Rebuild balances for the accounts involved in this journal
    const accountIds = Array.from(new Set(transactions.map((t: Transaction) => t.accountId)));
    rebuildQueueService.enqueueMany(accountIds, postTime, workplaceId);

    logger.info(`Manually posted journal ${journalId} at ${new Date(postTime).toLocaleString()}`);
    return journal;
  }

  async revertToPlanned(journalId: JournalId, workplaceId: WorkplaceId): Promise<Journal> {
    const journal = await journalRepository.find(workplaceId, journalId);
    if (!journal) throw new Error('Journal not found');
    if (journal.status !== JournalStatus.POSTED && journal.status !== JournalStatus.SKIPPED) {
      throw new Error(
        `Cannot revert journal with status ${journal.status}. Only POSTED or SKIPPED journals can be reverted.`,
      );
    }

    const currentJournalDate = journal.journalDate;
    let revertTime: number;

    // Try to recover original scheduled date from metadata
    const metadata = await journalRepository.findMetadataByJournalId(journalId, workplaceId);
    if (metadata?.metadataJson) {
      try {
        const json = safeParseJSON<Record<string, any>>(metadata.metadataJson, {});
        if (json[MetadataKeys.ORIGINAL_PLANNED_DATE]) {
          revertTime = json[MetadataKeys.ORIGINAL_PLANNED_DATE];
        } else {
          // Fallback to midnight of current date if no record found
          const date = new Date(currentJournalDate);
          date.setHours(0, 0, 0, 0);
          revertTime = date.getTime();
        }
      } catch {
        const date = new Date(currentJournalDate);
        date.setHours(0, 0, 0, 0);
        revertTime = date.getTime();
      }
    } else {
      const date = new Date(currentJournalDate);
      date.setHours(0, 0, 0, 0);
      revertTime = date.getTime();
    }

    const transactions = await transactionRepository.findByJournal(workplaceId, journalId);

    await database.write(async () => {
      await journal.update((record: Journal) => {
        record.status = JournalStatus.PLANNED;
        record.journalDate = revertTime;
        record.updatedAt = new Date();
      });

      for (const tx of transactions) {
        await tx.update((record: Transaction) => {
          record.transactionDate = revertTime;
          record.updatedAt = new Date();
        });
      }
    });

    // 2. Audit log
    await auditService.log(
      {
        entityType: 'journal',
        entityId: journalId,
        action: AuditAction.UPDATE,
        changes: {
          before: { status: JournalStatus.POSTED, journalDate: currentJournalDate },
          after: { status: JournalStatus.PLANNED, journalDate: revertTime },
        },
      },
      workplaceId,
    );

    // 3. Rebuild balances for the accounts involved (for both old and new dates)
    const accountIds = Array.from(new Set(transactions.map((t: Transaction) => t.accountId)));
    rebuildQueueService.enqueueMany(
      accountIds,
      Math.min(currentJournalDate, revertTime),
      workplaceId,
    );

    logger.info(
      `Unposted journal ${journalId}, reverted to PLANNED at ${new Date(revertTime).toLocaleDateString()}`,
    );
    return journal;
  }

  /**
   * Unified entry point for saving journals from Simple, Advanced, or Import flows.
   */
  async saveJournalEntry(params: {
    lines: JournalEntryLine[];
    description: string;
    notes?: string;
    journalDate: string | number; // support timestamp or ISO date
    journalTime?: string;
    journalId?: JournalId;
    smsId?: string;
    smsRecordId?: string;
    smsSender?: string;
    rawSmsBody?: string;
    mode?: 'simple' | 'advanced' | 'import';
    workplaceId: WorkplaceId;
  }): Promise<SubmitJournalResult> {
    const {
      lines,
      description,
      notes,
      journalDate,
      journalTime,
      journalId,
      smsId,
      smsRecordId,
      smsSender,
      rawSmsBody,
      mode = 'advanced',
      workplaceId,
    } = params;

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

    const distinctValidation = accountingService.validateDistinctAccounts(
      lines.map(l => l.accountId),
    );
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
      accountCurrency: line.accountCurrency,
    }));

    const balanceValidation = accountingService.validateJournal(domainLines);
    if (!balanceValidation.isValid) {
      return {
        success: false,
        error: `Journal is not balanced. Discrepancy: ${balanceValidation.imbalance}`,
      };
    }

    // 4. Persistence
    try {
      let smsMetadataJson: string | undefined;
      if (smsRecordId) {
        try {
          const smsRecord = await database.collections
            .get<SmsInboxRecord>('sms_inbox_records')
            .find(smsRecordId);
          smsMetadataJson = JSON.stringify({
            smsFingerprint: smsRecord.smsFingerprint,
            parsedAmount: smsRecord.parsedAmount ?? null,
            parsedCurrencyCode: smsRecord.parsedCurrencyCode ?? null,
            parsedMerchant: smsRecord.parsedMerchant ?? null,
            referenceNumber: smsRecord.referenceNumber ?? null,
            accountSource: smsRecord.parsedAccountSource ?? null,
          });
        } catch {
          smsMetadataJson = undefined;
        }
      }

      const metadata =
        smsId || smsSender || rawSmsBody
          ? {
              importSource: smsId ? 'sms' : 'manual',
              originalSmsId: smsId,
              originalSmsSender: smsSender,
              originalSmsBody: rawSmsBody,
              metadataJson: smsMetadataJson,
            }
          : undefined;

      const currencyCode = await workplaceService.getCurrency(workplaceId);

      const journalData: CreateJournalData = {
        journalDate: combinedTimestamp,
        description: finalDescription,
        notes: notes?.trim() || undefined,
        currencyCode,
        metadata,
        transactions: lines.map(l => ({
          accountId: l.accountId,
          amount: sanitizeAmount(l.amount) || 0,
          transactionType: l.transactionType,
          notes:
            l.notes && typeof l.notes === 'string' && l.notes.trim() ? l.notes.trim() : undefined,
          exchangeRate: l.exchangeRate ? parseFloat(l.exchangeRate) : undefined,
          currencyCode: l.accountCurrency,
        })),
      };

      if (journalId) {
        const updatedJournal = await this.updateJournal(journalId, journalData, workplaceId);
        analytics.logTransactionCreated(mode, 'update', currencyCode);
        analytics.trackFeatureUsage('journal', 'update', {
          mode,
          currency: currencyCode,
          transaction_count: journalData.transactions?.length || 0,
        });
        return { success: true, action: 'updated', journalId: updatedJournal.id };
      } else {
        const createdJournal = await ledgerWriteService.createJournal(journalData, workplaceId);
        analytics.logTransactionCreated(mode, 'create', currencyCode);
        analytics.trackFeatureUsage('journal', 'create', {
          mode,
          currency: currencyCode,
          transaction_count: journalData.transactions.length || 0,
        });
        analytics.trackConversion(
          'transaction_created',
          journalData.transactions?.reduce((sum, t) => sum + Math.abs(t.amount), 0),
          currencyCode,
        );
        return { success: true, action: 'created', journalId: createdJournal.id };
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
  observeEnrichedJournals(
    workplaceId: WorkplaceId,
    limit: number,
    dateRange?: AccountDateRange & { accountIds?: string[] },
    searchQuery?: string,
    status?: JournalStatus[],
    options?: { minAmount?: number; maxAmount?: number; displayType?: string },
  ) {
    const clauses: any[] = [
      Q.where('workplace_id', workplaceId),
      Q.where('deleted_at', Q.eq(null)),
      Q.where('status', Q.oneOf(status || [...ACTIVE_JOURNAL_STATUSES])),
      Q.sortBy('journal_date', 'desc'),
      Q.sortBy('created_at', 'desc'),
      Q.take(limit),
    ];

    // Multi-account filtering
    const accountIds = dateRange?.accountIds || (dateRange?.accountId ? [dateRange.accountId] : []);

    if (accountIds.length > 0 && !dateRange?.plannedPaymentId) {
      clauses.push(Q.experimentalJoinTables(['transactions']));
      clauses.push(Q.on('transactions', Q.where('account_id', Q.oneOf(accountIds))));
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

    if (options?.minAmount !== undefined) {
      clauses.push(Q.where('total_amount', Q.gte(options.minAmount)));
    }
    if (options?.maxAmount !== undefined) {
      clauses.push(Q.where('total_amount', Q.lte(options.maxAmount)));
    }
    if (options?.displayType) {
      clauses.push(Q.where('display_type', Q.eq(options.displayType)));
    }

    const journalsObservable = journalRepository
      .journalsQuery(...clauses)
      .observeWithColumns([
        'journal_date',
        'description',
        'notes',
        'currency_code',
        'status',
        'total_amount',
        'transaction_count',
        'display_type',
      ]);

    // 1. Stable stream of Journal IDs
    const journalIds$ = journalsObservable.pipe(
      map(journals => journals.map(j => j.id).sort()),
      distinctUntilChanged((a, b) => a.length === b.length && a.every((id, idx) => id === b[idx])),
    );

    // 2. Stable Transaction Stream
    // Only re-queries if the list of visible journals changes
    const transactions$ = journalIds$.pipe(
      switchMap(journalIds => {
        if (journalIds.length === 0) return of([] as Transaction[]);

        return transactionRepository
          .transactionsQuery(
            Q.where('workplace_id', workplaceId),
            Q.where('journal_id', Q.oneOf(journalIds)),
            Q.where('deleted_at', Q.eq(null)),
          )
          .observeWithColumns(['account_id', 'journal_id', 'transaction_type', 'deleted_at']);
      }),
    );

    // 3. Stable Helper Stream: Unique Account IDs involved in these transactions
    const accountIds$ = transactions$.pipe(
      map(transactions => Array.from(new Set(transactions.map(t => t.accountId))).sort()),
      distinctUntilChanged((a, b) => a.length === b.length && a.every((id, idx) => id === b[idx])),
    );

    // 4. Stable Account Stream
    const accounts$ = accountIds$.pipe(
      switchMap(accountIds => {
        if (accountIds.length === 0) return of([] as Account[]);
        return accountRepository.observeByIds(workplaceId, accountIds);
      }),
    );

    // 5. Combine everything
    return combineLatest([journalsObservable, transactions$, accounts$]).pipe(
      map(([journals, transactions, accounts]) => {
        if (journals.length === 0) return [] as EnrichedJournal[];

        const accountMap = new Map(accounts.map(a => [a.id, a]));
        const transactionsByJournal = new Map<string, Transaction[]>();

        for (const t of transactions) {
          const list = transactionsByJournal.get(t.journalId) || [];
          list.push(t);
          transactionsByJournal.set(t.journalId, list);
        }

        return journals.map(j => {
          const jTxs = transactionsByJournal.get(j.id) || [];
          const journalAccountIds = Array.from(new Set(jTxs.map(t => t.accountId)));

          const accountTypesMap = new Map<string, AccountType>();
          journalAccountIds.forEach(id => {
            const acc = accountMap.get(id);
            if (acc) {
              accountTypesMap.set(id, acc.accountType as AccountType);
            }
          });

          const enrichedAccounts = journalAccountIds.map(id => {
            const acc = accountMap.get(id);

            const role =
              jTxs.find(t => t.accountId === id)?.transactionType === TransactionType.CREDIT
                ? 'SOURCE'
                : 'DESTINATION';

            return {
              id,
              name: acc?.name || 'Unknown',
              accountType: acc?.accountType || 'ASSET',
              role: role as 'SOURCE' | 'DESTINATION' | 'NEUTRAL',
              icon: acc?.icon,
            };
          });

          // Recalculate displayType, semanticType, and semanticLabel using multi-leg logic
          const { source, destination } = journalPresenter.getSourceAndDestTypes(
            jTxs,
            accountTypesMap,
          );
          const semanticType = journalPresenter.getSemanticType(source, destination);
          const displayType = journalPresenter.getJournalDisplayType(jTxs, accountTypesMap);
          const semanticLabel = journalPresenter.getJournalSemanticLabel(jTxs, accountTypesMap);

          return {
            id: j.id,
            journalDate: j.journalDate,
            description: j.description,
            notes: j.notes,
            currencyCode: j.currencyCode,
            status: j.status,
            totalAmount: j.totalAmount || 0,
            transactionCount: j.transactionCount || 0,
            displayType,
            semanticType,
            semanticLabel,
            accounts: enrichedAccounts,
            plannedPaymentId: j.plannedPaymentId,
          } as EnrichedJournal;
        });
      }),
      // M-6 fix: deduplicate identical subsequent emissions
      distinctUntilChanged((prev, curr) => {
        if (prev.length !== curr.length) return false;
        for (let i = 0; i < prev.length; i++) {
          const p = prev[i];
          const c = curr[i];
          // Simple deep check for the parts of the journal that trigger list re-renders
          if (
            p.id !== c.id ||
            p.status !== c.status ||
            p.description !== c.description ||
            p.notes !== c.notes ||
            p.totalAmount !== c.totalAmount ||
            p.transactionCount !== c.transactionCount ||
            p.accounts.length !== c.accounts.length
          )
            return false;

          // Quick check for account stability (ID + Name change should trigger re-render)
          for (let j = 0; j < p.accounts.length; j++) {
            if (p.accounts[j].id !== c.accounts[j].id || p.accounts[j].name !== c.accounts[j].name)
              return false;
          }
        }
        return true;
      }),
    );
  }
  async getJournalSuggestions(
    workplaceId: WorkplaceId,
  ): Promise<{ description: string; count: number }[]> {
    return journalRepository.getRecentUniqueDescriptions(workplaceId);
  }
}
export const journalService = new JournalService();
