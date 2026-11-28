import Journal from '@/src/data/models/Journal';
import type { InboxRecordSnapshot } from '@/src/types/smsInbox';
import { JournalEntryLine } from '@/src/types/domainJournal';
import { JournalId, WorkplaceId } from '@/src/types/ids';
import type { JournalSuggestion, JournalSuggestionPage } from '@/src/types/journalSuggestions';
import type { TabType } from '@/src/types/domainJournal';
import type { PostingPlan } from '@/src/types/domainTransaction';
import type { AuditEventMetadata } from '@/src/types/auditEvents';
import type { CreateJournalData, JournalRepaymentAllocation } from '@/src/types/journalWrite';
import type { PlannedPaymentFxReview } from '@/src/services/planned-payment/plannedPaymentFx';

import { type PlannedJournalMode, type SubmitJournalResult } from './domain/journalDomainTypes';
import {
  clearSuggestionsCache,
  createJournalSuggestionsState,
  getJournalSuggestions,
} from './domain/journalDomainSuggestions';
import * as lifecycle from './domain/journalDomainLifecycle';
import * as save from './domain/journalDomainSave';

export type { SubmitJournalResult, PlannedJournalMode } from './domain/journalDomainTypes';

/** Thin façade: public import path stays `@/src/services/journal/journalDomainService`. */
export class JournalService {
  private readonly suggestions = createJournalSuggestionsState();

  clearSuggestionsCache(workplaceId?: WorkplaceId): void {
    clearSuggestionsCache(this.suggestions, workplaceId);
  }

  async getJournalSuggestions(params: {
    workplaceId: WorkplaceId;
    query: string;
    page: JournalSuggestionPage;
    transactionType?: TabType;
    limit?: number;
  }): Promise<JournalSuggestion[]> {
    return getJournalSuggestions(this.suggestions, params);
  }

  async postPostingPlan(params: {
    plan: PostingPlan;
    journalId?: JournalId;
    newJournalCurrencyCode?: string;
    smsId?: string;
    smsRecordId?: string;
    mode?: 'simple' | 'advanced' | 'import';
    launchSource?: string;
    planned?: PlannedJournalMode;
    repaymentAllocation?: JournalRepaymentAllocation;
    workplaceId: WorkplaceId;
  }): Promise<SubmitJournalResult> {
    return save.postPostingPlan(this, params);
  }

  async createJournal(
    data: CreateJournalData,
    workplaceId: WorkplaceId,
    smsRecord?: InboxRecordSnapshot | null,
  ): Promise<Journal> {
    return lifecycle.createJournal(this, data, workplaceId, smsRecord);
  }

  async updateJournal(
    journalId: JournalId,
    data: CreateJournalData,
    workplaceId: WorkplaceId,
    auditMetadata?: AuditEventMetadata,
    expectedCurrent?: Record<string, unknown>,
  ): Promise<Journal> {
    return lifecycle.updateJournal(
      this,
      journalId,
      data,
      workplaceId,
      auditMetadata,
      expectedCurrent,
    );
  }

  async deleteJournal(
    journalId: JournalId,
    workplaceId: WorkplaceId,
    auditMetadata?: AuditEventMetadata,
    expectedCurrent?: Record<string, unknown>,
  ): Promise<void> {
    return lifecycle.deleteJournal(this, journalId, workplaceId, auditMetadata, expectedCurrent);
  }

  async recoverJournal(
    journalId: JournalId,
    workplaceId: WorkplaceId,
    auditMetadata?: AuditEventMetadata,
    expectedCurrent?: Record<string, unknown>,
  ): Promise<Journal> {
    return lifecycle.recoverJournal(this, journalId, workplaceId, auditMetadata, expectedCurrent);
  }

  async postJournal(
    journalId: JournalId,
    workplaceId: WorkplaceId,
    postedAt?: number,
    auditMetadata?: AuditEventMetadata,
    expectedCurrent?: Record<string, unknown>,
    review?: PlannedPaymentFxReview,
  ): Promise<Journal> {
    return lifecycle.postJournal(
      journalId,
      workplaceId,
      postedAt,
      auditMetadata,
      expectedCurrent,
      review,
    );
  }

  async revertToPlanned(
    journalId: JournalId,
    workplaceId: WorkplaceId,
    auditMetadata?: AuditEventMetadata,
    expectedCurrent?: Record<string, unknown>,
  ): Promise<Journal> {
    return lifecycle.revertToPlanned(journalId, workplaceId, auditMetadata, expectedCurrent);
  }

  async duplicateJournal(journalId: JournalId, workplaceId: WorkplaceId): Promise<Journal> {
    return lifecycle.duplicateJournal(this, journalId, workplaceId);
  }

  async createReversalJournal(
    originalJournalId: JournalId,
    reason: string = 'Reversal',
    workplaceId: WorkplaceId,
  ): Promise<Journal> {
    return lifecycle.createReversalJournal(originalJournalId, reason, workplaceId);
  }

  async saveJournalEntry(params: {
    lines: JournalEntryLine[];
    description: string;
    notes?: string;
    journalDate: string | number;
    journalTime?: string;
    journalId?: JournalId;
    newJournalCurrencyCode?: string;
    smsId?: string;
    smsRecordId?: string;
    mode?: 'simple' | 'advanced' | 'import';
    launchSource?: string;
    planned?: PlannedJournalMode;
    repaymentAllocation?: JournalRepaymentAllocation;
    workplaceId: WorkplaceId;
  }): Promise<SubmitJournalResult> {
    return save.saveJournalEntry(this, params);
  }

  async saveBulkJournalEntries(
    entries: {
      lines: JournalEntryLine[];
      description: string;
      notes?: string;
      journalDate: number;
      planned?: PlannedJournalMode;
      workplaceId: WorkplaceId;
    }[],
  ): Promise<{
    success: boolean;
    error?: string;
    summaries: { description: string; amount: number; currency: string }[];
  }> {
    return save.saveBulkJournalEntries(this, entries);
  }
}

export const journalService = new JournalService();
