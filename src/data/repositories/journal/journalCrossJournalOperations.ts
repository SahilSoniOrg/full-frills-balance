import {
  stageModelWrite,
  type AccountingWriteSession,
} from '@/src/data/repositories/AccountingWriteSession';
import Journal from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';
import {
  fetchActiveJournals,
  fetchJournalTransactions,
  groupTransactionsByJournal,
  journalTables,
  prepareDeletedAt,
  rebuildImpactFor,
  toPersistenceLine,
  validateJournal,
  type ValidatedJournal,
} from '@/src/data/repositories/journal/journalPersistenceSupport';
import { preparePutOperations } from '@/src/data/repositories/journal/journalPutOperations';
import type {
  JournalPersistenceResult,
  JournalRebuildImpact,
  MergeJournalsInput,
  ReassignJournalAccountsInput,
} from '@/src/data/repositories/journal/journalPersistenceTypes';
import { JournalDisplayType, JournalStatus } from '@/src/types/enums';
import { AccountId, JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import { Q } from '@nozbe/watermelondb';

/** Validates each journal as it would read after moving lines to other accounts. */
async function validateRetargetedJournals(
  session: AccountingWriteSession,
  workplaceId: WorkplaceId,
  journals: readonly Journal[],
  journalTransactions: readonly Transaction[],
  accountIdFor: (transaction: Transaction) => AccountId,
): Promise<Map<JournalId, ValidatedJournal>> {
  const transactionsByJournal = groupTransactionsByJournal(journalTransactions);
  const validated = new Map<JournalId, ValidatedJournal>();
  for (const journal of journals) {
    const result = await validateJournal({
      currencyCode: journal.currencyCode,
      status: journal.status,
      workplaceId,
      session,
      transactions: (transactionsByJournal.get(journal.id) ?? []).map(transaction => ({
        ...toPersistenceLine(transaction),
        accountId: accountIdFor(transaction),
      })),
    });
    validated.set(journal.id, result);
  }
  return validated;
}

function loadJournalsWithActiveLines(workplaceId: WorkplaceId, journalIds: readonly JournalId[]) {
  return Promise.all([
    fetchActiveJournals(workplaceId, journalIds),
    fetchJournalTransactions(workplaceId, journalIds),
  ]);
}

/**
 * Rebuilds a merged posted journal from current source rows and stages it with
 * source soft-deletes and metadata/inbox retargeting.
 */
export async function stageMerge(
  session: AccountingWriteSession,
  input: MergeJournalsInput,
  workplaceId: WorkplaceId,
): Promise<JournalPersistenceResult> {
  const sourceJournalIds = [...new Set(input.sourceJournalIds)];
  const sourceJournals = await fetchActiveJournals(workplaceId, sourceJournalIds);
  if (sourceJournals.length !== sourceJournalIds.length) {
    throw new Error('Some selected transactions could not be found.');
  }

  const journalById = new Map(sourceJournals.map(journal => [journal.id, journal]));
  const orderedJournals = sourceJournalIds.map(journalId => journalById.get(journalId)!);
  const currencyCode = orderedJournals[0].currencyCode;
  if (
    orderedJournals.some(
      journal => journal.currencyCode.trim().toUpperCase() !== currencyCode.trim().toUpperCase(),
    )
  ) {
    throw new Error('Cannot merge transactions with different currencies.');
  }

  const plannedPaymentIds = [
    ...new Set(
      orderedJournals
        .map(journal => journal.plannedPaymentId)
        .filter((id): id is PlannedPaymentId => Boolean(id)),
    ),
  ];
  if (plannedPaymentIds.length > 1) {
    throw new Error('Cannot merge transactions linked to different planned payments.');
  }

  const [sourceTransactions, sourceMetadata, sourceInboxRecords] = await Promise.all([
    fetchJournalTransactions(workplaceId, sourceJournalIds),
    journalTables.metadata
      .query(Q.where('journal_id', Q.oneOf(sourceJournalIds)), Q.where('workplace_id', workplaceId))
      .fetch(),
    journalTables.inboxRecords
      .query(
        Q.where('workplace_id', workplaceId),
        Q.or(
          Q.where('linked_journal_id', Q.oneOf(sourceJournalIds)),
          Q.where('duplicate_journal_id', Q.oneOf(sourceJournalIds)),
        ),
      )
      .fetch(),
  ]);
  const descriptions = [
    ...new Set(
      orderedJournals
        .map(journal => journal.description?.trim())
        .filter((description): description is string => Boolean(description)),
    ),
  ];
  const firstDisplayType = orderedJournals[0].displayType;
  const defaultDisplayType =
    firstDisplayType && orderedJournals.every(journal => journal.displayType === firstDisplayType)
      ? firstDisplayType
      : JournalDisplayType.TRANSFER;
  const journalDate =
    input.journalDate ?? Math.max(...orderedJournals.map(journal => journal.journalDate));
  const description =
    input.description ||
    (descriptions.length > 0 ? `Merged: ${descriptions.join(', ')}` : 'Merged Transaction');
  const transactions = sourceTransactions.map(toPersistenceLine);

  const prepared = await preparePutOperations(
    {
      journalDate,
      description,
      currencyCode,
      status: JournalStatus.POSTED,
      plannedPaymentId: plannedPaymentIds[0],
      displayType: input.displayType ?? defaultDisplayType,
      transactions,
    },
    workplaceId,
    session,
  );
  const mergedJournalId = prepared.result.journal.id;

  const now = new Date();
  const sourceIds = new Set<JournalId>(sourceJournalIds);
  stageModelWrite(session, () => [
    ...prepared.ops(),
    ...orderedJournals.map(journal => prepareDeletedAt(journal, now, now)),
    ...sourceTransactions.map(transaction => prepareDeletedAt(transaction, now, now)),
    ...sourceMetadata.map(metadata =>
      metadata.prepareUpdate(record => {
        record.journalId = mergedJournalId;
        record.updatedAt = now;
      }),
    ),
    ...sourceInboxRecords.map(inboxRecord =>
      inboxRecord.prepareUpdate(record => {
        if (record.linkedJournalId && sourceIds.has(record.linkedJournalId)) {
          record.linkedJournalId = mergedJournalId;
        }
        if (record.duplicateJournalId && sourceIds.has(record.duplicateJournalId)) {
          record.duplicateJournalId = mergedJournalId;
        }
      }),
    ),
  ]);

  return {
    ...prepared.result,
    affectedAccountIds: new Set<AccountId>([
      ...sourceTransactions.map(transaction => transaction.accountId),
      ...transactions.map(transaction => transaction.accountId),
    ]),
    rebuildFromDate: Math.min(
      journalDate,
      ...orderedJournals.map(journal => journal.journalDate),
      ...sourceTransactions.map(transaction => transaction.transactionDate),
    ),
  };
}

/** Reassigns transaction accounts after reloading and validating affected journals in-session. */
export async function stageReassignAccounts(
  session: AccountingWriteSession,
  input: ReassignJournalAccountsInput,
  workplaceId: WorkplaceId,
): Promise<JournalRebuildImpact> {
  const replacements = input.accountIdByTransactionId;
  const transactionIds = [...replacements.keys()];
  const transactions = await journalTables.transactions
    .query(
      Q.where('id', Q.oneOf(transactionIds)),
      Q.where('workplace_id', workplaceId),
      Q.where('deleted_at', Q.eq(null)),
    )
    .fetch();
  if (transactions.length !== transactionIds.length) {
    throw new Error('Some transactions could not be found for account reassignment.');
  }

  const journalIds = [...new Set(transactions.map(transaction => transaction.journalId))];
  const [journals, journalTransactions] = await loadJournalsWithActiveLines(
    workplaceId,
    journalIds,
  );
  if (journals.length !== journalIds.length) {
    throw new Error('Some journals could not be found for account reassignment.');
  }
  const validated = await validateRetargetedJournals(
    session,
    workplaceId,
    journals,
    journalTransactions,
    transaction => replacements.get(transaction.id) ?? transaction.accountId,
  );

  const now = new Date();
  stageModelWrite(session, () => [
    ...transactions.map(transaction => {
      const accountId = replacements.get(transaction.id)!;
      return transaction.prepareUpdate(record => {
        record.accountId = accountId;
        record.runningBalance = null;
        record.updatedAt = now;
      });
    }),
    ...journals.map(journal =>
      journal.prepareUpdate(record => {
        record.displayType = validated.get(journal.id)!.displayType;
        record.updatedAt = now;
      }),
    ),
  ]);

  const impact = rebuildImpactFor(journals, transactions);
  return {
    ...impact,
    affectedAccountIds: new Set([...impact.affectedAccountIds, ...replacements.values()]),
  };
}

/**
 * Retarget transaction lines as part of an account merge. Existing posted
 * journals are revalidated against the resulting account references before
 * the transaction updates are staged for the enclosing atomic write.
 */
export async function stageRetargetAccountsForMerge(
  session: AccountingWriteSession,
  workplaceId: WorkplaceId,
  sourceAccountIds: readonly AccountId[],
  targetAccountId: AccountId,
): Promise<void> {
  if (sourceAccountIds.length === 0) return;

  const sourceIds = new Set(sourceAccountIds);
  const movedTransactions = await journalTables.transactions
    .query(
      Q.where('workplace_id', workplaceId),
      Q.where('account_id', Q.oneOf([...sourceAccountIds])),
      Q.where('deleted_at', Q.eq(null)),
    )
    .fetch();
  if (movedTransactions.length === 0) return;

  const [journals, journalTransactions] = await loadJournalsWithActiveLines(workplaceId, [
    ...new Set(movedTransactions.map(transaction => transaction.journalId)),
  ]);
  await validateRetargetedJournals(
    session,
    workplaceId,
    journals.filter(journal => journal.status === JournalStatus.POSTED),
    journalTransactions,
    transaction => (sourceIds.has(transaction.accountId) ? targetAccountId : transaction.accountId),
  );

  const now = new Date();
  stageModelWrite(session, () =>
    movedTransactions.map(transaction =>
      transaction.prepareUpdate(record => {
        record.accountId = targetAccountId;
        record.runningBalance = null;
        record.updatedAt = now;
      }),
    ),
  );
}
