import Journal from '@/src/data/models/Journal';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import {
  readPlannedPaymentFxContext,
  type PlannedPaymentFxReview,
} from '@/src/services/planned-payment/plannedPaymentFx';
import { postPlannedJournalOccurrence } from '@/src/services/planned-payment/plannedPaymentOrchestration';
import type { InboxRecordSnapshot } from '@/src/types/smsInbox';
import { TransactionType } from '@/src/types/enums';
import { JournalId, WorkplaceId } from '@/src/types/ids';
import type { AuditEventMetadata } from '@/src/types/auditEvents';
import type { CreateJournalData } from '@/src/types/journalWrite';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalQueryRepository';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { analytics } from '@/src/services/analytics';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';

export type JournalLifecycleHost = {
  clearSuggestionsCache: (workplaceId?: WorkplaceId) => void;
  createJournal: (
    data: CreateJournalData,
    workplaceId: WorkplaceId,
    smsRecord?: InboxRecordSnapshot | null,
  ) => Promise<Journal>;
};

export async function createJournal(
  host: JournalLifecycleHost,
  data: CreateJournalData,
  workplaceId: WorkplaceId,
  smsRecord?: InboxRecordSnapshot | null,
): Promise<Journal> {
  host.clearSuggestionsCache(workplaceId);
  if (!smsRecord) {
    return journalPersistenceService.put(data, workplaceId);
  }
  return journalPersistenceService.putAndLinkInboxRecord(data, workplaceId, smsRecord.id);
}

export async function updateJournal(
  host: JournalLifecycleHost,
  journalId: JournalId,
  data: CreateJournalData,
  workplaceId: WorkplaceId,
  auditMetadata?: AuditEventMetadata,
  expectedCurrent?: Record<string, unknown>,
): Promise<Journal> {
  host.clearSuggestionsCache(workplaceId);
  return journalPersistenceService.put(
    { ...data, journalId },
    workplaceId,
    auditMetadata,
    expectedCurrent,
  );
}

export async function deleteJournal(
  host: JournalLifecycleHost,
  journalId: JournalId,
  workplaceId: WorkplaceId,
  auditMetadata?: AuditEventMetadata,
  expectedCurrent?: Record<string, unknown>,
): Promise<void> {
  host.clearSuggestionsCache(workplaceId);
  await journalPersistenceService.delete(journalId, workplaceId, auditMetadata, expectedCurrent);
  analytics.trackFeatureUsage('journal', 'delete', {
    journal_id: journalId,
  });
}

export async function recoverJournal(
  host: JournalLifecycleHost,
  journalId: JournalId,
  workplaceId: WorkplaceId,
  auditMetadata?: AuditEventMetadata,
  expectedCurrent?: Record<string, unknown>,
): Promise<Journal> {
  host.clearSuggestionsCache(workplaceId);
  const journal = await journalPersistenceService.recover(
    journalId,
    workplaceId,
    auditMetadata,
    expectedCurrent,
  );
  analytics.trackFeatureUsage('journal', 'recover', {
    journal_id: journalId,
    currency: journal.currencyCode,
  });
  return journal;
}

export async function postJournal(
  journalId: JournalId,
  workplaceId: WorkplaceId,
  postedAt?: number,
  auditMetadata?: AuditEventMetadata,
  expectedCurrent?: Record<string, unknown>,
  review?: PlannedPaymentFxReview,
): Promise<Journal> {
  const selected = await journalQueryRepository.find(workplaceId, journalId);
  if (selected?.plannedPaymentId) {
    const payment = await plannedPaymentRepository.find(workplaceId, selected.plannedPaymentId);
    if (!payment) throw new Error('Linked planned payment not found');
    const context = await readPlannedPaymentFxContext(payment, selected.journalDate, selected);
    if (context) {
      await postPlannedJournalOccurrence(
        workplaceId,
        payment.id,
        selected.id,
        selected.journalDate,
        review,
        { postedAt, auditMetadata, expectedCurrent },
      );
      analytics.trackFeatureUsage('journal', 'post', {
        journal_id: journalId,
        currency: selected.currencyCode,
      });
      return selected;
    }
  }
  const journal = await journalPersistenceService.post(
    journalId,
    workplaceId,
    postedAt,
    auditMetadata,
    expectedCurrent,
  );
  analytics.trackFeatureUsage('journal', 'post', {
    journal_id: journalId,
    currency: journal.currencyCode,
  });
  return journal;
}

export async function revertToPlanned(
  journalId: JournalId,
  workplaceId: WorkplaceId,
  auditMetadata?: AuditEventMetadata,
  expectedCurrent?: Record<string, unknown>,
): Promise<Journal> {
  const journal = await journalPersistenceService.revertToPlanned(
    journalId,
    workplaceId,
    auditMetadata,
    expectedCurrent,
  );
  analytics.trackFeatureUsage('journal', 'revert_to_planned', {
    journal_id: journalId,
    currency: journal.currencyCode,
  });
  return journal;
}

export async function duplicateJournal(
  host: JournalLifecycleHost,
  journalId: JournalId,
  workplaceId: WorkplaceId,
): Promise<Journal> {
  const journal = await journalQueryRepository.find(workplaceId, journalId);
  if (!journal) throw new Error('Journal not found');

  const transactions = await transactionQueryRepository.findByJournal(workplaceId, journalId);

  const duplicated = await host.createJournal(
    {
      journalDate: Date.now(),
      description: journal.description || undefined,
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
    count: transactions.length,
    currency: journal.currencyCode,
  });

  return duplicated;
}

export async function createReversalJournal(
  originalJournalId: JournalId,
  reason: string = 'Reversal',
  workplaceId: WorkplaceId,
): Promise<Journal> {
  const reversalJournal = await journalPersistenceService.reverse(
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
