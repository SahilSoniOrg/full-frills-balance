import { MetadataKeys, MetadataSources } from '@/src/constants/ledger-constants';
import { database } from '@/src/data/database/Database';
import { AuditAction } from '@/src/data/models/AuditLog';
import Journal, { JournalStatus } from '@/src/data/models/Journal';
import Transaction, { TransactionType } from '@/src/data/models/Transaction';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { CreateJournalData, journalRepository } from '@/src/data/repositories/JournalRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { AccountDateRange } from '@/src/hooks/usePaginatedObservable';
import { analytics } from '@/src/services/analytics-service';
import { auditService } from '@/src/services/audit-service';
import { ledgerWriteService } from '@/src/services/ledger';
import { PreparedJournalData, prepareJournalData } from '@/src/services/ledger/prepareJournalData';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';

import { observeEnrichedJournals as observeEnrichedJournalsHelper } from './journalEnrichedObserver';
import { workplaceService } from '@/src/services/WorkplaceService';
import {
  AccountId,
  JournalEntryLine,
  JournalId,
  WorkplaceId,
  mapTransactionToAudit,
} from '@/src/types/domain';
import { accountingService } from '@/src/utils/accountingService';
import { logger } from '@/src/utils/logger';
import { safeParseJSON } from '@/src/utils/serialization';
import { sanitizeAmount } from '@/src/utils/validation';
import { Model } from '@nozbe/watermelondb';

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

      await database.batch([journalOp, ...txOps, auditOp]);
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

      await database.batch([journalOp, ...txOps, auditOp]);
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
    const originalDate = journal.journalDate;

    await database.write(async () => {
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

      await database.batch([metadataOp, journalOp, ...txOps]);
    });

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

    const metadata = await journalRepository.findMetadataByJournalId(journalId, workplaceId);
    if (metadata?.metadataJson) {
      try {
        const json = safeParseJSON<Record<string, any>>(metadata.metadataJson, {});
        if (json[MetadataKeys.ORIGINAL_PLANNED_DATE]) {
          revertTime = json[MetadataKeys.ORIGINAL_PLANNED_DATE];
        } else {
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
      const journalOp = journal.prepareUpdate((record: Journal) => {
        record.status = JournalStatus.PLANNED;
        record.journalDate = revertTime;
        record.updatedAt = new Date();
      });

      const txOps = transactions.map(tx =>
        tx.prepareUpdate((record: Transaction) => {
          record.transactionDate = revertTime;
          record.updatedAt = new Date();
        }),
      );

      await database.batch([journalOp, ...txOps]);
    });

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

  async saveJournalEntry(params: {
    lines: JournalEntryLine[];
    description: string;
    notes?: string;
    journalDate: string | number;
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

    let combinedTimestamp: number;
    if (typeof journalDate === 'number') {
      combinedTimestamp = journalDate;
    } else {
      const time = journalTime || '00:00';
      const timeWithSeconds = time.split(':').length === 2 ? `${time}:00` : time;
      combinedTimestamp = new Date(`${journalDate}T${timeWithSeconds}`).getTime();
    }

    if (Number.isNaN(combinedTimestamp)) {
      return { success: false, error: 'Invalid date or time' };
    }

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

    try {
      let smsMetadataJson: string | undefined;
      if (smsRecordId) {
        try {
          const inboxRecord = await database.collections
            .get<TransactionInboxRecord>('transaction_inbox_records')
            .find(smsRecordId);
          smsMetadataJson = JSON.stringify({
            smsFingerprint: inboxRecord.inputFingerprint,
            parsedAmount: inboxRecord.parsedAmount ?? null,
            parsedCurrencyCode: inboxRecord.parsedCurrencyCode ?? null,
            parsedMerchant: inboxRecord.parsedMerchant ?? null,
            referenceNumber: inboxRecord.referenceNumber ?? null,
            accountSource: inboxRecord.parsedAccountSource ?? null,
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

  async saveBulkJournalEntries(
    entries: {
      lines: JournalEntryLine[];
      description: string;
      journalDate: number;
      workplaceId: WorkplaceId;
    }[],
  ): Promise<{
    success: boolean;
    error?: string;
    summaries: { description: string; amount: number; currency: string }[];
  }> {
    if (entries.length === 0) {
      return { success: false, error: 'No entries to save', summaries: [] };
    }

    const workplaceId = entries[0].workplaceId;

    for (const entry of entries) {
      if (!entry.description.trim()) {
        return { success: false, error: 'Description is required', summaries: [] };
      }
      if (entry.lines.length < 2) {
        return {
          success: false,
          error: 'A journal entry must have at least 2 lines',
          summaries: [],
        };
      }
      if (entry.lines.some(l => !l.accountId)) {
        return { success: false, error: 'All lines must have an account', summaries: [] };
      }
      const distinctValidation = accountingService.validateDistinctAccounts(
        entry.lines.map(l => l.accountId),
      );
      if (!distinctValidation.isValid) {
        return {
          success: false,
          error: 'A journal entry must involve at least 2 distinct accounts',
          summaries: [],
        };
      }
    }

    const preparedDataList: {
      journalData: CreateJournalData;
      prepared: PreparedJournalData;
      description: string;
      amount: number;
      currency: string;
    }[] = [];

    try {
      const currencyCode = await workplaceService.getCurrency(workplaceId);

      for (const entry of entries) {
        const domainLines = entry.lines.map(line => ({
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
            summaries: [],
          };
        }

        const journalData: CreateJournalData = {
          journalDate: entry.journalDate,
          description: entry.description.trim(),
          currencyCode,
          transactions: entry.lines.map(l => ({
            accountId: l.accountId,
            amount: sanitizeAmount(l.amount) || 0,
            transactionType: l.transactionType,
            notes: l.notes?.trim() || undefined,
            exchangeRate: l.exchangeRate ? parseFloat(l.exchangeRate) : undefined,
            currencyCode: l.accountCurrency,
          })),
        };

        // Async data prep only (no DB mutations)
        const prepared = await prepareJournalData(journalData, workplaceId);

        preparedDataList.push({
          journalData,
          prepared,
          description: entry.description,
          amount: parseFloat(entry.lines[0].amount),
          currency: currencyCode,
        });
      }
    } catch (error) {
      logger.error('Failed to prepare bulk journals:', error);
      return { success: false, error: 'Failed to prepare journal entries', summaries: [] };
    }

    try {
      const allAccountsToRebuild = new Set<AccountId>();
      const minDate = Math.min(...preparedDataList.map(p => p.journalData.journalDate));

      // Synchronous phase: all prepareCreate + batch inside one write block
      try {
        await database.write(async () => {
          const allOps: Model[] = [];
          for (const p of preparedDataList) {
            const { ops, accountsToRebuild } =
              ledgerWriteService.prepareCreateJournalFromPreparedData(
                p.journalData,
                p.prepared,
                workplaceId,
              );
            allOps.push(...ops);
            for (const accountId of accountsToRebuild) {
              allAccountsToRebuild.add(accountId);
            }
          }
          await database.batch(allOps);
        });
      } finally {
        if (allAccountsToRebuild.size > 0) {
          rebuildQueueService.enqueueMany(allAccountsToRebuild, minDate, workplaceId);
        }
      }

      for (const p of preparedDataList) {
        analytics.logTransactionCreated('simple', 'create', p.currency);
        analytics.trackConversion(
          'transaction_created',
          p.journalData.transactions?.reduce((sum, t) => sum + Math.abs(t.amount), 0) || 0,
          p.currency,
        );
      }

      const summaries = preparedDataList.map(p => ({
        description: p.description,
        amount: p.amount,
        currency: p.currency,
      }));

      return { success: true, summaries };
    } catch (error) {
      logger.error('Failed to batch save bulk journals:', error);
      return { success: false, error: 'Failed to save journal entries atomically', summaries: [] };
    }
  }

  observeEnrichedJournals(
    workplaceId: WorkplaceId,
    limit: number,
    dateRange?: AccountDateRange & { accountIds?: string[] },
    searchQuery?: string,
    status?: JournalStatus[],
    options?: { minAmount?: number; maxAmount?: number; displayType?: string },
  ) {
    return observeEnrichedJournalsHelper(
      workplaceId,
      limit,
      dateRange,
      searchQuery,
      status,
      options,
    );
  }

  async getJournalSuggestions(
    workplaceId: WorkplaceId,
  ): Promise<{ description: string; count: number }[]> {
    return journalRepository.getRecentUniqueDescriptions(workplaceId);
  }
}

export const journalService = new JournalService();
