import { MetadataKeys } from '@/src/constants/ledger-constants';
import {
  stageJournalCaptureMetadataWrite,
  stageModelWrite,
  type AccountingWriteSession,
} from '@/src/data/repositories/AccountingWriteSession';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { applyJournalMetadataProjections } from '@/src/data/repositories/journal/journalMetadataProjections';
import {
  fetchJournalTransactions,
  findActiveJournal,
  journalTables,
  mapJournalSnapshotForAudit,
  nextDeletionTimestamp,
  prepareDeleteAudit,
  prepareDeletedAt,
  toPersistenceLine,
  validateJournal,
} from '@/src/data/repositories/journal/journalPersistenceSupport';
import type { JournalPersistenceResult } from '@/src/data/repositories/journal/journalPersistenceTypes';
import {
  decidePlanAttachUpgrade,
  resolvePlanCategoryCounter,
  type PlanAttachUpgradeDecision,
} from '@/src/domain/planned-payment/planAttachEligibility';
import {
  readCaptureMetadata,
  reviewStateFor,
  withCaptureMetadata,
  type CaptureMetadata,
} from '@/src/domain/transaction-intelligence/captureMetadata';
import Journal from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';
import { AccountType, AuditAction, JournalStatus } from '@/src/types/enums';
import { AccountId, JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import { mapTransactionToAudit } from '@/src/types/audit';
import type { AuditEventMetadata, AuditJsonObject } from '@/src/types/auditEvents';
import { REVERT_CONFLICT_MESSAGE } from '@/src/domain/audit/revertErrors';
import { safeParseJSON } from '@/src/utils/serialization';
import { stableAuditJson } from '@/src/utils/stableAuditJson';
import { Q } from '@nozbe/watermelondb';

export const PLAN_ATTACH_AUDIT_EVENT = 'journal.planned_payment_attached' as const;
export const PLAN_ATTACH_AUDIT_SOURCE = 'evidence_driven';
/** Audit source for observation hard-match settle/link (same evidence_driven lineage). */
export const EVIDENCE_SETTLE_AUDIT_SOURCE = 'evidence_driven';

export interface PlanAttachInput {
  captureJournalId: JournalId;
  plannedPaymentId: PlannedPaymentId;
  plannedJournalId: JournalId;
  /** Occurrence day written as ORIGINAL_PLANNED_DATE. */
  occurrenceDay: number;
  /** Required when the plan counter-account is an asset/liability. */
  confirmStructuralConflict?: boolean;
  observationId?: string;
  planName?: string;
}

export interface PlanAttachResult extends JournalPersistenceResult {
  upgraded: boolean;
  upgrade: PlanAttachUpgradeDecision;
  retiredPlannedJournalId: JournalId;
}

function readMetadataObject(json: string | undefined): Record<string, unknown> {
  return safeParseJSON<Record<string, unknown>>(json, {}) ?? {};
}

function auditTransactions(transactions: readonly Transaction[]) {
  return transactions.map(transaction =>
    mapTransactionToAudit({
      accountId: transaction.accountId,
      amount: transaction.amount,
      transactionType: transaction.transactionType,
      notes: transaction.notes ?? undefined,
      exchangeRate: transaction.exchangeRate ?? undefined,
      currencyCode: transaction.currencyCode ?? undefined,
    }),
  );
}

function upgradedCapture(
  capture: CaptureMetadata,
  decision: Extract<PlanAttachUpgradeDecision, { kind: 'rewrite' }>,
  now: number,
): CaptureMetadata {
  const allocations = [
    {
      accountId: decision.counter.accountId,
      amount: decision.allocation.amount,
      transactionType: decision.allocation.transactionType,
      currencyCode: decision.counter.currencyCode,
      origin: 'system' as const,
      confirmedAt: now,
    },
  ];
  return {
    ...capture,
    // Preserve merchant + sources; plan ownership is the category line only.
    allocations,
    reviewState: reviewStateFor(allocations, capture.economicKind),
  };
}

/**
 * Attaches a capture journal to a Planned Payment occurrence inside the caller's
 * accounting session: sets the plan link, claims the day, retires the PLANNED
 * journal, and upgrades Uncategorized when eligible. One undoable audit event.
 */
export async function stagePlanAttach(
  session: AccountingWriteSession,
  workplaceId: WorkplaceId,
  input: PlanAttachInput,
  auditMetadata?: AuditEventMetadata,
): Promise<PlanAttachResult> {
  const captureJournal = await findActiveJournal(input.captureJournalId, workplaceId);
  if (!captureJournal) throw new Error('Capture journal not found');
  if (captureJournal.status !== JournalStatus.POSTED) {
    throw new Error('Only a posted capture journal can attach to a planned payment occurrence.');
  }
  if (captureJournal.plannedPaymentId) {
    throw new Error('Capture journal is already linked to a planned payment.');
  }

  const plannedJournal = await findActiveJournal(input.plannedJournalId, workplaceId);
  if (!plannedJournal) throw new Error('Planned occurrence journal not found');
  if (plannedJournal.status !== JournalStatus.PLANNED) {
    throw new Error('Occurrence journal must be PLANNED to retire during plan attach.');
  }
  if (plannedJournal.plannedPaymentId !== input.plannedPaymentId) {
    throw new Error('Occurrence journal does not belong to the planned payment.');
  }

  const payment = await journalTables.plannedPayments.find(input.plannedPaymentId);
  if (payment.workplaceId !== workplaceId || payment.deletedAt) {
    throw new Error('Planned payment not found');
  }

  const [captureTransactions, plannedTransactions, metadataRows, accounts] = await Promise.all([
    fetchJournalTransactions(workplaceId, [captureJournal.id]),
    fetchJournalTransactions(workplaceId, [plannedJournal.id], { includeDeleted: true }),
    journalTables.metadata
      .query(Q.where('journal_id', captureJournal.id), Q.where('workplace_id', workplaceId))
      .fetch(),
    journalTables.accounts
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('id', Q.oneOf([payment.fromAccountId, payment.toAccountId])),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch(),
  ]);
  const existingMetadata =
    metadataRows.find(row => readCaptureMetadata(row.metadataJson)) ?? metadataRows[0] ?? null;
  const capture = readCaptureMetadata(existingMetadata?.metadataJson);
  const fromAccount = accounts.find(account => account.id === payment.fromAccountId);
  const toAccount = accounts.find(account => account.id === payment.toAccountId);
  if (!fromAccount || !toAccount) throw new Error('Planned payment accounts not found');

  const planCounter = resolvePlanCategoryCounter(fromAccount, toAccount);
  const lineAccounts = await journalTables.accounts
    .query(
      Q.where('workplace_id', workplaceId),
      Q.where('id', Q.oneOf([...new Set(captureTransactions.map(line => line.accountId))])),
      Q.where('deleted_at', Q.eq(null)),
    )
    .fetch();
  const accountsById = new Map(lineAccounts.map(account => [account.id, account]));
  const upgrade = decidePlanAttachUpgrade({
    capture,
    description: captureJournal.description,
    planCounter,
    lines: captureTransactions.map(line => {
      const account = accountsById.get(line.accountId);
      if (!account) throw new Error('Capture journal account not found');
      return {
        accountId: line.accountId,
        amount: line.amount,
        transactionType: line.transactionType,
        currencyCode: line.currencyCode ?? account.currencyCode,
        accountType: account.accountType,
      };
    }),
  });

  if (upgrade.kind === 'link_only' && upgrade.reason === 'structural_conflict') {
    if (!input.confirmStructuralConflict) {
      throw new Error(
        'Plan counter-account is an asset or liability. Confirm in review before attaching.',
      );
    }
  }

  const planName = input.planName ?? payment.name;
  const now = new Date();
  const shouldRewrite = upgrade.kind === 'rewrite';
  const nextDescription =
    shouldRewrite && upgrade.replaceDescription ? planName : captureJournal.description;
  const nextCapture =
    shouldRewrite && capture ? upgradedCapture(capture, upgrade, now.getTime()) : capture;

  const nextLines = shouldRewrite
    ? captureTransactions.map(line => {
        const account = accountsById.get(line.accountId)!;
        if (
          account.accountType !== AccountType.EXPENSE &&
          account.accountType !== AccountType.INCOME
        ) {
          return toPersistenceLine(line);
        }
        return {
          ...toPersistenceLine(line),
          accountId: upgrade.counter.accountId,
          currencyCode: upgrade.counter.currencyCode,
        };
      })
    : captureTransactions.map(toPersistenceLine);

  const validated = await validateJournal({
    currencyCode: captureJournal.currencyCode,
    status: JournalStatus.POSTED,
    workplaceId,
    session,
    transactions: nextLines,
  });

  const beforeMetadataJson = existingMetadata?.metadataJson;
  const metadataObject = {
    ...readMetadataObject(beforeMetadataJson),
    [MetadataKeys.ORIGINAL_PLANNED_DATE]: input.occurrenceDay,
  };
  const afterMetadataJson = nextCapture
    ? withCaptureMetadata(JSON.stringify(metadataObject), nextCapture)
    : JSON.stringify(metadataObject);

  const activePlannedTransactions = plannedTransactions.filter(
    transaction => !transaction.deletedAt,
  );
  const deletedAt = nextDeletionTimestamp([plannedJournal, ...plannedTransactions]);
  const correlationId = auditMetadata?.correlationId;

  stageJournalCaptureMetadataWrite(
    session,
    workplaceId,
    captureJournal.id,
    existingMetadata?.id ?? 'create-metadata',
    afterMetadataJson,
    metadataJson => [
      existingMetadata
        ? existingMetadata.prepareUpdate(record => {
            record.metadataJson = metadataJson;
            applyJournalMetadataProjections(record);
            record.updatedAt = now;
          })
        : journalTables.metadata.prepareCreate(record => {
            record.journalId = captureJournal.id;
            record.workplaceId = workplaceId;
            record.metadataJson = metadataJson ?? afterMetadataJson;
            applyJournalMetadataProjections(record);
            record.createdAt = now;
            record.updatedAt = now;
          }),
    ],
  );

  const beforeSnapshot = {
    ...mapJournalSnapshotForAudit(captureJournal),
    plannedPaymentId: null,
    transactions: auditTransactions(captureTransactions),
    captureMetadataJson: beforeMetadataJson ?? null,
  };
  const afterSnapshot = {
    ...mapJournalSnapshotForAudit({
      description: nextDescription,
      notes: captureJournal.notes,
      journalDate: captureJournal.journalDate,
      currencyCode: captureJournal.currencyCode,
      status: JournalStatus.POSTED,
      totalAmount: validated.totalAmount,
    }),
    plannedPaymentId: input.plannedPaymentId,
    transactions: nextLines.map(line =>
      mapTransactionToAudit({
        ...line,
        currencyCode: validated.accountsById.get(line.accountId)?.currencyCode,
      }),
    ),
    captureMetadataJson: afterMetadataJson,
    originalPlannedDate: input.occurrenceDay,
    retiredPlannedJournalId: plannedJournal.id,
    retiredPlannedJournalDeletedAt: deletedAt.getTime(),
  };

  stageModelWrite(session, () => {
    const ops = [
      captureJournal.prepareUpdate(record => {
        record.plannedPaymentId = input.plannedPaymentId;
        record.description = nextDescription;
        record.totalAmount = validated.totalAmount;
        record.transactionCount = nextLines.length;
        record.displayType = validated.displayType;
        record.updatedAt = now;
      }),
      ...(shouldRewrite
        ? [
            ...captureTransactions.map(transaction => prepareDeletedAt(transaction, now, now)),
            ...nextLines.map(line =>
              journalTables.transactions.prepareCreate(record => {
                record.journalId = captureJournal.id;
                record.workplaceId = workplaceId;
                record.accountId = line.accountId;
                record.amount = line.amount;
                record.transactionType = line.transactionType;
                record.currencyCode = validated.accountsById.get(line.accountId)!.currencyCode;
                record.transactionDate = captureJournal.journalDate;
                record.notes = line.notes;
                record.exchangeRate = line.exchangeRate;
                record.runningBalance = null;
                record.createdAt = now;
                record.updatedAt = now;
              }),
            ),
          ]
        : []),
      prepareDeletedAt(plannedJournal, deletedAt, deletedAt),
      ...activePlannedTransactions.map(transaction =>
        prepareDeletedAt(transaction, deletedAt, deletedAt),
      ),
      prepareDeleteAudit(plannedJournal, activePlannedTransactions, deletedAt, workplaceId, {
        source: auditMetadata?.source ?? PLAN_ATTACH_AUDIT_SOURCE,
        correlationId,
        undoable: false,
        eventType: 'journal.deleted',
      }),
      auditRepository.prepareLog(
        {
          entityType: 'journal',
          entityId: captureJournal.id,
          eventType: PLAN_ATTACH_AUDIT_EVENT,
          source: auditMetadata?.source ?? PLAN_ATTACH_AUDIT_SOURCE,
          correlationId,
          revertsLogId: auditMetadata?.revertsLogId,
          undoable: auditMetadata?.undoable ?? true,
          action: AuditAction.UPDATE,
          changes: {
            before: beforeSnapshot,
            after: afterSnapshot,
            plannedPaymentId: input.plannedPaymentId,
            upgraded: shouldRewrite,
            ...(input.observationId ? { observationId: input.observationId } : {}),
            ...(upgrade.kind === 'link_only' ? { linkOnlyReason: upgrade.reason } : {}),
          },
        },
        workplaceId,
      ),
    ];
    return ops;
  });

  const affected = new Set<AccountId>([
    ...captureTransactions.map(transaction => transaction.accountId),
    ...nextLines.map(line => line.accountId),
    ...activePlannedTransactions.map(transaction => transaction.accountId),
  ]);

  return {
    journal: captureJournal,
    upgraded: shouldRewrite,
    upgrade,
    retiredPlannedJournalId: plannedJournal.id,
    previousStatus: captureJournal.status,
    status: JournalStatus.POSTED,
    affectedAccountIds: affected,
    rebuildFromDate: Math.min(
      captureJournal.journalDate,
      plannedJournal.journalDate,
      ...captureTransactions.map(transaction => transaction.transactionDate),
      ...activePlannedTransactions.map(transaction => transaction.transactionDate),
    ),
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function matchesAuditValue(actual: unknown, expected: unknown): boolean {
  return stableAuditJson(actual) === stableAuditJson(expected);
}

/**
 * Undoes a plan-attach audit: clears the plan link, restores lines/description/
 * capture review metadata, and restores the retired PLANNED journal.
 */
export async function stageUndoPlanAttach(
  session: AccountingWriteSession,
  workplaceId: WorkplaceId,
  captureJournalId: JournalId,
  changes: { before?: AuditJsonObject; after?: AuditJsonObject },
  auditMetadata?: AuditEventMetadata,
): Promise<JournalPersistenceResult> {
  const before = asRecord(changes.before);
  const after = asRecord(changes.after);
  if (!before || !after) throw new Error(REVERT_CONFLICT_MESSAGE);

  const captureJournal = await findActiveJournal(captureJournalId, workplaceId);
  if (!captureJournal) throw new Error('Journal not found');

  const currentTransactions = await fetchJournalTransactions(workplaceId, [captureJournalId]);
  const [metadata] = await journalTables.metadata
    .query(Q.where('journal_id', captureJournalId), Q.where('workplace_id', workplaceId))
    .fetch();

  const currentAfter = {
    description: captureJournal.description ?? null,
    notes: captureJournal.notes ?? null,
    journalDate: captureJournal.journalDate,
    currencyCode: captureJournal.currencyCode,
    status: captureJournal.status,
    totalAmount: captureJournal.totalAmount,
    plannedPaymentId: captureJournal.plannedPaymentId ?? null,
    transactions: auditTransactions(currentTransactions).map(line => ({
      accountId: line.accountId,
      amount: line.amount,
      transactionType: line.transactionType,
      notes: line.notes ?? null,
      exchangeRate: line.exchangeRate ?? null,
      currencyCode: line.currencyCode ?? null,
    })),
    captureMetadataJson: metadata?.metadataJson ?? null,
  };
  for (const field of [
    'description',
    'notes',
    'journalDate',
    'currencyCode',
    'status',
    'totalAmount',
    'plannedPaymentId',
    'transactions',
    'captureMetadataJson',
  ] as const) {
    if (!Object.prototype.hasOwnProperty.call(after, field)) continue;
    const actual = currentAfter[field];
    const expected = after[field];
    const matches =
      field === 'transactions' && Array.isArray(actual) && Array.isArray(expected)
        ? matchesAuditValue(
            [...actual].sort((left, right) =>
              stableAuditJson(left).localeCompare(stableAuditJson(right)),
            ),
            [...expected].sort((left, right) =>
              stableAuditJson(left).localeCompare(stableAuditJson(right)),
            ),
          )
        : matchesAuditValue(actual, expected);
    if (!matches) throw new Error(REVERT_CONFLICT_MESSAGE);
  }

  const retiredId =
    typeof after.retiredPlannedJournalId === 'string'
      ? (after.retiredPlannedJournalId as JournalId)
      : undefined;
  const retiredDeletedAt =
    typeof after.retiredPlannedJournalDeletedAt === 'number'
      ? after.retiredPlannedJournalDeletedAt
      : undefined;
  if (!retiredId || retiredDeletedAt === undefined) throw new Error(REVERT_CONFLICT_MESSAGE);

  let plannedJournal: Journal;
  try {
    plannedJournal = await journalTables.journals.find(retiredId);
  } catch {
    throw new Error(REVERT_CONFLICT_MESSAGE);
  }
  if (
    plannedJournal.workplaceId !== workplaceId ||
    plannedJournal.deletedAt?.getTime() !== retiredDeletedAt
  ) {
    throw new Error(REVERT_CONFLICT_MESSAGE);
  }

  const plannedTransactions = await fetchJournalTransactions(workplaceId, [retiredId], {
    includeDeleted: true,
  });
  const restorePlannedTransactions = plannedTransactions.filter(
    transaction => transaction.deletedAt?.getTime() === retiredDeletedAt,
  );

  const beforeTransactions = Array.isArray(before.transactions)
    ? (before.transactions as ReturnType<typeof auditTransactions>)
    : null;
  if (!beforeTransactions) throw new Error(REVERT_CONFLICT_MESSAGE);

  const beforeMetadataJson =
    typeof before.captureMetadataJson === 'string'
      ? before.captureMetadataJson
      : before.captureMetadataJson === null
        ? undefined
        : undefined;
  const restoredDescription =
    before.description === null || before.description === undefined
      ? undefined
      : String(before.description);
  const restoredNotes =
    before.notes === null || before.notes === undefined ? undefined : String(before.notes);
  const restoredLines = beforeTransactions.map(line => ({
    accountId: line.accountId as AccountId,
    amount: Number(line.amount),
    transactionType: line.transactionType as Transaction['transactionType'],
    notes: typeof line.notes === 'string' ? line.notes : undefined,
    exchangeRate: typeof line.exchangeRate === 'number' ? line.exchangeRate : undefined,
    currencyCode: typeof line.currencyCode === 'string' ? line.currencyCode : undefined,
  }));

  const validated = await validateJournal({
    currencyCode: String(before.currencyCode ?? captureJournal.currencyCode),
    status: JournalStatus.POSTED,
    workplaceId,
    session,
    transactions: restoredLines,
  });

  const now = new Date();
  if (metadata || beforeMetadataJson !== undefined) {
    const restoreJson = beforeMetadataJson;
    stageJournalCaptureMetadataWrite(
      session,
      workplaceId,
      captureJournalId,
      metadata?.id ?? 'create-metadata',
      restoreJson,
      metadataJson => {
        if (!metadata && restoreJson === undefined) return [];
        return [
          metadata
            ? metadata.prepareUpdate(record => {
                record.metadataJson = metadataJson ?? restoreJson ?? '{}';
                applyJournalMetadataProjections(record);
                record.updatedAt = now;
              })
            : journalTables.metadata.prepareCreate(record => {
                record.journalId = captureJournalId;
                record.workplaceId = workplaceId;
                record.metadataJson = metadataJson ?? restoreJson ?? '{}';
                applyJournalMetadataProjections(record);
                record.createdAt = now;
                record.updatedAt = now;
              }),
        ];
      },
    );
  }

  stageModelWrite(session, () => [
    captureJournal.prepareUpdate(record => {
      // Optional FK: null clears the Planned Payment link on undo.
      (record as { plannedPaymentId?: PlannedPaymentId | null }).plannedPaymentId = null;
      record.description = restoredDescription;
      record.notes = restoredNotes;
      record.totalAmount = validated.totalAmount;
      record.transactionCount = restoredLines.length;
      record.displayType = validated.displayType;
      record.updatedAt = now;
    }),
    ...currentTransactions.map(transaction => prepareDeletedAt(transaction, now, now)),
    ...restoredLines.map(line =>
      journalTables.transactions.prepareCreate(record => {
        record.journalId = captureJournalId;
        record.workplaceId = workplaceId;
        record.accountId = line.accountId;
        record.amount = line.amount;
        record.transactionType = line.transactionType;
        record.currencyCode = validated.accountsById.get(line.accountId)!.currencyCode;
        record.transactionDate = captureJournal.journalDate;
        record.notes = line.notes;
        record.exchangeRate = line.exchangeRate;
        record.runningBalance = null;
        record.createdAt = now;
        record.updatedAt = now;
      }),
    ),
    prepareDeletedAt(plannedJournal, undefined, now),
    ...restorePlannedTransactions.map(transaction => prepareDeletedAt(transaction, undefined, now)),
    auditRepository.prepareLog(
      {
        entityType: 'journal',
        entityId: captureJournalId,
        eventType: 'journal.reverted',
        source: 'app',
        correlationId: auditMetadata?.correlationId,
        revertsLogId: auditMetadata?.revertsLogId,
        undoable: false,
        action: AuditAction.UPDATE,
        changes: {
          before: after,
          after: before,
        },
      },
      workplaceId,
    ),
  ]);

  return {
    journal: captureJournal,
    previousStatus: captureJournal.status,
    status: JournalStatus.POSTED,
    affectedAccountIds: new Set<AccountId>([
      ...currentTransactions.map(transaction => transaction.accountId),
      ...restoredLines.map(line => line.accountId),
      ...restorePlannedTransactions.map(transaction => transaction.accountId),
    ]),
    rebuildFromDate: Math.min(
      captureJournal.journalDate,
      plannedJournal.journalDate,
      ...currentTransactions.map(transaction => transaction.transactionDate),
      ...restorePlannedTransactions.map(transaction => transaction.transactionDate),
    ),
  };
}
