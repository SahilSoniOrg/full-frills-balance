import {
  runAccountingWriteSession,
  type AccountingWriteSession,
} from '@/src/data/repositories/AccountingWriteSession';
import {
  stageMerge,
  stageReassignAccounts,
  stageRetargetAccountsForMerge,
} from '@/src/data/repositories/journal/journalCrossJournalOperations';
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
import { AccountId, JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import type { BulkDeleteUndoToken } from '@/src/types/domainJournal';

export type {
  JournalPersistenceLine,
  JournalPersistenceMetadata,
  JournalPersistenceResult,
  JournalRebuildImpact,
  MergeJournalsInput,
  PutJournalInput,
  PutJournalPatchInput,
  PutJournalRequest,
  ReassignJournalAccountsInput,
  ReverseJournalOptions,
} from '@/src/data/repositories/journal/journalPersistenceTypes';
export type { BulkDeleteResult };

/**
 * Persistence boundary for journal create/update/post and lifecycle commands.
 * Every balance decision is made from current persisted account currency and journal status
 * inside the same WatermelonDB writer transaction as the mutation.
 */
export class JournalPersistenceRepository {
  async put(input: PutJournalRequest, workplaceId: WorkplaceId): Promise<JournalPersistenceResult> {
    return runAccountingWriteSession(session => this.putInSession(session, input, workplaceId));
  }

  /** Stage a plain journal write in a caller-owned accounting write session. */
  async putInSession(
    session: AccountingWriteSession,
    input: PutJournalRequest,
    workplaceId: WorkplaceId,
  ): Promise<JournalPersistenceResult> {
    return stagePut(session, input, workplaceId);
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
      for (const input of inputs) results.push(await stagePut(session, input, workplaceId));
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
  ): Promise<JournalPersistenceResult> {
    return runAccountingWriteSession(session =>
      this.postInSession(session, journalId, workplaceId, postedAt),
    );
  }

  async postInSession(
    session: AccountingWriteSession,
    journalId: JournalId,
    workplaceId: WorkplaceId,
    postedAt = Date.now(),
  ): Promise<JournalPersistenceResult> {
    return stagePost(session, journalId, workplaceId, postedAt);
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
    return stageReverse(session, originalJournalId, reason, workplaceId, options);
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
    return runAccountingWriteSession(session => stageMerge(session, input, workplaceId));
  }

  /** Reassigns transaction accounts after reloading and validating affected journals in-session. */
  async reassignAccounts(
    input: ReassignJournalAccountsInput,
    workplaceId: WorkplaceId,
  ): Promise<JournalRebuildImpact> {
    if (input.accountIdByTransactionId.size === 0) return emptyRebuildImpact();
    return runAccountingWriteSession(session => stageReassignAccounts(session, input, workplaceId));
  }

  async retargetAccountsForMergeInSession(
    session: AccountingWriteSession,
    workplaceId: WorkplaceId,
    sourceAccountIds: readonly AccountId[],
    targetAccountId: AccountId,
  ): Promise<void> {
    return stageRetargetAccountsForMerge(session, workplaceId, sourceAccountIds, targetAccountId);
  }

  /** Soft-deletes a journal and its currently active lines as one repository command. */
  async delete(journalId: JournalId, workplaceId: WorkplaceId): Promise<JournalRebuildImpact> {
    return runAccountingWriteSession(session => stageDelete(session, journalId, workplaceId));
  }

  /** Bulk soft-delete plus a token that can restore exactly this operation. */
  async bulkDelete(
    workplaceId: WorkplaceId,
    journalIds: readonly JournalId[],
  ): Promise<BulkDeleteResult> {
    if (journalIds.length === 0) {
      return { ...emptyRebuildImpact(), undoToken: { journals: [], transactions: [] } };
    }
    return runAccountingWriteSession(session => stageBulkDelete(session, workplaceId, journalIds));
  }

  /** Stages the unposted journal cascade for a planned-payment deletion. */
  async deleteUnpostedByPlannedPaymentInSession(
    session: AccountingWriteSession,
    workplaceId: WorkplaceId,
    plannedPaymentId: PlannedPaymentId,
  ): Promise<void> {
    return stageDeleteUnpostedByPlannedPayment(session, workplaceId, plannedPaymentId);
  }

  /** Restores a deleted journal only when its posted entries still satisfy current rules. */
  async recover(journalId: JournalId, workplaceId: WorkplaceId): Promise<JournalPersistenceResult> {
    return runAccountingWriteSession(session => stageRecover(session, journalId, workplaceId));
  }

  /** Restores exactly one bulk-delete operation after validating each resulting journal. */
  async bulkRestore(
    workplaceId: WorkplaceId,
    token: BulkDeleteUndoToken,
  ): Promise<JournalRebuildImpact> {
    if (token.journals.length === 0 && token.transactions.length === 0) {
      return emptyRebuildImpact();
    }
    return runAccountingWriteSession(session => stageBulkRestore(session, workplaceId, token));
  }

  /** Reverts a posted or skipped journal to its planned state atomically. */
  async revertToPlanned(
    journalId: JournalId,
    workplaceId: WorkplaceId,
  ): Promise<JournalPersistenceResult> {
    return runAccountingWriteSession(session =>
      stageRevertToPlanned(session, journalId, workplaceId),
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
  ): Promise<void> {
    return stageNonPostedStatuses(session, workplaceId, updates);
  }
}

export const journalPersistenceRepository = new JournalPersistenceRepository();
