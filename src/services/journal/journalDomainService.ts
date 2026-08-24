import Journal from '@/src/data/models/Journal';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import { InboxProcessingStatus, TransactionType } from '@/src/types/enums';
import { JournalEntryLine } from '@/src/types/domainJournal';
import { JournalId, WorkplaceId } from '@/src/types/ids';

import type { JournalAutofillSuggestion } from '@/src/data/repositories/journal/journalEnrichmentTypes';
import {
  journalEnrichmentQueries,
  journalQueryRepository,
} from '@/src/data/repositories/journal/journalTimelineModule';
import type { CreateJournalData } from '@/src/data/repositories/journal/journalWriteModule';
import { transactionInboxRepository } from '@/src/data/repositories/TransactionInboxRepository';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { analytics } from '@/src/services/analytics';
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
    this.clearSuggestionsCache(workplaceId);
    if (!smsRecord) {
      return ledgerWriteService.createJournal(data, workplaceId);
    }
    return ledgerWriteService.createJournal(data, workplaceId, {
      extraOps: journal => [
        transactionInboxRepository.prepareLink(
          smsRecord,
          journal.id,
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
    this.clearSuggestionsCache(workplaceId);
    return ledgerWriteService.updateJournal(journalId, data, workplaceId);
  }

  async deleteJournal(journalId: JournalId, workplaceId: WorkplaceId): Promise<void> {
    this.clearSuggestionsCache(workplaceId);
    await ledgerWriteService.deleteJournal(journalId, workplaceId);
    analytics.trackFeatureUsage('journal', 'delete', {
      journal_id: journalId,
    });
  }

  async recoverJournal(journalId: JournalId, workplaceId: WorkplaceId): Promise<Journal> {
    this.clearSuggestionsCache(workplaceId);
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

    const transactions = await transactionQueryRepository.findByJournal(workplaceId, journalId);

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

      this.clearSuggestionsCache(workplaceId);
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

  private suggestionsCache = new Map<WorkplaceId, JournalAutofillSuggestion[]>();
  private inFlightSuggestions = new Map<WorkplaceId, Promise<JournalAutofillSuggestion[]>>();

  clearSuggestionsCache(workplaceId?: WorkplaceId): void {
    if (workplaceId) {
      this.suggestionsCache.delete(workplaceId);
      this.inFlightSuggestions.delete(workplaceId);
    } else {
      this.suggestionsCache.clear();
      this.inFlightSuggestions.clear();
    }
  }

  async getJournalSuggestions(workplaceId: WorkplaceId): Promise<JournalAutofillSuggestion[]> {
    if (!workplaceId) return [];
    if (this.suggestionsCache.has(workplaceId)) {
      return this.suggestionsCache.get(workplaceId)!;
    }
    if (this.inFlightSuggestions.has(workplaceId)) {
      return this.inFlightSuggestions.get(workplaceId)!;
    }

    const fetchPromise = journalEnrichmentQueries
      .getRecentUniqueDescriptions(workplaceId)
      .then(suggestions => {
        this.suggestionsCache.set(workplaceId, suggestions);
        this.inFlightSuggestions.delete(workplaceId);
        return suggestions;
      })
      .catch(err => {
        this.inFlightSuggestions.delete(workplaceId);
        throw err;
      });

    this.inFlightSuggestions.set(workplaceId, fetchPromise);
    return fetchPromise;
  }
}

export const journalService = new JournalService();
