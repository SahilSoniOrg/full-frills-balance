import {
  stageModelWrite,
  stageJournalCaptureMetadataWrite,
  type AccountingWriteSession,
} from '@/src/data/repositories/AccountingWriteSession';
import Journal from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { generator } from '@/src/data/database/idGenerator';
import {
  fetchActiveJournals,
  fetchJournalTransactions,
  groupTransactionsByJournal,
  journalTables,
  mapJournalSnapshotForAudit,
  prepareDeleteAudit,
  prepareDeletedAt,
  rebuildImpactFor,
  toPersistenceLine,
  validateJournal,
} from '@/src/data/repositories/journal/journalPersistenceSupport';
import { preparePutOperations } from '@/src/data/repositories/journal/journalPutOperations';
import type {
  JournalPersistenceResult,
  JournalRebuildImpact,
  MergeJournalsInput,
  ReassignJournalAccountsInput,
  ValidatedJournal,
} from '@/src/data/repositories/journal/journalPersistenceTypes';
import { AuditAction, JournalDisplayType, JournalStatus } from '@/src/types/enums';
import { AccountId, JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import { mapTransactionToAudit } from '@/src/types/audit';
import {
  combineCaptureMetadata,
  readCaptureMetadata,
  retargetCaptureAccounts,
  withCaptureMetadata,
  withoutCaptureMetadata,
} from '@/src/domain/transaction-intelligence/captureMetadata';
import { transitionCapture } from '@/src/domain/transaction-intelligence/captureTransition';
import { applyJournalMetadataProjections } from '@/src/data/repositories/journal/journalMetadataProjections';
import type { AuditEventMetadata } from '@/src/types/auditEvents';
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
  const capture = combineCaptureMetadata(
    sourceMetadata
      .map(metadata => readCaptureMetadata(metadata.metadataJson))
      .filter(metadata => metadata !== null),
  );
  const sourceAccounts = capture
    ? await journalTables.accounts
        .query(
          Q.where('workplace_id', workplaceId),
          Q.where('id', Q.oneOf([...new Set(transactions.map(line => line.accountId))])),
        )
        .fetch()
    : [];
  const accountsById = new Map(sourceAccounts.map(account => [account.id, account]));
  const mergedCapture = capture
    ? transitionCapture({
        existing: capture,
        proposedLines: transactions.map(line => {
          const account = accountsById.get(line.accountId);
          if (!account) throw new Error('Account not found while merging capture evidence');
          return { ...line, accountType: account.accountType, currencyCode: account.currencyCode };
        }),
        actor: 'system',
        now: Date.now(),
      })
    : null;
  if (mergedCapture && (!mergedCapture.ok || !mergedCapture.capture))
    throw new Error('Capture evidence could not be merged. Review the journals again.');
  // A merge can only be undone as a whole; reverting one history row would change balances.
  const auditMetadata: AuditEventMetadata = {
    eventType: 'journal.created',
    correlationId: generator(),
    undoable: false,
  };

  const prepared = await preparePutOperations(
    {
      journalDate,
      description,
      currencyCode,
      status: JournalStatus.POSTED,
      plannedPaymentId: plannedPaymentIds[0],
      displayType: input.displayType ?? defaultDisplayType,
      transactions,
      metadata:
        mergedCapture?.ok && mergedCapture.capture
          ? {
              importSource: 'merged',
              metadataJson: withCaptureMetadata(undefined, mergedCapture.capture),
            }
          : undefined,
    },
    workplaceId,
    session,
    auditMetadata,
  );
  const mergedJournalId = prepared.result.journal.id;

  const now = new Date();
  const transactionsByJournal = groupTransactionsByJournal(sourceTransactions);
  const sourceIds = new Set<JournalId>(sourceJournalIds);
  stageModelWrite(session, () => [
    ...prepared.ops(),
    ...orderedJournals.map(journal => prepareDeletedAt(journal, now, now)),
    ...sourceTransactions.map(transaction => prepareDeletedAt(transaction, now, now)),
    ...orderedJournals.map(journal =>
      prepareDeleteAudit(journal, transactionsByJournal.get(journal.id) ?? [], now, workplaceId, {
        ...auditMetadata,
        eventType: 'journal.deleted',
      }),
    ),
    ...sourceMetadata.map(metadata =>
      metadata.prepareUpdate(record => {
        record.journalId = mergedJournalId;
        if (readCaptureMetadata(record.metadataJson)) {
          record.metadataJson = withoutCaptureMetadata(record.metadataJson);
          applyJournalMetadataProjections(record);
        }
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
  const metadataRows = await journalTables.metadata
    .query(Q.where('workplace_id', workplaceId), Q.where('journal_id', Q.oneOf(journalIds)))
    .fetch();
  const captureUpdates = metadataRows.flatMap(metadata => {
    const capture = readCaptureMetadata(metadata.metadataJson);
    if (!capture) return [];
    const balance = validated.get(metadata.journalId)!;
    const transition = transitionCapture({
      existing: capture,
      proposedLines: balance.lines.map(line => ({
        ...line,
        accountType: balance.accountsById.get(line.accountId)!.accountType,
        currencyCode: balance.accountsById.get(line.accountId)!.currencyCode,
      })),
      actor: 'user',
      now: now.getTime(),
    });
    if (!transition.ok || !transition.capture)
      throw new Error('Capture categories could not be updated during account reassignment.');
    return [
      { metadata, metadataJson: withCaptureMetadata(metadata.metadataJson, transition.capture) },
    ];
  });
  for (const { metadata, metadataJson } of captureUpdates) {
    stageJournalCaptureMetadataWrite(
      session,
      workplaceId,
      metadata.journalId,
      metadata.id,
      metadataJson,
      linkedMetadataJson => [
        metadata.prepareUpdate(record => {
          record.metadataJson = linkedMetadataJson;
          applyJournalMetadataProjections(record);
          record.updatedAt = now;
        }),
      ],
    );
  }
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
  correlationId?: string,
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
  const [journals, journalTransactions] = movedTransactions.length
    ? await loadJournalsWithActiveLines(workplaceId, [
        ...new Set(movedTransactions.map(transaction => transaction.journalId)),
      ])
    : [[], []];
  await validateRetargetedJournals(
    session,
    workplaceId,
    journals.filter(journal => journal.status === JournalStatus.POSTED),
    journalTransactions,
    transaction => (sourceIds.has(transaction.accountId) ? targetAccountId : transaction.accountId),
  );

  const now = new Date();
  const transactionsByJournal = groupTransactionsByJournal(journalTransactions);
  const metadataRows = await journalTables.metadata
    .query(Q.where('workplace_id', workplaceId), Q.where('capture_review_state', Q.notEq(null)))
    .fetch();
  const captureUpdates = metadataRows.flatMap(metadata => {
    const capture = readCaptureMetadata(metadata.metadataJson);
    if (!capture) return [];
    if (
      ![
        ...capture.allocations.map(allocation => allocation.accountId),
        ...(capture.uncategorizedAccountIds ?? []),
      ].some(accountId => sourceIds.has(accountId))
    )
      return [];
    const nextCapture = retargetCaptureAccounts(capture, accountId =>
      sourceIds.has(accountId) ? targetAccountId : accountId,
    );
    return [{ metadata, metadataJson: withCaptureMetadata(metadata.metadataJson, nextCapture) }];
  });
  for (const { metadata, metadataJson } of captureUpdates) {
    stageJournalCaptureMetadataWrite(
      session,
      workplaceId,
      metadata.journalId,
      metadata.id,
      metadataJson,
      linkedMetadataJson => [
        metadata.prepareUpdate(record => {
          record.metadataJson = linkedMetadataJson;
          applyJournalMetadataProjections(record);
          record.updatedAt = now;
        }),
      ],
    );
  }
  const beforeTransactionsByJournal = new Map(
    [...transactionsByJournal].map(([journalId, transactions]) => [
      journalId,
      transactions.map(mapTransactionToAudit),
    ]),
  );
  stageModelWrite(session, () => [
    ...movedTransactions.map(transaction =>
      transaction.prepareUpdate(record => {
        record.accountId = targetAccountId;
        record.runningBalance = null;
        record.updatedAt = now;
      }),
    ),
    ...journals.map(journal => {
      const transactions = transactionsByJournal.get(journal.id) ?? [];
      const beforeTransactions = beforeTransactionsByJournal.get(journal.id) ?? [];
      const afterTransactions = transactions.map(transaction =>
        mapTransactionToAudit({
          accountId: sourceIds.has(transaction.accountId) ? targetAccountId : transaction.accountId,
          amount: transaction.amount,
          transactionType: transaction.transactionType,
          notes: transaction.notes,
          exchangeRate: transaction.exchangeRate,
          currencyCode: transaction.currencyCode,
        }),
      );
      return auditRepository.prepareLog(
        {
          entityType: 'journal',
          entityId: journal.id,
          eventType: 'journal.accounts_retargeted',
          action: AuditAction.UPDATE,
          source: 'app',
          correlationId,
          changes: {
            before: {
              ...mapJournalSnapshotForAudit(journal),
              transactions: beforeTransactions,
            },
            after: {
              ...mapJournalSnapshotForAudit(journal),
              transactions: afterTransactions,
            },
          },
          undoable: false,
        },
        workplaceId,
      );
    }),
  ]);
}
