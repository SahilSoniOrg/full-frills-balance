import type AuditLog from '@/src/data/models/AuditLog';
import Journal from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { mapJournalSnapshotForAudit } from '@/src/data/repositories/journal/journalPersistenceSupport';
import type { ResolvedPut } from '@/src/data/repositories/journal/journalPutResolve';
import type {
  PutJournalRequest,
  ValidatedJournal,
} from '@/src/data/repositories/journal/journalPersistenceTypes';
import { AuditAction, JournalStatus } from '@/src/types/enums';
import { JournalId, WorkplaceId } from '@/src/types/ids';
import { mapTransactionToAudit } from '@/src/types/audit';
import type { AuditEventMetadata, AuditEventType } from '@/src/types/auditEvents';

function putSnapshot(put: ResolvedPut, totalAmount: number) {
  return mapJournalSnapshotForAudit({
    description: put.description,
    notes: put.notes,
    journalDate: put.journalDate,
    currencyCode: put.currencyCode,
    status: put.status,
    totalAmount,
  });
}

/** Before/after payload for a journal create or update audit entry. */
export function buildPutAuditChanges(args: {
  existing: Journal | null;
  put: ResolvedPut;
  balance: ValidatedJournal;
  oldTransactions: readonly Transaction[];
}): { before?: Record<string, unknown>; after: Record<string, unknown> } {
  const { existing, put, balance, oldTransactions } = args;
  const after = {
    ...putSnapshot(put, balance.totalAmount),
    transactions: balance.lines.map(line =>
      mapTransactionToAudit({
        ...line,
        currencyCode: balance.accountsById.get(line.accountId)?.currencyCode,
      }),
    ),
  };
  if (!existing) return { after };
  return {
    before: {
      ...mapJournalSnapshotForAudit(existing),
      transactions: oldTransactions.map(mapTransactionToAudit),
    },
    after,
  };
}

function resolvePutEventType(
  existing: Journal | null,
  input: PutJournalRequest,
  auditMetadata?: AuditEventMetadata,
): AuditEventType {
  return (
    auditMetadata?.eventType ??
    (existing
      ? 'journal.updated'
      : input.plannedPaymentId
        ? 'journal.planned_payment_generated'
        : 'journal.created')
  );
}

export function preparePutAuditLog(args: {
  existing: Journal | null;
  input: PutJournalRequest;
  put: ResolvedPut;
  balance: ValidatedJournal;
  oldTransactions: readonly Transaction[];
  journalId: JournalId;
  workplaceId: WorkplaceId;
  auditMetadata?: AuditEventMetadata;
}): AuditLog {
  const {
    existing,
    input,
    put,
    balance,
    oldTransactions,
    journalId,
    workplaceId,
    auditMetadata,
  } = args;
  return auditRepository.prepareLog(
    {
      entityType: 'journal',
      entityId: journalId,
      eventType: resolvePutEventType(existing, input, auditMetadata),
      source: auditMetadata?.source,
      correlationId: auditMetadata?.correlationId,
      revertsLogId: auditMetadata?.revertsLogId,
      undoable:
        auditMetadata?.undoable ?? (!existing && input.plannedPaymentId ? false : undefined),
      action: existing ? AuditAction.UPDATE : AuditAction.CREATE,
      changes: buildPutAuditChanges({ existing, put, balance, oldTransactions }),
    },
    workplaceId,
  );
}

export function preparePostAuditLog(args: {
  journalId: JournalId;
  originalPlannedDate: number;
  postedAt: number;
  workplaceId: WorkplaceId;
  auditMetadata?: AuditEventMetadata;
}): AuditLog {
  const { journalId, originalPlannedDate, postedAt, workplaceId, auditMetadata } = args;
  return auditRepository.prepareLog(
    {
      entityType: 'journal',
      entityId: journalId,
      eventType: auditMetadata?.eventType ?? 'journal.posted',
      source: auditMetadata?.source,
      correlationId: auditMetadata?.correlationId,
      revertsLogId: auditMetadata?.revertsLogId,
      undoable: auditMetadata?.undoable,
      action: AuditAction.UPDATE,
      changes: {
        before: { status: JournalStatus.PLANNED, journalDate: originalPlannedDate },
        after: { status: JournalStatus.POSTED, journalDate: postedAt },
      },
    },
    workplaceId,
  );
}

export function prepareReverseAuditLog(args: {
  originalJournalId: JournalId;
  originalStatus: JournalStatus;
  originalReversingJournalId?: JournalId;
  reversingJournalId: JournalId;
  workplaceId: WorkplaceId;
}): AuditLog {
  const {
    originalJournalId,
    originalStatus,
    originalReversingJournalId,
    reversingJournalId,
    workplaceId,
  } = args;
  return auditRepository.prepareLog(
    {
      entityType: 'journal',
      entityId: originalJournalId,
      eventType: 'journal.reversed',
      action: AuditAction.UPDATE,
      changes: {
        before: { status: originalStatus, reversingJournalId: originalReversingJournalId },
        after: { status: JournalStatus.REVERSED, reversingJournalId },
      },
      undoable: false,
    },
    workplaceId,
  );
}

export function prepareRenameAuditLog(args: {
  journalId: JournalId;
  previousDescription?: string;
  description: string;
  workplaceId: WorkplaceId;
}): AuditLog {
  const { journalId, previousDescription, description, workplaceId } = args;
  return auditRepository.prepareLog(
    {
      entityType: 'journal',
      entityId: journalId,
      eventType: 'journal.renamed',
      action: AuditAction.UPDATE,
      changes: {
        before: { description: previousDescription },
        after: { description },
      },
    },
    workplaceId,
  );
}
