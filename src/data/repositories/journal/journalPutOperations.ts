import {
  stageModelWrite,
  type AccountingWriteSession,
} from '@/src/data/repositories/AccountingWriteSession';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import Journal from '@/src/data/models/Journal';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import Transaction from '@/src/data/models/Transaction';
import { MetadataKeys, MetadataSources } from '@/src/constants/ledger-constants';
import {
  fetchActiveJournals,
  fetchJournalTransactions,
  findActiveJournal,
  journalTables,
  toPersistenceLine,
  validateJournal,
  type ValidatedJournal,
} from '@/src/data/repositories/journal/journalPersistenceSupport';
import type {
  JournalPersistenceLine,
  JournalPersistenceMetadata,
  JournalPersistenceResult,
  PutJournalRequest,
  ReverseJournalOptions,
} from '@/src/data/repositories/journal/journalPersistenceTypes';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { JournalBalanceError } from '@/src/domain/accounting/journalBalanceEvaluator';
import { AuditAction, JournalDisplayType, JournalStatus, TransactionType } from '@/src/types/enums';
import { AccountId, brandedKeys, JournalId, WorkplaceId } from '@/src/types/ids';
import { mapTransactionToAudit } from '@/src/types/audit';
import { effect } from '@/src/utils/accounting/BalanceEffects';
import { isActiveJournalStatus } from '@/src/utils/journalStatus';
import { referenceNumberFromMetadataJson } from '@/src/utils/sms/SmsReferenceExtractor';
import { safeParseJSON } from '@/src/utils/serialization';
import { Model, Q } from '@nozbe/watermelondb';

export interface PreparedJournalWrite {
  ops: () => readonly Model[];
  result: JournalPersistenceResult;
}

/** Persisted journal values a put resolves to, whether it creates or updates. */
interface ResolvedPut {
  existing: Journal | null;
  oldTransactions: readonly Transaction[];
  lines: readonly JournalPersistenceLine[];
  replacesLines: boolean;
  journalDate: number;
  description?: string;
  notes?: string;
  displayType?: JournalDisplayType;
  currencyCode: string;
  status: JournalStatus;
}

function resolveCreate(input: PutJournalRequest): ResolvedPut {
  if (!input.transactions || input.journalDate === undefined || !input.currencyCode) {
    throw new Error('A new journal requires a date, currency, and transaction lines');
  }
  return {
    existing: null,
    oldTransactions: [],
    lines: input.transactions,
    replacesLines: true,
    journalDate: input.journalDate,
    description: input.description,
    notes: input.notes,
    displayType: input.displayType,
    currencyCode: input.currencyCode,
    status: input.status ?? JournalStatus.POSTED,
  };
}

/** Sparse update: omitted fields keep persisted values; an explicit `undefined` text clears it. */
function resolveUpdate(
  input: PutJournalRequest,
  existing: Journal,
  oldTransactions: readonly Transaction[],
): ResolvedPut {
  if (
    input.currencyCode !== undefined &&
    input.currencyCode.trim().toUpperCase() !== existing.currencyCode.trim().toUpperCase()
  ) {
    throw new JournalBalanceError('A saved journal currency cannot be changed');
  }
  return {
    existing,
    oldTransactions,
    lines: input.transactions ?? oldTransactions.map(toPersistenceLine),
    replacesLines: input.transactions !== undefined,
    journalDate: input.journalDate ?? existing.journalDate,
    description: 'description' in input ? input.description : existing.description,
    notes: 'notes' in input ? input.notes : existing.notes,
    displayType: input.displayType ?? (input.transactions ? undefined : existing.displayType),
    currencyCode: existing.currencyCode,
    status: input.status ?? existing.status,
  };
}

async function resolvePut(
  input: PutJournalRequest,
  workplaceId: WorkplaceId,
): Promise<ResolvedPut> {
  if (!input.journalId) return resolveCreate(input);
  const existing = await findActiveJournal(input.journalId, workplaceId);
  if (!existing) throw new Error('Journal not found');
  const oldTransactions = await fetchJournalTransactions(workplaceId, [existing.id]);
  return resolveUpdate(input, existing, oldTransactions);
}

function assignMetadata(
  record: JournalMetadata,
  metadata: JournalPersistenceMetadata,
  now: Date,
): void {
  record.importSource = metadata.importSource;
  record.originalSmsId = metadata.originalSmsId;
  record.originalSmsSender = metadata.originalSmsSender;
  record.originalSmsBody = metadata.originalSmsBody;
  record.metadataJson = metadata.metadataJson;
  record.referenceNumber = referenceNumberFromMetadataJson(metadata.metadataJson);
  record.updatedAt = now;
}

/**
 * Each account's balance after this journal, in rebuild order: every active line dated on or
 * before the journal (new lines sort last by creation time), minus the lines this put replaces.
 */
async function runningBalancesAfter(
  workplaceId: WorkplaceId,
  journalDate: number,
  balance: ValidatedJournal,
  replacedTransactions: readonly Transaction[],
): Promise<Map<AccountId, number>> {
  const accountIds = [...new Set(balance.lines.map(line => line.accountId))];
  const entries = await Promise.all(
    accountIds.map(async accountId => {
      const { accountType } = balance.accountsById.get(accountId)!;
      const precision = balance.precisionByAccountId.get(accountId)!;
      let runningBalance = await transactionRawRepository.getAccountSumRaw(
        workplaceId,
        accountId,
        journalDate,
        accountType,
      );
      for (const replaced of replacedTransactions) {
        if (replaced.accountId === accountId && replaced.transactionDate <= journalDate) {
          runningBalance -= effect(accountType, replaced.transactionType).delta(replaced.amount);
        }
      }
      for (const line of balance.lines) {
        if (line.accountId === accountId) {
          runningBalance = effect(accountType, line.transactionType).apply(
            runningBalance,
            line.amount,
            precision,
          );
        }
      }
      return [accountId, runningBalance] as const;
    }),
  );
  return new Map(entries);
}

export async function preparePutOperations(
  input: PutJournalRequest,
  workplaceId: WorkplaceId,
  session: AccountingWriteSession,
): Promise<PreparedJournalWrite> {
  const put = await resolvePut(input, workplaceId);
  const { existing, oldTransactions, journalDate, status } = put;
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
  const journal =
    existing ??
    journalTables.journals.prepareCreate(record => {
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
    });

  const { metadata } = input;
  const existingMetadata =
    metadata && existing
      ? await journalTables.metadata
          .query(Q.where('journal_id', existing.id), Q.where('workplace_id', workplaceId))
          .fetch()
          .then(rows => rows[0] ?? null)
      : null;

  const auditChanges = existing
    ? {
        before: {
          description: existing.description,
          journalDate: existing.journalDate,
          currencyCode: existing.currencyCode,
          status: existing.status,
          totalAmount: existing.totalAmount,
          transactions: oldTransactions.map(mapTransactionToAudit),
        },
        after: {
          description: put.description,
          journalDate,
          currencyCode: put.currencyCode,
          status,
          totalAmount: balance.totalAmount,
          transactions: lines.map(line =>
            mapTransactionToAudit({
              ...line,
              currencyCode: balance.accountsById.get(line.accountId)?.currencyCode,
            }),
          ),
        },
      }
    : { description: input.description };
  const previousStatus = existing?.status;
  const previousJournalDate = existing?.journalDate;
  const touchesLines =
    put.replacesLines || journalDate !== previousJournalDate || status !== previousStatus;

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

    const operations: Model[] = [journalOp, ...transactionOps];
    if (metadata) {
      operations.push(
        existingMetadata
          ? existingMetadata.prepareUpdate(record => assignMetadata(record, metadata, now))
          : journalTables.metadata.prepareCreate(record => {
              record.journalId = journal.id;
              record.workplaceId = workplaceId;
              record.createdAt = now;
              assignMetadata(record, metadata, now);
            }),
      );
    }
    operations.push(
      auditRepository.prepareLog(
        {
          entityType: 'journal',
          entityId: journal.id,
          action: existing ? AuditAction.UPDATE : AuditAction.CREATE,
          changes: auditChanges,
        },
        workplaceId,
      ),
    );
    return operations;
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
): Promise<JournalPersistenceResult> {
  const prepared = await preparePutOperations(input, workplaceId, session);
  stageModelWrite(session, prepared.ops);
  return prepared.result;
}

export async function stagePost(
  session: AccountingWriteSession,
  journalId: JournalId,
  workplaceId: WorkplaceId,
  postedAt: number,
): Promise<JournalPersistenceResult> {
  const journal = await findActiveJournal(journalId, workplaceId);
  if (!journal) throw new Error('Journal not found');
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
  stageModelWrite(session, () => [
    existingMetadata
      ? existingMetadata.prepareUpdate(record => {
          const currentJson = safeParseJSON<Record<string, unknown>>(record.metadataJson, {});
          record.metadataJson = JSON.stringify({
            ...currentJson,
            [MetadataKeys.ORIGINAL_PLANNED_DATE]: originalPlannedDate,
          });
          record.importSource = MetadataSources.MANUAL_POST;
          record.updatedAt = now;
        })
      : journalTables.metadata.prepareCreate(record => {
          record.journalId = journalId;
          record.workplaceId = workplaceId;
          record.importSource = MetadataSources.MANUAL_POST;
          record.metadataJson = JSON.stringify({
            [MetadataKeys.ORIGINAL_PLANNED_DATE]: originalPlannedDate,
          });
          record.createdAt = now;
          record.updatedAt = now;
        }),
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
    auditRepository.prepareLog(
      {
        entityType: 'journal',
        entityId: journalId,
        action: AuditAction.UPDATE,
        changes: {
          before: { status: JournalStatus.PLANNED, journalDate: originalPlannedDate },
          after: { status: JournalStatus.POSTED, journalDate: postedAt },
        },
      },
      workplaceId,
    ),
  ]);
  return {
    journal,
    affectedAccountIds: new Set(transactions.map(transaction => transaction.accountId)),
    rebuildFromDate: Math.min(originalPlannedDate, postedAt),
    previousStatus: JournalStatus.PLANNED,
    status: JournalStatus.POSTED,
  };
}

function toReversalLine(transaction: Transaction): JournalPersistenceLine {
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
  );
  const reversingJournalId = prepared.result.journal.id;

  stageModelWrite(session, () => [
    ...prepared.ops(),
    originalJournal.prepareUpdate(record => {
      record.reversingJournalId = reversingJournalId;
      record.status = JournalStatus.REVERSED;
      record.updatedAt = new Date();
    }),
    auditRepository.prepareLog(
      {
        entityType: 'journal',
        entityId: originalJournalId,
        action: AuditAction.UPDATE,
        changes: {
          before: { status: originalStatus, reversingJournalId: originalReversingJournalId },
          after: { status: JournalStatus.REVERSED, reversingJournalId },
        },
      },
      workplaceId,
    ),
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
      auditRepository.prepareLog(
        {
          entityType: 'journal',
          entityId: journal.id,
          action: AuditAction.UPDATE,
          changes: {
            before: { description: previousDescription },
            after: { description },
          },
        },
        workplaceId,
      ),
    ]),
  );
  return previousDescriptions;
}
