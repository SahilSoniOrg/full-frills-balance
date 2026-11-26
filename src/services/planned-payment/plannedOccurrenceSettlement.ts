import type { AccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import { journalPlannedQueries } from '@/src/data/repositories/journal/JournalPlannedQueries';
import { requirePlannedPayment } from '@/src/services/planned-payment/plannedPaymentWorkplace';
import { JournalStatus, PlannedPaymentStatus } from '@/src/types/enums';
import { PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import { generator } from '@/src/utils/idGenerator';
import { normalizeToStartOfDay } from '@/src/services/planned-payment/plannedPaymentRecurrence';
import type { PlannedPaymentFxQuote } from './plannedPaymentFx';
import { personQueryRepository } from '@/src/data/repositories/people';
import { autoSettlePersonInSession } from '@/src/services/people/peopleSettlementCommands';
import { applyOccurrenceAction } from './plannedOccurrenceActionApplication';
import { findPlanAttachCandidateForOccurrence } from './plannedOccurrenceCaptureMatching';
import { advanceSchedule } from './plannedOccurrenceScheduleAdvance';
import {
  assertActive,
  occurrenceDay,
  type PlannedOccurrenceAction,
  type PlannedOccurrenceSettlement,
} from './plannedOccurrenceSettlementTypes';
import { resolveOccurrenceTransition } from './plannedOccurrenceTransition';

export type {
  PlanCaptureAttachCandidate,
  PlannedOccurrenceAction,
  PlannedOccurrenceSettlement,
} from './plannedOccurrenceSettlementTypes';
export { findPlanAttachCandidateForOccurrence };

export async function settlePlannedOccurrence(
  session: AccountingWriteSession,
  workplaceId: WorkplaceId,
  plannedPaymentId: PlannedPaymentId,
  occurrenceDate: number,
  action: PlannedOccurrenceAction,
  fxQuote?: PlannedPaymentFxQuote,
): Promise<PlannedOccurrenceSettlement> {
  const payment = await requirePlannedPayment(workplaceId, plannedPaymentId);
  if (action.kind === 'generate' || payment.status === PlannedPaymentStatus.PAUSED) {
    assertActive(payment);
  }
  if (action.kind === 'autoPostDue' && payment.status === PlannedPaymentStatus.PAUSED) {
    throw new Error(`Planned payment ${payment.id} is paused`);
  }
  const day = occurrenceDay(occurrenceDate);
  if (
    action.kind === 'generate' &&
    normalizeToStartOfDay(payment.nextOccurrence) !== day.dayStart
  ) {
    throw new Error('Planned payment changed while its occurrence was being processed');
  }

  const occurrence = await journalPlannedQueries.findOccurrenceJournals(
    workplaceId,
    payment.id,
    day.dayStart,
    day.dayEnd,
  );
  const transition = resolveOccurrenceTransition(action, occurrence);
  if (transition.kind === 'autoPostNoop') {
    return { journal: null, nextOccurrence: payment.nextOccurrence, completed: false };
  }
  const correlationId = generator();
  const applied = await applyOccurrenceAction(
    session,
    payment,
    day,
    transition,
    correlationId,
    fxQuote,
  );
  if (applied.attachCandidate) {
    return {
      journal: null,
      nextOccurrence: payment.nextOccurrence,
      completed: false,
      attachCandidate: applied.attachCandidate,
    };
  }
  // An automatic request that did not post or attach cannot consume the cursor.
  if (action.kind === 'autoPostDue' && !applied.journal)
    return { journal: null, nextOccurrence: payment.nextOccurrence, completed: false };
  if (applied.journal && applied.journal.journal.status === JournalStatus.POSTED) {
    const links = await personQueryRepository.listPersonAccounts(workplaceId);
    const linkByAccount = new Map(links.map(link => [link.accountId, link.personId]));
    const personIds = new Set(
      Array.from(applied.journal.affectedAccountIds)
        .map(accountId => linkByAccount.get(accountId))
        .filter((personId): personId is NonNullable<typeof personId> => Boolean(personId)),
    );
    for (const personId of personIds) {
      await autoSettlePersonInSession(
        session,
        workplaceId,
        personId,
        applied.journal.journal.journalDate,
      );
    }
  }
  return {
    journal: applied.journal,
    ...(await advanceSchedule(session, payment, day.dayStart, correlationId)),
  };
}
