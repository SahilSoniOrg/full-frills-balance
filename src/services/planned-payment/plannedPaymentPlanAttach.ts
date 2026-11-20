import {
  runAccountingWriteSession,
  type AccountingWriteSession,
} from '@/src/data/repositories/AccountingWriteSession';
import { generator } from '@/src/utils/idGenerator';
import {
  journalPersistenceRepository,
  type PlanAttachInput,
  type PlanAttachResult,
} from '@/src/data/repositories/journal/JournalPersistenceRepository';
import { PLAN_ATTACH_AUDIT_SOURCE } from '@/src/data/repositories/journal/journalPlanAttachOperations';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import type Journal from '@/src/data/models/Journal';
import type PlannedPayment from '@/src/data/models/PlannedPayment';
import { buildPlannedPaymentTransferLines } from '@/src/services/planned-payment/plannedPaymentJournalLines';
import { requirePlannedPayment } from '@/src/services/planned-payment/plannedPaymentWorkplace';
import {
  endOfLocalDay,
  normalizeToStartOfDay,
} from '@/src/services/planned-payment/plannedPaymentRecurrence';
import { JournalStatus } from '@/src/types/enums';
import { journalPlannedQueries } from '@/src/data/repositories/journal/JournalPlannedQueries';
import type { AuditEventMetadata } from '@/src/types/auditEvents';
import type { JournalId, WorkplaceId } from '@/src/types/ids';

export type { PlanAttachInput, PlanAttachResult };

export type LinkCaptureToPlannedOccurrenceInput = Omit<PlanAttachInput, 'plannedJournalId'> & {
  /** When omitted, a PLANNED twin is minted then retired by attach. */
  plannedJournalId?: JournalId;
};

/** Creates the undoable occurrence twin already retired in the current write batch. */
export async function stageRetiredPlannedOccurrenceTwin(
  session: AccountingWriteSession,
  payment: PlannedPayment,
  occurrenceDay: number,
  correlationId: string,
): Promise<Journal> {
  if (!payment.toAccountId) {
    throw new Error('Planned payment is missing a destination account for attach.');
  }
  const deletedAt = Date.now();
  const minted = await journalPersistenceService.putInSession(
    session,
    {
      journalDate: normalizeToStartOfDay(occurrenceDay),
      description: payment.name,
      currencyCode: payment.currencyCode,
      transactions: buildPlannedPaymentTransferLines(payment),
      status: JournalStatus.PLANNED,
      plannedPaymentId: payment.id,
      initialDeletedAt: deletedAt,
    },
    payment.workplaceId,
    { source: 'system', correlationId, undoable: false },
  );
  return minted.journal;
}

/** Attach inside a caller-owned accounting session. */
export async function attachCaptureJournalToPlannedOccurrenceInSession(
  session: AccountingWriteSession,
  workplaceId: WorkplaceId,
  input: PlanAttachInput,
  auditMetadata?: AuditEventMetadata,
): Promise<PlanAttachResult> {
  const dayStart = normalizeToStartOfDay(input.occurrenceDay);
  const current = await journalPlannedQueries.findOccurrenceJournals(
    workplaceId,
    input.plannedPaymentId,
    dayStart,
    endOfLocalDay(dayStart),
  );
  if (current.kind === 'settled') {
    throw new Error('Planned payment occurrence is already settled.');
  }
  if (
    current.kind === 'planned' &&
    (current.journals.length !== 1 ||
      !current.journals.some(journal => journal.id === input.plannedJournalId))
  ) {
    throw new Error('Planned payment occurrence changed before attach.');
  }
  if (current.kind === 'none' && !input.stagedPlannedJournal) {
    throw new Error('Planned payment occurrence changed before attach.');
  }
  return journalPersistenceRepository.attachToPlannedOccurrenceInSession(
    session,
    workplaceId,
    { ...input, occurrenceDay: dayStart },
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
): Promise<{ id: JournalId; journal?: Journal }> {
  if (input.plannedJournalId) return { id: input.plannedJournalId };
  const dayStart = normalizeToStartOfDay(input.occurrenceDay);
  const current = await journalPlannedQueries.findOccurrenceJournals(
    workplaceId,
    input.plannedPaymentId,
    dayStart,
    endOfLocalDay(dayStart),
  );
  if (current.kind === 'settled') {
    throw new Error('Planned payment occurrence is already settled.');
  }
  if (current.kind === 'planned') {
    if (current.journals.length !== 1) {
      throw new Error('Planned payment occurrence has multiple scheduled journals.');
    }
    return { id: current.journals[0].id };
  }
  const payment = await requirePlannedPayment(workplaceId, input.plannedPaymentId);
  const staged = await stageRetiredPlannedOccurrenceTwin(
    session,
    payment,
    input.occurrenceDay,
    correlationId,
  );
  return { id: staged.id, journal: staged };
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
    const plannedJournal = await resolvePlannedJournalIdForAttach(
      session,
      workplaceId,
      input,
      correlationId,
    );
    return attachCaptureJournalToPlannedOccurrenceInSession(
      session,
      workplaceId,
      {
        ...input,
        plannedJournalId: plannedJournal.id,
        ...(plannedJournal.journal
          ? {
              stagedPlannedJournal: plannedJournal.journal,
            }
          : {}),
      },
      { ...auditMetadata, correlationId },
    );
  });
  return result;
}
