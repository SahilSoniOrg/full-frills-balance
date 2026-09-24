import {
  stageModelWrite,
  type AccountingWriteSession,
} from '@/src/data/repositories/AccountingWriteSession';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import Journal from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';
import { MetadataKeys } from '@/src/constants/ledger-constants';
import {
  emptyRebuildImpact,
  fetchActiveJournals,
  fetchJournalTransactions,
  findActiveJournal,
  groupTransactionsByJournal,
  journalTables,
  localStartOfDay,
  nextDeletionTimestamp,
  prepareDeleteAudit,
  prepareDeletedAt,
  prepareRestoreAudit,
  rebuildImpactFor,
  toPersistenceLine,
  validateJournal,
} from '@/src/data/repositories/journal/journalPersistenceSupport';
import type {
  JournalPersistenceResult,
  JournalRebuildImpact,
} from '@/src/data/repositories/journal/journalPersistenceTypes';
import { AuditAction, JournalStatus } from '@/src/types/enums';
import { JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import type { BulkDeleteUndoToken } from '@/src/types/domainJournal';
import { safeParseJSON } from '@/src/utils/serialization';
import { Q } from '@nozbe/watermelondb';

export interface BulkDeleteResult extends JournalRebuildImpact {
  undoToken: BulkDeleteUndoToken;
}

const NON_POSTED_STATUSES: ReadonlySet<JournalStatus> = new Set([
  JournalStatus.PLANNED,
  JournalStatus.PAUSED,
  JournalStatus.SKIPPED,
]);

/** Soft-deletes journals and their active lines with one deletion timestamp and audit each. */
async function stageSoftDelete(
  session: AccountingWriteSession,
  workplaceId: WorkplaceId,
  journals: readonly Journal[],
): Promise<{ deletedAt: Date; transactions: Transaction[] }> {
  const allTransactions = await fetchJournalTransactions(
    workplaceId,
    journals.map(journal => journal.id),
    { includeDeleted: true },
  );
  const transactions = allTransactions.filter(transaction => !transaction.deletedAt);
  const transactionsByJournal = groupTransactionsByJournal(transactions);
  const deletedAt = nextDeletionTimestamp([...journals, ...allTransactions]);
  stageModelWrite(session, () => [
    ...journals.map(journal => prepareDeletedAt(journal, deletedAt, deletedAt)),
    ...transactions.map(transaction => prepareDeletedAt(transaction, deletedAt, deletedAt)),
    ...journals.map(journal =>
      prepareDeleteAudit(
        journal,
        transactionsByJournal.get(journal.id) ?? [],
        deletedAt,
        workplaceId,
      ),
    ),
  ]);
  return { deletedAt, transactions };
}

export async function stageDelete(
  session: AccountingWriteSession,
  journalId: JournalId,
  workplaceId: WorkplaceId,
): Promise<JournalRebuildImpact> {
  const journal = await findActiveJournal(journalId, workplaceId);
  if (!journal) return emptyRebuildImpact();
  const { transactions } = await stageSoftDelete(session, workplaceId, [journal]);
  return rebuildImpactFor([journal], transactions);
}

export async function stageBulkDelete(
  session: AccountingWriteSession,
  workplaceId: WorkplaceId,
  journalIds: readonly JournalId[],
): Promise<BulkDeleteResult> {
  const journals = await fetchActiveJournals(workplaceId, [...new Set(journalIds)]);
  if (journals.length === 0) {
    return { ...emptyRebuildImpact(), undoToken: { journals: [], transactions: [] } };
  }
  const { deletedAt, transactions } = await stageSoftDelete(session, workplaceId, journals);
  return {
    ...rebuildImpactFor(journals, transactions),
    undoToken: {
      journals: journals.map(journal => ({ id: journal.id, deletedAt: deletedAt.getTime() })),
      transactions: transactions.map(transaction => ({
        id: transaction.id,
        journalId: transaction.journalId,
        deletedAt: deletedAt.getTime(),
      })),
    },
  };
}

export async function stageDeleteUnpostedByPlannedPayment(
  session: AccountingWriteSession,
  workplaceId: WorkplaceId,
  plannedPaymentId: PlannedPaymentId,
): Promise<void> {
  const journals = await journalTables.journals
    .query(
      Q.where('planned_payment_id', plannedPaymentId),
      Q.where('workplace_id', workplaceId),
      Q.where('status', Q.oneOf([...NON_POSTED_STATUSES])),
      Q.where('deleted_at', Q.eq(null)),
    )
    .fetch();
  if (journals.length === 0) return;
  await stageSoftDelete(session, workplaceId, journals);
}

/** Restores a deleted journal only when its posted entries still satisfy current rules. */
export async function stageRecover(
  session: AccountingWriteSession,
  journalId: JournalId,
  workplaceId: WorkplaceId,
): Promise<JournalPersistenceResult> {
  let journal: Journal;
  try {
    journal = await journalTables.journals.find(journalId);
  } catch {
    throw new Error('Journal not found');
  }
  if (journal.workplaceId !== workplaceId) throw new Error('Journal not found');

  const previousDeletedAt = journal.deletedAt;
  const transactions = await fetchJournalTransactions(workplaceId, [journalId], {
    includeDeleted: true,
  });
  const restoreTransactions = transactions.filter(
    transaction =>
      transaction.deletedAt &&
      previousDeletedAt &&
      transaction.deletedAt.getTime() === previousDeletedAt.getTime(),
  );
  const resultingTransactions = [
    ...transactions.filter(transaction => !transaction.deletedAt),
    ...restoreTransactions,
  ];
  await validateJournal({
    currencyCode: journal.currencyCode,
    status: journal.status,
    workplaceId,
    session,
    transactions: resultingTransactions.map(toPersistenceLine),
  });

  const now = new Date();
  stageModelWrite(session, () => [
    prepareDeletedAt(journal, undefined, now),
    ...restoreTransactions.map(transaction => prepareDeletedAt(transaction, undefined, now)),
    prepareRestoreAudit(journalId, previousDeletedAt, now, workplaceId),
  ]);

  return {
    journal,
    ...rebuildImpactFor([journal], resultingTransactions),
    status: journal.status,
  };
}

/** Restores exactly one bulk-delete operation after validating each resulting journal. */
export async function stageBulkRestore(
  session: AccountingWriteSession,
  workplaceId: WorkplaceId,
  token: BulkDeleteUndoToken,
): Promise<JournalRebuildImpact> {
  const journalIds = token.journals.map(item => item.id);
  const transactionIds = token.transactions.map(item => item.id);
  const journalIdSet = new Set(journalIds);
  const transactionIdSet = new Set(transactionIds);
  const deletedAt = token.journals[0]?.deletedAt ?? token.transactions[0]?.deletedAt;
  if (
    token.journals.length === 0 ||
    journalIdSet.size !== journalIds.length ||
    transactionIdSet.size !== transactionIds.length ||
    token.journals.some(item => item.deletedAt !== deletedAt) ||
    token.transactions.some(
      item => item.deletedAt !== deletedAt || !journalIdSet.has(item.journalId),
    )
  ) {
    throw new Error('Undo token does not match the journal delete operation');
  }

  const [journals, allTransactions] = await Promise.all([
    journalTables.journals
      .query(Q.where('id', Q.oneOf(journalIds)), Q.where('workplace_id', workplaceId))
      .fetch(),
    fetchJournalTransactions(workplaceId, journalIds, { includeDeleted: true }),
  ]);
  const journalById = new Map(journals.map(journal => [journal.id, journal]));
  const transactionById = new Map(
    allTransactions.map(transaction => [transaction.id, transaction]),
  );
  const tokenTransactions = token.transactions.map(expected => transactionById.get(expected.id));
  const deletedTransactions = allTransactions.filter(
    transaction => transaction.deletedAt?.getTime() === deletedAt,
  );
  if (
    journals.length !== token.journals.length ||
    token.journals.some(
      expected => journalById.get(expected.id)?.deletedAt?.getTime() !== expected.deletedAt,
    ) ||
    tokenTransactions.some(
      (transaction, index) =>
        !transaction ||
        transaction.deletedAt?.getTime() !== token.transactions[index].deletedAt ||
        transaction.journalId !== token.transactions[index].journalId,
    ) ||
    deletedTransactions.length !== token.transactions.length ||
    deletedTransactions.some(transaction => !transactionIdSet.has(transaction.id))
  ) {
    throw new Error('Undo token does not match the journal delete operation');
  }

  const resultingTransactionsByJournal = groupTransactionsByJournal(
    allTransactions.filter(
      transaction => transactionIdSet.has(transaction.id) || !transaction.deletedAt,
    ),
  );
  for (const expected of token.journals) {
    const journal = journalById.get(expected.id)!;
    await validateJournal({
      currencyCode: journal.currencyCode,
      status: journal.status,
      workplaceId,
      session,
      transactions: (resultingTransactionsByJournal.get(journal.id) ?? []).map(toPersistenceLine),
    });
  }

  const previousDeletedAtById = new Map(journals.map(journal => [journal.id, journal.deletedAt]));
  const now = new Date();
  stageModelWrite(session, () => [
    ...journals.map(journal => prepareDeletedAt(journal, undefined, now)),
    ...tokenTransactions.map(transaction => prepareDeletedAt(transaction!, undefined, now)),
    ...journals.map(journal =>
      prepareRestoreAudit(journal.id, previousDeletedAtById.get(journal.id), now, workplaceId),
    ),
  ]);

  return rebuildImpactFor(journals, [...resultingTransactionsByJournal.values()].flat());
}

/** Reverts a posted or skipped journal to its planned state atomically. */
export async function stageRevertToPlanned(
  session: AccountingWriteSession,
  journalId: JournalId,
  workplaceId: WorkplaceId,
): Promise<JournalPersistenceResult> {
  const journal = await findActiveJournal(journalId, workplaceId);
  if (!journal) throw new Error('Journal not found');
  const previousStatus = journal.status;
  if (previousStatus !== JournalStatus.POSTED && previousStatus !== JournalStatus.SKIPPED) {
    throw new Error(
      `Cannot revert journal with status ${previousStatus}. Only POSTED or SKIPPED journals can be reverted.`,
    );
  }

  if (journal.plannedPaymentId) {
    const plannedPayment = await journalTables.plannedPayments
      .query(
        Q.where('id', journal.plannedPaymentId),
        Q.where('workplace_id', workplaceId),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch();
    if (plannedPayment.length === 0) {
      throw new Error('Cannot revert to scheduled because the planned payment was deleted.');
    }
  }

  const currentJournalDate = journal.journalDate;
  const [metadata] = await journalTables.metadata
    .query(Q.where('journal_id', journalId), Q.where('workplace_id', workplaceId))
    .fetch();
  const storedDate = metadata?.metadataJson
    ? safeParseJSON<Record<string, unknown>>(metadata.metadataJson, {})[
        MetadataKeys.ORIGINAL_PLANNED_DATE
      ]
    : undefined;
  const revertTime =
    typeof storedDate === 'number' && Number.isFinite(storedDate)
      ? storedDate
      : localStartOfDay(currentJournalDate);
  const transactions = await fetchJournalTransactions(workplaceId, [journalId]);
  const now = new Date();

  stageModelWrite(session, () => [
    journal.prepareUpdate(record => {
      record.status = JournalStatus.PLANNED;
      record.journalDate = revertTime;
      record.updatedAt = now;
    }),
    ...transactions.map(transaction =>
      transaction.prepareUpdate(record => {
        record.transactionDate = revertTime;
        record.updatedAt = now;
      }),
    ),
    auditRepository.prepareLog(
      {
        entityType: 'journal',
        entityId: journalId,
        action: AuditAction.UPDATE,
        changes: {
          before: { status: previousStatus, journalDate: currentJournalDate },
          after: { status: JournalStatus.PLANNED, journalDate: revertTime },
        },
      },
      workplaceId,
    ),
  ]);

  return {
    journal,
    affectedAccountIds: new Set(transactions.map(transaction => transaction.accountId)),
    rebuildFromDate: Math.min(currentJournalDate, revertTime),
    previousStatus,
    status: JournalStatus.PLANNED,
  };
}

export async function stageNonPostedStatuses(
  session: AccountingWriteSession,
  workplaceId: WorkplaceId,
  updates: readonly {
    journalId: JournalId;
    status: JournalStatus;
    expectedStatus?: JournalStatus;
  }[],
): Promise<void> {
  const ids = updates.map(update => update.journalId);
  if (new Set(ids).size !== ids.length) {
    throw new Error('A journal can only receive one planned-status update per session');
  }

  const validatedUpdates: {
    journal: Journal;
    previousStatus: JournalStatus;
    status: JournalStatus;
    updatedAt: Date;
  }[] = [];
  for (const update of updates) {
    if (!NON_POSTED_STATUSES.has(update.status)) {
      throw new Error(`Unsupported non-posted journal status: ${update.status}`);
    }
    const journal = await findActiveJournal(update.journalId, workplaceId);
    if (!journal) throw new Error(`Journal ${update.journalId} not found`);
    if (update.expectedStatus !== undefined && journal.status !== update.expectedStatus) {
      throw new Error(
        `Journal ${update.journalId} changed from ${update.expectedStatus} to ${journal.status}`,
      );
    }
    if (!NON_POSTED_STATUSES.has(journal.status)) {
      throw new Error(`Cannot change planned status for journal in ${journal.status} status`);
    }
    if (journal.status === update.status) continue;

    validatedUpdates.push({
      journal,
      previousStatus: journal.status,
      status: update.status,
      updatedAt: new Date(),
    });
  }
  stageModelWrite(session, () =>
    validatedUpdates.flatMap(({ journal, previousStatus, status, updatedAt }) => [
      journal.prepareUpdate(record => {
        record.status = status;
        record.updatedAt = updatedAt;
      }),
      auditRepository.prepareLog(
        {
          entityType: 'journal',
          entityId: journal.id,
          action: AuditAction.UPDATE,
          changes: {
            before: { status: previousStatus },
            after: { status },
          },
        },
        workplaceId,
      ),
    ]),
  );
}
