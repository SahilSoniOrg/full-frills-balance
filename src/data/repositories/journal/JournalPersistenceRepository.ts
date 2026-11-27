import {
  runAccountingWriteSession,
  stageBalanceRebuildIntents,
  type AccountingWriteSession,
} from '@/src/data/repositories/AccountingWriteSession';
import {
  stageMerge,
  stageReassignAccounts,
  stageRetargetAccountsForMerge,
} from '@/src/data/repositories/journal/journalCrossJournalOperations';
import {
  stagePlanAttach,
  stageUndoPlanAttach,
  type PlanAttachInput,
  type PlanAttachResult,
} from '@/src/data/repositories/journal/journalPlanAttachOperations';
import {
  stageBulkDelete,
  stageBulkRestore,
  stageDelete,
  stageDeleteUnpostedByPlannedPayment,
  stageNonPostedStatuses,
  stageRecover,
  stageRevertToPlanned,
  type BulkDeleteResult,
} from '@/src/data/repositories/journal/journalLifecycleOperations';
import { emptyRebuildImpact } from '@/src/data/repositories/journal/journalPersistenceSupport';
import type {
  JournalPersistenceResult,
  JournalRebuildImpact,
  MergeJournalsInput,
  PutJournalRequest,
  ReassignJournalAccountsInput,
  ReverseJournalOptions,
} from '@/src/data/repositories/journal/journalPersistenceTypes';
import {
  stagePost,
  stagePut,
  stageRename,
  stageReverse,
} from '@/src/data/repositories/journal/journalPutOperations';
import { JournalStatus } from '@/src/types/enums';
import { isRebuildEligibleJournalStatus } from '@/src/domain/journal/journalStatus';
import { AccountId, JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import type { BulkDeleteUndoToken } from '@/src/types/domainJournal';
import type { AuditEventMetadata, AuditJsonObject } from '@/src/types/auditEvents';

export type { BulkDeleteResult, PlanAttachInput, PlanAttachResult };

function stageImpact<T extends JournalRebuildImpact>(
  session: AccountingWriteSession,
  workplaceId: WorkplaceId,
  result: T,
): T {
  if (Number.isFinite(result.rebuildFromDate) && result.affectedAccountIds.size > 0)
    stageBalanceRebuildIntents(
      session,
      workplaceId,
      result.affectedAccountIds,
      result.rebuildFromDate,
    );
  return result;
}

function stageJournalImpact<T extends JournalPersistenceResult>(
  session: AccountingWriteSession,
  workplaceId: WorkplaceId,
  result: T,
): T {
  if (
    isRebuildEligibleJournalStatus(result.status) ||
    (result.previousStatus !== undefined && isRebuildEligibleJournalStatus(result.previousStatus))
  )
    return stageImpact(session, workplaceId, result);
  return result;
}

/**
 * Persistence boundary for journal create/update/post and lifecycle commands.
 * Every balance decision is made from current persisted account currency and journal status
 * inside the same WatermelonDB writer transaction as the mutation.
 */
export class JournalPersistenceRepository {
  async put(
    input: PutJournalRequest,
    workplaceId: WorkplaceId,
    auditMetadata?: AuditEventMetadata,
    expectedCurrent?: Record<string, unknown>,
  ): Promise<JournalPersistenceResult> {
    return runAccountingWriteSession(session =>
      this.putInSession(session, input, workplaceId, auditMetadata, expectedCurrent),
    );
  }

  /** Stage a plain journal write in a caller-owned accounting write session. */
  async putInSession(
    session: AccountingWriteSession,
    input: PutJournalRequest,
    workplaceId: WorkplaceId,
    auditMetadata?: AuditEventMetadata,
    expectedCurrent?: Record<string, unknown>,
  ): Promise<JournalPersistenceResult> {
    return stageJournalImpact(
      session,
      workplaceId,
      await stagePut(session, input, workplaceId, auditMetadata, expectedCurrent),
    );
  }

  async putMany(
    inputs: readonly PutJournalRequest[],
    workplaceId: WorkplaceId,
  ): Promise<JournalPersistenceResult[]> {
    if (inputs.length === 0) return [];
    const journalIds = inputs.flatMap(input => (input.journalId ? [input.journalId] : []));
    if (new Set(journalIds).size !== journalIds.length) {
      throw new Error('A journal can only appear once in a putMany batch');
    }

    return runAccountingWriteSession(async session => {
      const results: JournalPersistenceResult[] = [];
      for (const input of inputs)
        results.push(await this.putInSession(session, input, workplaceId));
      return results;
    });
  }

  /** Stages description-only renames; returns the previous description of each renamed journal. */
  async renameInSession(
    session: AccountingWriteSession,
    workplaceId: WorkplaceId,
    renames: Readonly<Record<JournalId, string>>,
  ): Promise<Record<JournalId, string>> {
    return stageRename(session, workplaceId, renames);
  }

  async post(
    journalId: JournalId,
    workplaceId: WorkplaceId,
    postedAt = Date.now(),
    auditMetadata?: AuditEventMetadata,
    expectedCurrent?: Record<string, unknown>,
  ): Promise<JournalPersistenceResult> {
    return runAccountingWriteSession(session =>
      this.postInSession(session, journalId, workplaceId, postedAt, auditMetadata, expectedCurrent),
    );
  }

  async postInSession(
    session: AccountingWriteSession,
    journalId: JournalId,
    workplaceId: WorkplaceId,
    postedAt = Date.now(),
    auditMetadata?: AuditEventMetadata,
    expectedCurrent?: Record<string, unknown>,
  ): Promise<JournalPersistenceResult> {
    return stageJournalImpact(
      session,
      workplaceId,
      await stagePost(session, journalId, workplaceId, postedAt, auditMetadata, expectedCurrent),
    );
  }

  async reverse(
    originalJournalId: JournalId,
    reason: string,
    workplaceId: WorkplaceId,
    reversedAt = Date.now(),
  ): Promise<JournalPersistenceResult> {
    return runAccountingWriteSession(session =>
      this.reverseInSession(session, originalJournalId, reason, workplaceId, { reversedAt }),
    );
  }

  /** Stages a reversing journal and marks the original reversed in the caller's session. */
  async reverseInSession(
    session: AccountingWriteSession,
    originalJournalId: JournalId,
    reason: string,
    workplaceId: WorkplaceId,
    options?: ReverseJournalOptions,
  ): Promise<JournalPersistenceResult> {
    return stageJournalImpact(
      session,
      workplaceId,
      await stageReverse(session, originalJournalId, reason, workplaceId, options),
    );
  }

  /**
   * Rebuilds a merged posted journal from current source rows and commits it with
   * source soft-deletes and metadata/inbox retargeting in one database batch.
   */
  async merge(
    input: MergeJournalsInput,
    workplaceId: WorkplaceId,
  ): Promise<JournalPersistenceResult> {
    const distinctCount = new Set(input.sourceJournalIds).size;
    if (distinctCount < 2 || distinctCount !== input.sourceJournalIds.length) {
      throw new Error('Select at least 2 distinct journals to merge');
    }
    return runAccountingWriteSession(async session =>
      stageJournalImpact(session, workplaceId, await stageMerge(session, input, workplaceId)),
    );
  }

  /** Reassigns transaction accounts after reloading and validating affected journals in-session. */
  async reassignAccounts(
    input: ReassignJournalAccountsInput,
    workplaceId: WorkplaceId,
  ): Promise<JournalRebuildImpact> {
    if (input.accountIdByTransactionId.size === 0) return emptyRebuildImpact();
    return runAccountingWriteSession(async session =>
      stageImpact(session, workplaceId, await stageReassignAccounts(session, input, workplaceId)),
    );
  }

  async retargetAccountsForMergeInSession(
    session: AccountingWriteSession,
    workplaceId: WorkplaceId,
    sourceAccountIds: readonly AccountId[],
    targetAccountId: AccountId,
    correlationId?: string,
  ): Promise<void> {
    await stageRetargetAccountsForMerge(
      session,
      workplaceId,
      sourceAccountIds,
      targetAccountId,
      correlationId,
    );
    stageBalanceRebuildIntents(session, workplaceId, [...sourceAccountIds, targetAccountId], 0);
  }

  /** Soft-deletes a journal and its currently active lines as one repository command. */
  async delete(
    journalId: JournalId,
    workplaceId: WorkplaceId,
    auditMetadata?: AuditEventMetadata,
    expectedCurrent?: Record<string, unknown>,
  ): Promise<JournalRebuildImpact> {
    return runAccountingWriteSession(async session =>
      stageImpact(
        session,
        workplaceId,
        await stageDelete(session, journalId, workplaceId, auditMetadata, expectedCurrent),
      ),
    );
  }

  /** Bulk soft-delete plus a token that can restore exactly this operation. */
  async bulkDelete(
    workplaceId: WorkplaceId,
    journalIds: readonly JournalId[],
  ): Promise<BulkDeleteResult> {
    if (journalIds.length === 0) {
      return { ...emptyRebuildImpact(), undoToken: { journals: [], transactions: [] } };
    }
    return runAccountingWriteSession(async session =>
      stageImpact(session, workplaceId, await stageBulkDelete(session, workplaceId, journalIds)),
    );
  }

  /** Stages the unposted cascade, or only upcoming scheduled entries during a schedule edit. */
  async deleteUnpostedByPlannedPaymentInSession(
    session: AccountingWriteSession,
    workplaceId: WorkplaceId,
    plannedPaymentId: PlannedPaymentId,
    scheduledFrom?: number,
  ): Promise<void> {
    return stageDeleteUnpostedByPlannedPayment(
      session,
      workplaceId,
      plannedPaymentId,
      scheduledFrom,
    );
  }

  /** Restores a deleted journal only when its posted entries still satisfy current rules. */
  async recover(
    journalId: JournalId,
    workplaceId: WorkplaceId,
    auditMetadata?: AuditEventMetadata,
    expectedCurrent?: Record<string, unknown>,
  ): Promise<JournalPersistenceResult> {
    return runAccountingWriteSession(async session =>
      stageJournalImpact(
        session,
        workplaceId,
        await stageRecover(session, journalId, workplaceId, auditMetadata, expectedCurrent),
      ),
    );
  }

  /** Restores exactly one bulk-delete operation after validating each resulting journal. */
  async bulkRestore(
    workplaceId: WorkplaceId,
    token: BulkDeleteUndoToken,
  ): Promise<JournalRebuildImpact> {
    if (token.journals.length === 0 && token.transactions.length === 0) {
      return emptyRebuildImpact();
    }
    return runAccountingWriteSession(async session =>
      stageImpact(session, workplaceId, await stageBulkRestore(session, workplaceId, token)),
    );
  }

  /** Reverts a posted or skipped journal to its planned state atomically. */
  async revertToPlanned(
    journalId: JournalId,
    workplaceId: WorkplaceId,
    auditMetadata?: AuditEventMetadata,
    expectedCurrent?: Record<string, unknown>,
  ): Promise<JournalPersistenceResult> {
    return runAccountingWriteSession(async session =>
      stageJournalImpact(
        session,
        workplaceId,
        await stageRevertToPlanned(session, journalId, workplaceId, auditMetadata, expectedCurrent),
      ),
    );
  }

  async setNonPostedStatusesInSession(
    session: AccountingWriteSession,
    workplaceId: WorkplaceId,
    updates: readonly {
      journalId: JournalId;
      status: JournalStatus;
      expectedStatus?: JournalStatus;
    }[],
    auditMetadata?: AuditEventMetadata,
  ): Promise<void> {
    return stageNonPostedStatuses(session, workplaceId, updates, auditMetadata);
  }

  /** Capture journal becomes the occurrence journal; retires the PLANNED twin. */
  async attachToPlannedOccurrenceInSession(
    session: AccountingWriteSession,
    workplaceId: WorkplaceId,
    input: PlanAttachInput,
    auditMetadata?: AuditEventMetadata,
  ): Promise<PlanAttachResult> {
    return stageJournalImpact(
      session,
      workplaceId,
      await stagePlanAttach(session, workplaceId, input, auditMetadata),
    );
  }

  async undoPlanAttachInSession(
    session: AccountingWriteSession,
    workplaceId: WorkplaceId,
    captureJournalId: JournalId,
    changes: { before?: AuditJsonObject; after?: AuditJsonObject; details?: AuditJsonObject },
    auditMetadata?: AuditEventMetadata,
  ): Promise<JournalPersistenceResult> {
    return stageJournalImpact(
      session,
      workplaceId,
      await stageUndoPlanAttach(session, workplaceId, captureJournalId, changes, auditMetadata),
    );
  }
}

export const journalPersistenceRepository = new JournalPersistenceRepository();
