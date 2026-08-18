import Journal from '@/src/data/models/Journal';
import TransactionInboxRecord, {
  InboxProcessingStatus,
} from '@/src/data/models/TransactionInboxRecord';
import { JournalEntryLine, JournalId, TransactionType, WorkplaceId } from '@/src/types/domain';

import type { JournalAutofillSuggestion } from '@/src/data/repositories/journal/journalEnrichmentTypes';
import {
  journalEnrichmentQueries,
  journalQueryRepository,
} from '@/src/data/repositories/journal/journalTimelineModule';
import type { CreateJournalData } from '@/src/data/repositories/journal/journalWriteModule';
import { transactionInboxRepository } from '@/src/data/repositories/TransactionInboxRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { analytics } from '@/src/services/analytics-service';
import { ledgerWriteService } from '@/src/services/ledger';
import { PreparedJournalData, prepareJournalData } from '@/src/services/ledger/prepareJournalData';
import { workplaceService } from '@/src/services/WorkplaceService';
import { logger } from '@/src/utils/logger';
import { assembleCreateJournalData, validateJournalEntryStructure } from './journalSaveHelpers';

export interface SubmitJournalResult {
  success: boolean;
  error?: string;
  action?: 'created' | 'updated';
  journalId?: JournalId;
}

export class JournalService {
  async createJournal(
    data: CreateJournalData,
    workplaceId: WorkplaceId,
    smsRecord?: TransactionInboxRecord | null,
  ): Promise<Journal> {
    if (!smsRecord) {
      return ledgerWriteService.createJournal(data, workplaceId);
    }
    return ledgerWriteService.createJournal(data, workplaceId, {
      extraOps: journal => [
        transactionInboxRepository.prepareLink(
          smsRecord,
          journal.id as JournalId,
          InboxProcessingStatus.IMPORTED,
        ),
      ],
    });
  }

  async updateJournal(
    journalId: JournalId,
    data: CreateJournalData,
    workplaceId: WorkplaceId,
  ): Promise<Journal> {
    return ledgerWriteService.updateJournal(journalId, data, workplaceId);
  }

  async deleteJournal(journalId: JournalId, workplaceId: WorkplaceId): Promise<void> {
    await ledgerWriteService.deleteJournal(journalId, workplaceId);
    analytics.trackFeatureUsage('journal', 'delete', {
      journal_id: journalId,
    });
  }

  async recoverJournal(journalId: JournalId, workplaceId: WorkplaceId): Promise<Journal> {
    const journal = await ledgerWriteService.recoverJournal(journalId, workplaceId);
    analytics.trackFeatureUsage('journal', 'recover', {
      journal_id: journalId,
      currency: journal.currencyCode,
    });
    return journal;
  }

  async postJournal(journalId: JournalId, workplaceId: WorkplaceId): Promise<Journal> {
    const journal = await ledgerWriteService.postJournal(journalId, workplaceId);
    analytics.trackFeatureUsage('journal', 'post', {
      journal_id: journalId,
      currency: journal.currencyCode,
    });
    return journal;
  }

  async revertToPlanned(journalId: JournalId, workplaceId: WorkplaceId): Promise<Journal> {
    const journal = await ledgerWriteService.revertToPlanned(journalId, workplaceId);
    analytics.trackFeatureUsage('journal', 'revert_to_planned', {
      journal_id: journalId,
      currency: journal.currencyCode,
    });
    return journal;
  }

  async duplicateJournal(journalId: JournalId, workplaceId: WorkplaceId): Promise<Journal> {
    const journal = await journalQueryRepository.find(workplaceId, journalId);
    if (!journal) throw new Error('Journal not found');

    const transactions = await transactionRepository.findByJournal(workplaceId, journalId);

    const duplicated = await ledgerWriteService.createJournal(
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

    analytics.trackFeatureUsage('journal', 'duplicate', {
      source_journal_id: journalId,
      new_journal_id: duplicated.id,
      transaction_count: transactions.length,
      currency: journal.currencyCode,
    });

    return duplicated;
  }

  async createReversalJournal(
    originalJournalId: JournalId,
    reason: string = 'Reversal',
    workplaceId: WorkplaceId,
  ): Promise<Journal> {
    const reversalJournal = await ledgerWriteService.createReversalJournal(
      originalJournalId,
      reason,
      workplaceId,
    );

    analytics.trackFeatureUsage('journal', 'reversal', {
      original_journal_id: originalJournalId,
      reversal_journal_id: reversalJournal.id,
      reason,
      currency: reversalJournal.currencyCode,
    });

    return reversalJournal;
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
    const { journalId, mode = 'advanced', workplaceId, ...entryParams } = params;

    try {
      const assembled = await assembleCreateJournalData({ ...entryParams, workplaceId });
      if (!assembled.success) {
        return assembled;
      }

      const { journalData } = assembled;
      const currencyCode = journalData.currencyCode;

      if (journalId) {
        const updatedJournal = await this.updateJournal(journalId, journalData, workplaceId);
        analytics.logTransactionCreated(mode, 'update', currencyCode);
        analytics.trackFeatureUsage('journal', 'update', {
          mode,
          currency: currencyCode,
          transaction_count: journalData.transactions?.length || 0,
        });
        return { success: true, action: 'updated', journalId: updatedJournal.id };
      }

      const smsRecord = params.smsRecordId
        ? await transactionInboxRepository.find(workplaceId, params.smsRecordId)
        : null;
      const createdJournal = await this.createJournal(journalData, workplaceId, smsRecord);
      analytics.logTransactionCreated(mode, 'create', currencyCode);
      analytics.trackFeatureUsage('journal', 'create', {
        mode,
        currency: currencyCode,
        transaction_count: journalData.transactions.length || 0,
      });
      analytics.trackConversion('transaction_created');
      return { success: true, action: 'created', journalId: createdJournal.id };
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
      const structureError = validateJournalEntryStructure({
        lines: entry.lines,
        description: entry.description,
      });
      if (structureError) {
        return { ...structureError, summaries: [] };
      }
    }

    const preparedItems: {
      data: CreateJournalData;
      prepared: PreparedJournalData;
      description: string;
      amount: number;
      currency: string;
    }[] = [];

    let currencyCode: string;
    try {
      currencyCode = await workplaceService.getCurrency(workplaceId);

      for (const entry of entries) {
        const assembled = await assembleCreateJournalData({
          lines: entry.lines,
          description: entry.description,
          journalDate: entry.journalDate,
          workplaceId,
          currencyCode,
        });
        if (!assembled.success) {
          return { ...assembled, summaries: [] };
        }

        const prepared = await prepareJournalData(assembled.journalData, workplaceId);
        preparedItems.push({
          data: assembled.journalData,
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
      await ledgerWriteService.createMany(
        preparedItems.map(p => ({ data: p.data, prepared: p.prepared })),
        workplaceId,
      );

      for (const p of preparedItems) {
        analytics.logTransactionCreated('simple', 'create', p.currency);
        analytics.trackConversion('transaction_created');
      }

      analytics.trackFeatureUsage('journal', 'bulk_create', {
        count: preparedItems.length,
        currency: currencyCode,
      });

      return {
        success: true,
        summaries: preparedItems.map(p => ({
          description: p.description,
          amount: p.amount,
          currency: p.currency,
        })),
      };
    } catch (error) {
      logger.error('Failed to batch save bulk journals:', error);
      return { success: false, error: 'Failed to save journal entries atomically', summaries: [] };
    }
  }

  async getJournalSuggestions(workplaceId: WorkplaceId): Promise<JournalAutofillSuggestion[]> {
    return journalEnrichmentQueries.getRecentUniqueDescriptions(workplaceId);
  }
}

export const journalService = new JournalService();
