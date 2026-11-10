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
import type { AuditEventMetadata } from '@/src/types/auditEvents';
import type { WorkplaceId } from '@/src/types/ids';

export type { PlanAttachInput, PlanAttachResult };

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
