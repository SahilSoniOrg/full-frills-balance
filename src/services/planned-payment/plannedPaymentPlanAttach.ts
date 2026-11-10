import {
  runAccountingWriteSession,
  type AccountingWriteSession,
} from '@/src/data/repositories/AccountingWriteSession';
import { generator } from '@/src/data/database/idGenerator';
import {
  journalPersistenceRepository,
  type PlanAttachInput,
  type PlanAttachResult,
} from '@/src/data/repositories/journal/JournalPersistenceRepository';
import { PLAN_ATTACH_AUDIT_SOURCE } from '@/src/data/repositories/journal/journalPlanAttachOperations';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import { buildPlannedPaymentTransferLines } from '@/src/services/planned-payment/plannedPaymentJournalLines';
import { requirePlannedPayment } from '@/src/services/planned-payment/plannedPaymentWorkplace';
import { normalizeToStartOfDay } from '@/src/services/planned-payment/plannedPaymentRecurrence';
import { JournalStatus } from '@/src/types/enums';
import type { AuditEventMetadata } from '@/src/types/auditEvents';
import type { JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';

export type { PlanAttachInput, PlanAttachResult };

export type LinkCaptureToPlannedOccurrenceInput = Omit<PlanAttachInput, 'plannedJournalId'> & {
  /** When omitted, a PLANNED twin is minted then retired by attach. */
  plannedJournalId?: JournalId;
};

/** Attach inside a caller-owned session; pair with afterAtomicWriteCommit after commit. */
export function attachCaptureJournalToPlannedOccurrenceInSession(
  session: AccountingWriteSession,
  workplaceId: WorkplaceId,
  input: PlanAttachInput,
  auditMetadata?: AuditEventMetadata,
): Promise<PlanAttachResult> {
  return journalPersistenceRepository.attachToPlannedOccurrenceInSession(
    session,
    workplaceId,
    input,
    {
      source: PLAN_ATTACH_AUDIT_SOURCE,
      undoable: true,
      ...auditMetadata,
      correlationId: auditMetadata?.correlationId ?? generator(),
    },
  );
}

async function resolvePlannedJournalIdForAttach(
  session: AccountingWriteSession,
  workplaceId: WorkplaceId,
  input: LinkCaptureToPlannedOccurrenceInput,
  correlationId: string,
): Promise<JournalId> {
  if (input.plannedJournalId) return input.plannedJournalId;
  const payment = await requirePlannedPayment(workplaceId, input.plannedPaymentId);
  if (!payment.toAccountId) {
    throw new Error('Planned payment is missing a destination account for attach.');
  }
  const minted = await journalPersistenceService.putInSession(
    session,
    {
      journalDate: normalizeToStartOfDay(input.occurrenceDay),
      description: payment.name,
      currencyCode: payment.currencyCode,
      transactions: buildPlannedPaymentTransferLines(payment),
      status: JournalStatus.PLANNED,
      plannedPaymentId: payment.id as PlannedPaymentId,
    },
    workplaceId,
    { source: 'system', correlationId, undoable: false },
  );
  return minted.journal.id;
}

/** One-shot attach: capture journal claims the occurrence and retires the PLANNED journal. */
export async function attachCaptureJournalToPlannedOccurrence(
  workplaceId: WorkplaceId,
  input: PlanAttachInput,
  auditMetadata?: AuditEventMetadata,
): Promise<PlanAttachResult> {
  const result = await runAccountingWriteSession(session =>
    attachCaptureJournalToPlannedOccurrenceInSession(session, workplaceId, input, auditMetadata),
  );
  journalPersistenceService.afterAtomicWriteCommit([result], workplaceId);
  return result;
}

/**
 * User "link instead" path: attach a capture journal to an occurrence, minting a
 * PLANNED twin first when the occurrence has not been generated yet.
 */
export async function linkCaptureJournalToPlannedOccurrence(
  workplaceId: WorkplaceId,
  input: LinkCaptureToPlannedOccurrenceInput,
  auditMetadata?: AuditEventMetadata,
): Promise<PlanAttachResult> {
  const correlationId = auditMetadata?.correlationId ?? generator();
  const result = await runAccountingWriteSession(async session => {
    const plannedJournalId = await resolvePlannedJournalIdForAttach(
      session,
      workplaceId,
      input,
      correlationId,
    );
    return attachCaptureJournalToPlannedOccurrenceInSession(
      session,
      workplaceId,
      { ...input, plannedJournalId },
      { ...auditMetadata, correlationId },
    );
  });
  journalPersistenceService.afterAtomicWriteCommit([result], workplaceId);
  return result;
}
