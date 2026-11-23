import {
  stageJournalCaptureMetadataWrite,
  stageModelWrite,
  type AccountingWriteSession,
} from '@/src/data/repositories/AccountingWriteSession';
import Transaction from '@/src/data/models/Transaction';
import { MetadataKeys, MetadataSources } from '@/src/constants/ledger-constants';
import {
  fetchActiveJournals,
  fetchJournalTransactions,
  findActiveJournal,
  journalTables,
  toPersistenceLine,
  validateJournal,
} from '@/src/data/repositories/journal/journalPersistenceSupport';
import type {
  JournalPersistenceResult,
  PutJournalRequest,
  ReverseJournalOptions,
} from '@/src/data/repositories/journal/journalPersistenceTypes';
import type { JournalWriteLine } from '@/src/types/journalWrite';
import { assertExpectedJournalSnapshot } from '@/src/data/repositories/journal/journalAuditGuard';
import {
  preparePostAuditLog,
  preparePutAuditLog,
  prepareRenameAuditLog,
  prepareReverseAuditLog,
} from '@/src/data/repositories/journal/journalPutAudit';
import { stagePutCaptureMetadata } from '@/src/data/repositories/journal/journalPutCaptureMetadata';
import { resolvePut } from '@/src/data/repositories/journal/journalPutResolve';
import { runningBalancesAfter } from '@/src/data/repositories/journal/journalPutRunningBalance';
import { JournalStatus, TransactionType } from '@/src/types/enums';
import { AccountId, brandedKeys, JournalId, WorkplaceId } from '@/src/types/ids';
import type { AuditEventMetadata } from '@/src/types/auditEvents';
import { isActiveJournalStatus } from '@/src/domain/journal/journalStatus';
import { applyJournalMetadataProjections } from '@/src/data/repositories/journal/journalMetadataProjections';
import { parseJSONRecord } from '@/src/utils/serialization';
import { Model, Q } from '@nozbe/watermelondb';

export interface PreparedJournalWrite {
  ops: () => readonly Model[];
  result: JournalPersistenceResult;
}

export async function preparePutOperations(
  input: PutJournalRequest,
  workplaceId: WorkplaceId,
  session: AccountingWriteSession,
  auditMetadata?: AuditEventMetadata,
  expectedCurrent?: Record<string, unknown>,
): Promise<PreparedJournalWrite> {
  const put = await resolvePut(input, workplaceId);
  const { existing, oldTransactions, journalDate, status } = put;
  const initialDeletedAt =
    'initialDeletedAt' in input && input.initialDeletedAt !== undefined
      ? new Date(input.initialDeletedAt)
      : undefined;
  if (
    initialDeletedAt &&
    (existing ||
      status !== JournalStatus.PLANNED ||
      !input.plannedPaymentId ||
      !Number.isFinite(initialDeletedAt.getTime()))
  ) {
    throw new Error('Only a new planned payment occurrence can be created retired.');
  }
  if (expectedCurrent) {
    if (!existing) {
      throw new Error(
        'This journal changed after the selected history entry. Refresh and review the latest change.',
      );
    }
    assertExpectedJournalSnapshot(expectedCurrent, existing, oldTransactions);
  }
  const balance = await validateJournal({
    currencyCode: put.currencyCode,
    transactions: put.lines,
    status,
    workplaceId,
    session,
    roundAmounts: put.replacesLines,
  });
  const { lines } = balance;
  const displayType = put.displayType ?? balance.displayType;
  const runningBalanceByAccountId =
    put.replacesLines && status === JournalStatus.POSTED
      ? await runningBalancesAfter(
          workplaceId,
          journalDate,
          balance,
          existing && isActiveJournalStatus(existing.status) ? oldTransactions : [],
        )
      : undefined;

  const now = new Date();
  const createJournalId = 'createJournalId' in input ? input.createJournalId : undefined;
  if (existing && createJournalId) {
    throw new Error('A journal cannot be updated with a new journal ID.');
  }
  const journal =
    existing ??
    journalTables.journals.prepareCreate(record => {
      if (createJournalId) record._raw.id = createJournalId;
      record.workplaceId = workplaceId;
      record.journalDate = journalDate;
      record.description = put.description;
      record.notes = put.notes;
      record.currencyCode = put.currencyCode;
      record.status = status;
      record.originalJournalId = input.originalJournalId;
      record.plannedPaymentId = input.plannedPaymentId;
      record.totalAmount = balance.totalAmount;
      record.transactionCount = lines.length;
      record.displayType = displayType;
      record.createdAt = now;
      record.updatedAt = now;
      if (initialDeletedAt) record.deletedAt = initialDeletedAt;
    });

  await stagePutCaptureMetadata({
    session,
    workplaceId,
    journalId: journal.id,
    existing,
    oldTransactions,
    replacesLines: put.replacesLines,
    input,
    balance,
    status,
    auditMetadata,
    now,
  });

  const previousStatus = existing?.status;
  const previousJournalDate = existing?.journalDate;
  const touchesLines =
    put.replacesLines || journalDate !== previousJournalDate || status !== previousStatus;

  // Capture before/after while `existing` still holds the pre-update snapshot.
  // prepareUpdate mutates the model in place, so building the audit log inside
  // ops() would collapse before/after and mark the entry non-undoable.
  const putAuditLog = preparePutAuditLog({
    existing,
    input,
    put,
    balance,
    oldTransactions,
    journalId: journal.id,
    workplaceId,
    auditMetadata,
  });

  const ops = (): readonly Model[] => {
    const journalOp = existing
      ? existing.prepareUpdate(record => {
          record.journalDate = journalDate;
          record.description = put.description;
          record.notes = put.notes;
          record.totalAmount = balance.totalAmount;
          record.transactionCount = lines.length;
          record.displayType = displayType;
          record.status = status;
          record.updatedAt = now;
        })
      : journal;
    const transactionOps = put.replacesLines
      ? [
          ...oldTransactions.map(transaction =>
            transaction.prepareUpdate(record => {
              record.deletedAt = now;
              record.updatedAt = now;
            }),
          ),
          ...lines.map(line =>
            journalTables.transactions.prepareCreate(record => {
              record.journalId = journal.id;
              record.workplaceId = workplaceId;
              record.accountId = line.accountId;
              record.amount = line.amount;
              record.transactionType = line.transactionType;
              record.currencyCode = balance.accountsById.get(line.accountId)!.currencyCode;
              record.transactionDate = journalDate;
              record.notes = line.notes;
              record.exchangeRate = line.exchangeRate;
              record.runningBalance = runningBalanceByAccountId?.get(line.accountId) ?? null;
              record.createdAt = now;
              record.updatedAt = now;
              if (initialDeletedAt) record.deletedAt = initialDeletedAt;
            }),
          ),
        ]
      : touchesLines
        ? oldTransactions.map(transaction =>
            transaction.prepareUpdate(record => {
              if (journalDate !== previousJournalDate) record.transactionDate = journalDate;
              record.runningBalance = null;
              record.updatedAt = now;
            }),
          )
        : [];

    return [journalOp, ...transactionOps, putAuditLog];
  };

  return {
    ops,
    result: {
      journal,
      affectedAccountIds: touchesLines
        ? new Set<AccountId>([
            ...oldTransactions.map(transaction => transaction.accountId),
            ...lines.map(transaction => transaction.accountId),
          ])
        : new Set<AccountId>(),
      rebuildFromDate: Math.min(previousJournalDate ?? journalDate, journalDate),
      previousStatus,
      status,
    },
  };
}

export async function stagePut(
  session: AccountingWriteSession,
  input: PutJournalRequest,
  workplaceId: WorkplaceId,
  auditMetadata?: AuditEventMetadata,
  expectedCurrent?: Record<string, unknown>,
): Promise<JournalPersistenceResult> {
  const prepared = await preparePutOperations(
    input,
    workplaceId,
    session,
    auditMetadata,
    expectedCurrent,
  );
  stageModelWrite(session, prepared.ops);
  return prepared.result;
}

export async function stagePost(
  session: AccountingWriteSession,
  journalId: JournalId,
  workplaceId: WorkplaceId,
  postedAt: number,
  auditMetadata?: AuditEventMetadata,
  expectedCurrent?: Record<string, unknown>,
): Promise<JournalPersistenceResult> {
  const journal = await findActiveJournal(journalId, workplaceId);
  if (!journal) throw new Error('Journal not found');
  if (expectedCurrent) {
    const currentTransactions = await fetchJournalTransactions(workplaceId, [journalId]);
    assertExpectedJournalSnapshot(expectedCurrent, journal, currentTransactions);
  }
  if (journal.status !== JournalStatus.PLANNED) {
    throw new Error(
      `Cannot post journal with status ${journal.status}. Only PLANNED journals can be posted.`,
    );
  }
  const originalPlannedDate = journal.journalDate;

  const transactions = await fetchJournalTransactions(workplaceId, [journalId]);
  await validateJournal({
    currencyCode: journal.currencyCode,
    status: JournalStatus.POSTED,
    workplaceId,
    transactions: transactions.map(toPersistenceLine),
    session,
  });

  const now = new Date();
  const [existingMetadata] = await journalTables.metadata
    .query(Q.where('journal_id', journalId), Q.where('workplace_id', workplaceId))
    .fetch();
  const originalMetadataJson = JSON.stringify({
    ...(existingMetadata ? parseJSONRecord(existingMetadata.metadataJson) : {}),
    [MetadataKeys.ORIGINAL_PLANNED_DATE]: originalPlannedDate,
  });
  stageJournalCaptureMetadataWrite(
    session,
    workplaceId,
    journalId,
    existingMetadata?.id ?? 'create-metadata',
    originalMetadataJson,
    metadataJson => [
      existingMetadata
        ? existingMetadata.prepareUpdate(record => {
            record.metadataJson = metadataJson;
            applyJournalMetadataProjections(record);
            record.importSource = MetadataSources.MANUAL_POST;
            record.updatedAt = now;
          })
        : journalTables.metadata.prepareCreate(record => {
            record.journalId = journalId;
            record.workplaceId = workplaceId;
            record.importSource = MetadataSources.MANUAL_POST;
            record.metadataJson = metadataJson ?? originalMetadataJson;
            applyJournalMetadataProjections(record);
            record.createdAt = now;
            record.updatedAt = now;
          }),
    ],
  );
  stageModelWrite(session, () => [
    journal.prepareUpdate(record => {
      record.status = JournalStatus.POSTED;
      record.journalDate = postedAt;
      record.updatedAt = now;
    }),
    ...transactions.map(transaction =>
      transaction.prepareUpdate(record => {
        record.transactionDate = postedAt;
        record.updatedAt = now;
      }),
    ),
    preparePostAuditLog({ journalId, originalPlannedDate, postedAt, workplaceId, auditMetadata }),
  ]);
  return {
    journal,
    affectedAccountIds: new Set(transactions.map(transaction => transaction.accountId)),
    rebuildFromDate: Math.min(originalPlannedDate, postedAt),
    previousStatus: JournalStatus.PLANNED,
    status: JournalStatus.POSTED,
  };
}

function toReversalLine(transaction: Transaction): JournalWriteLine {
  return {
    ...toPersistenceLine(transaction),
    transactionType:
      transaction.transactionType === TransactionType.DEBIT
        ? TransactionType.CREDIT
        : TransactionType.DEBIT,
    notes: `Reversal: ${transaction.notes || ''}`,
  };
}

/** Stages a reversing journal and marks the original reversed in the same session. */
export async function stageReverse(
  session: AccountingWriteSession,
  originalJournalId: JournalId,
  reason: string,
  workplaceId: WorkplaceId,
  { reversedAt = Date.now() }: ReverseJournalOptions = {},
): Promise<JournalPersistenceResult> {
  const originalJournal = await findActiveJournal(originalJournalId, workplaceId);
  if (!originalJournal) throw new Error('Original journal not found');
  const { status: originalStatus, reversingJournalId: originalReversingJournalId } =
    originalJournal;
  if (originalStatus !== JournalStatus.POSTED || originalReversingJournalId) {
    throw new Error('Only a posted journal without an existing reversal can be reversed');
  }
  const originalTransactions = await fetchJournalTransactions(workplaceId, [originalJournalId]);

  const prepared = await preparePutOperations(
    {
      journalDate: reversedAt,
      description: `Reversal of: ${originalJournal.description || originalJournalId} (${reason})`,
      currencyCode: originalJournal.currencyCode,
      originalJournalId,
      transactions: originalTransactions.map(toReversalLine),
    },
    workplaceId,
    session,
    {
      eventType: 'journal.reversal_created',
      source: 'app',
      undoable: false,
    },
  );
  const reversingJournalId = prepared.result.journal.id;

  stageModelWrite(session, () => [
    ...prepared.ops(),
    originalJournal.prepareUpdate(record => {
      record.reversingJournalId = reversingJournalId;
      record.status = JournalStatus.REVERSED;
      record.updatedAt = new Date();
    }),
    prepareReverseAuditLog({
      originalJournalId,
      originalStatus,
      originalReversingJournalId,
      reversingJournalId,
      workplaceId,
    }),
  ]);
  return {
    ...prepared.result,
    affectedAccountIds: new Set([
      ...prepared.result.affectedAccountIds,
      ...originalTransactions.map(transaction => transaction.accountId),
    ]),
    rebuildFromDate: Math.min(originalJournal.journalDate, reversedAt),
  };
}

/**
 * Stages description-only updates for active journals. Unchanged and missing journals are
 * skipped. Returns the previous description of every renamed journal.
 */
export async function stageRename(
  session: AccountingWriteSession,
  workplaceId: WorkplaceId,
  renames: Readonly<Record<JournalId, string>>,
): Promise<Record<JournalId, string>> {
  const journalIds = brandedKeys(renames);
  if (journalIds.length === 0) return {};
  const journals = await fetchActiveJournals(workplaceId, journalIds);
  const previousDescriptions: Record<JournalId, string> = {};
  const renamed = journals.flatMap(journal => {
    const previousDescription = journal.description;
    const description = renames[journal.id];
    if (description === undefined || description === (previousDescription ?? '')) return [];
    previousDescriptions[journal.id] = previousDescription ?? '';
    return [{ journal, previousDescription, description }];
  });

  const now = new Date();
  stageModelWrite(session, () =>
    renamed.flatMap(({ journal, previousDescription, description }) => [
      journal.prepareUpdate(record => {
        record.description = description;
        record.updatedAt = now;
      }),
      prepareRenameAuditLog({
        journalId: journal.id,
        previousDescription,
        description,
        workplaceId,
      }),
    ]),
  );
  return previousDescriptions;
}
