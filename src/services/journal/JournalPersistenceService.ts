import Journal from '@/src/data/models/Journal';
import { runAccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import { transactionInboxRepository } from '@/src/data/repositories/TransactionInboxRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { journalPersistenceRepository } from '@/src/data/repositories/journal/JournalPersistenceRepository';
import type {
  JournalPersistenceResult,
  JournalRebuildImpact,
  MergeJournalsInput,
  PutJournalInput,
  PutJournalPatchInput,
  ReassignJournalAccountsInput,
} from '@/src/data/repositories/journal/JournalPersistenceRepository';
import type { AccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { InboxProcessingStatus } from '@/src/types/enums';
import type { BulkDeleteUndoToken } from '@/src/types/domainJournal';
import { JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import { isRebuildEligibleJournalStatus } from '@/src/utils/journalStatus';

/** Display type is always derived by the repository from the lines it persists. */
export type JournalPersistenceServiceInput =
  Omit<PutJournalInput, 'displayType'> | Omit<PutJournalPatchInput, 'displayType'>;

/** Application orchestration for the new journal persistence boundary. */
export class JournalPersistenceService {
  async put(input: JournalPersistenceServiceInput, workplaceId: WorkplaceId): Promise<Journal> {
    const result = await journalPersistenceRepository.put(input, workplaceId);
    this.enqueueRebuilds([result], workplaceId);
    return result.journal;
  }

  /** Creates a journal and links its source inbox record in the same database write. */
  async putAndLinkInboxRecord(
    input: JournalPersistenceServiceInput,
    workplaceId: WorkplaceId,
    inboxRecordId: string,
  ): Promise<Journal> {
    const result = await runAccountingWriteSession(async session => {
      const journalResult = await journalPersistenceRepository.putInSession(
        session,
        input,
        workplaceId,
      );
      await transactionInboxRepository.stageLinkByIdInSession(
        session,
        workplaceId,
        inboxRecordId,
        journalResult.journal.id,
        InboxProcessingStatus.IMPORTED,
      );
      return journalResult;
    });
    this.enqueueRebuilds([result], workplaceId);
    return result.journal;
  }

  /**
   * Stages a journal write in a caller-owned accounting session. Pair with
   * `afterAtomicWriteCommit` once the session commits.
   */
  putInSession(
    session: AccountingWriteSession,
    input: JournalPersistenceServiceInput,
    workplaceId: WorkplaceId,
  ): Promise<JournalPersistenceResult> {
    return journalPersistenceRepository.putInSession(session, input, workplaceId);
  }

  async putMany(
    inputs: readonly JournalPersistenceServiceInput[],
    workplaceId: WorkplaceId,
  ): Promise<Journal[]> {
    const results = await journalPersistenceRepository.putMany(inputs, workplaceId);
    this.enqueueRebuilds(results, workplaceId);
    return results.map(result => result.journal);
  }

  async post(journalId: JournalId, workplaceId: WorkplaceId): Promise<Journal> {
    const result = await journalPersistenceRepository.post(journalId, workplaceId);
    this.enqueueRebuilds([result], workplaceId);
    return result.journal;
  }

  async delete(journalId: JournalId, workplaceId: WorkplaceId): Promise<void> {
    const impact = await journalPersistenceRepository.delete(journalId, workplaceId);
    this.enqueueImpacts([impact], workplaceId);
  }

  async bulkDelete(
    workplaceId: WorkplaceId,
    journalIds: readonly JournalId[],
  ): Promise<BulkDeleteUndoToken> {
    const result = await journalPersistenceRepository.bulkDelete(workplaceId, journalIds);
    this.enqueueImpacts([result], workplaceId);
    return result.undoToken;
  }

  async deletePlannedPayment(
    workplaceId: WorkplaceId,
    plannedPaymentId: PlannedPaymentId,
  ): Promise<void> {
    await runAccountingWriteSession(async session => {
      await plannedPaymentRepository.deleteInSession(session, workplaceId, plannedPaymentId);
      await journalPersistenceRepository.deleteUnpostedByPlannedPaymentInSession(
        session,
        workplaceId,
        plannedPaymentId,
      );
    });
  }

  async merge(input: MergeJournalsInput, workplaceId: WorkplaceId): Promise<Journal> {
    const result = await journalPersistenceRepository.merge(input, workplaceId);
    this.enqueueRebuilds([result], workplaceId);
    return result.journal;
  }

  async reassignAccounts(
    input: ReassignJournalAccountsInput,
    workplaceId: WorkplaceId,
  ): Promise<void> {
    const impact = await journalPersistenceRepository.reassignAccounts(input, workplaceId);
    this.enqueueImpacts([impact], workplaceId);
  }

  async recover(journalId: JournalId, workplaceId: WorkplaceId): Promise<Journal> {
    const result = await journalPersistenceRepository.recover(journalId, workplaceId);
    this.enqueueImpacts([result], workplaceId);
    return result.journal;
  }

  async bulkRestore(workplaceId: WorkplaceId, token: BulkDeleteUndoToken): Promise<void> {
    const impact = await journalPersistenceRepository.bulkRestore(workplaceId, token);
    this.enqueueImpacts([impact], workplaceId);
  }

  async revertToPlanned(journalId: JournalId, workplaceId: WorkplaceId): Promise<Journal> {
    const result = await journalPersistenceRepository.revertToPlanned(journalId, workplaceId);
    this.enqueueRebuilds([result], workplaceId);
    return result.journal;
  }

  postInSession(
    session: AccountingWriteSession,
    journalId: JournalId,
    workplaceId: WorkplaceId,
    postedAt = Date.now(),
  ): Promise<JournalPersistenceResult> {
    return journalPersistenceRepository.postInSession(session, journalId, workplaceId, postedAt);
  }

  /** Enqueue derived-balance rebuilds only after the enclosing session has committed. */
  afterAtomicWriteCommit(
    results: readonly JournalPersistenceResult[],
    workplaceId: WorkplaceId,
  ): void {
    this.enqueueRebuilds(results, workplaceId);
  }

  async reverse(
    originalJournalId: JournalId,
    reason: string,
    workplaceId: WorkplaceId,
  ): Promise<Journal> {
    const result = await journalPersistenceRepository.reverse(
      originalJournalId,
      reason,
      workplaceId,
    );
    this.enqueueRebuilds([result], workplaceId);
    return result.journal;
  }

  /** Enqueues only results whose journal was or became balance-affecting. */
  private enqueueRebuilds(
    results: readonly JournalPersistenceResult[],
    workplaceId: WorkplaceId,
  ): void {
    this.enqueueImpacts(
      results.filter(
        result =>
          (result.previousStatus !== undefined &&
            isRebuildEligibleJournalStatus(result.previousStatus)) ||
          isRebuildEligibleJournalStatus(result.status),
      ),
      workplaceId,
    );
  }

  private enqueueImpacts(impacts: readonly JournalRebuildImpact[], workplaceId: WorkplaceId): void {
    const affectedAccountIds = new Set(impacts.flatMap(impact => [...impact.affectedAccountIds]));
    if (affectedAccountIds.size === 0) return;

    const rebuildFromDate = Math.min(...impacts.map(impact => impact.rebuildFromDate));
    rebuildQueueService.enqueueMany(affectedAccountIds, rebuildFromDate, workplaceId);
  }
}

export const journalPersistenceService = new JournalPersistenceService();
