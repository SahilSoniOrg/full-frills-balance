import Journal from '@/src/data/models/Journal';
import { CreateJournalData } from '@/src/data/repositories/journal/journalWriteModule';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/domain';
import { Model } from '@nozbe/watermelondb';
import { BatchWriteOptions, ledgerCreateService } from './ledgerCreateService';
import { ledgerLifecycleService } from './ledgerLifecycleService';
import { ledgerUpdateService } from './ledgerUpdateService';
import { PreparedJournalData } from './prepareJournalData';

/**
 * Canonical journal write Module: prepare + audit + persist + rebuild enqueue.
 * Delegating coordinator maintaining complete backward compatibility.
 */
export class LedgerWriteService {
  prepareCreateJournal(
    data: CreateJournalData,
    workplaceId: WorkplaceId,
  ): Promise<{
    journal: Journal;
    ops: Model[];
    accountsToRebuild: Set<AccountId>;
  }> {
    return ledgerCreateService.prepareCreateJournal(data, workplaceId);
  }

  prepareCreateJournalFromPreparedData(
    data: CreateJournalData,
    prepared: PreparedJournalData,
    workplaceId: WorkplaceId,
  ): {
    journal: Journal;
    ops: Model[];
    accountsToRebuild: Set<AccountId>;
  } {
    return ledgerCreateService.prepareCreateJournalFromPreparedData(data, prepared, workplaceId);
  }

  createJournal(
    data: CreateJournalData,
    workplaceId: WorkplaceId,
    options?: BatchWriteOptions<Journal>,
  ): Promise<Journal> {
    return ledgerCreateService.createJournal(data, workplaceId, options);
  }

  createMany(
    items: { data: CreateJournalData; prepared: PreparedJournalData }[],
    workplaceId: WorkplaceId,
  ): Promise<Journal[]> {
    return ledgerCreateService.createMany(items, workplaceId);
  }

  createReversalJournal(
    originalJournalId: JournalId,
    reason: string,
    workplaceId: WorkplaceId,
  ): Promise<Journal> {
    return ledgerCreateService.createReversalJournal(originalJournalId, reason, workplaceId);
  }

  updateJournal(
    journalId: JournalId,
    data: CreateJournalData,
    workplaceId: WorkplaceId,
  ): Promise<Journal> {
    return ledgerUpdateService.updateJournal(journalId, data, workplaceId);
  }

  deleteJournal(journalId: JournalId, workplaceId: WorkplaceId): Promise<void> {
    return ledgerLifecycleService.deleteJournal(journalId, workplaceId);
  }

  recoverJournal(journalId: JournalId, workplaceId: WorkplaceId): Promise<Journal> {
    return ledgerLifecycleService.recoverJournal(journalId, workplaceId);
  }

  postJournal(
    journalId: JournalId,
    workplaceId: WorkplaceId,
    options?: BatchWriteOptions<Journal> | Model[],
  ): Promise<Journal> {
    return ledgerLifecycleService.postJournal(journalId, workplaceId, options);
  }

  revertToPlanned(journalId: JournalId, workplaceId: WorkplaceId): Promise<Journal> {
    return ledgerLifecycleService.revertToPlanned(journalId, workplaceId);
  }
}

export const ledgerWriteService = new LedgerWriteService();
