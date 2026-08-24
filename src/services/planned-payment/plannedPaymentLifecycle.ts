import { persistBatch } from '@/src/data/repositories/persistBatch';
import { journalPlannedQueries } from '@/src/data/repositories/journal/journalPlannedModule';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { processDuePlannedPayments } from '@/src/services/planned-payment/plannedPaymentOrchestration';
import {
  calculateNextOccurrence,
  normalizeToStartOfDay,
} from '@/src/services/planned-payment/plannedPaymentRecurrence';
import { requirePlannedPayment } from '@/src/services/planned-payment/plannedPaymentWorkplace';
import { JournalStatus, PlannedPaymentStatus } from '@/src/types/enums';
import { PlannedPaymentId, WorkplaceId } from '@/src/types/ids';

/**
 * Toggles planned-payment ACTIVE ↔ PAUSED.
 * Pausing marks future PLANNED journals as PAUSED; resuming restores/skips and regenerates due occurrences.
 */
export async function togglePlannedPaymentStatus(
  workplaceId: WorkplaceId,
  plannedPaymentId: PlannedPaymentId,
): Promise<PlannedPaymentStatus> {
  const pp = await requirePlannedPayment(workplaceId, plannedPaymentId);

  const newStatus =
    pp.status === PlannedPaymentStatus.ACTIVE
      ? PlannedPaymentStatus.PAUSED
      : PlannedPaymentStatus.ACTIVE;

  const isPausing = newStatus === PlannedPaymentStatus.PAUSED;
  const targetStatus = isPausing ? JournalStatus.PLANNED : JournalStatus.PAUSED;

  const targetJournals = await journalPlannedQueries.findByPlannedPaymentAndStatus(
    workplaceId,
    pp.id,
    targetStatus,
  );

  const nowMidnight = normalizeToStartOfDay(Date.now());
  let updatedNextOccurrence = pp.nextOccurrence;

  if (!isPausing) {
    while (updatedNextOccurrence < nowMidnight) {
      updatedNextOccurrence = calculateNextOccurrence(updatedNextOccurrence, pp);
    }
  }

  await persistBatch(() => {
    const ppUpdate = plannedPaymentRepository.prepareStatusUpdate(
      workplaceId,
      pp,
      newStatus,
      isPausing ? undefined : updatedNextOccurrence,
    );
    const journalUpdates = journalPlannedQueries.prepareStatusUpdates(
      workplaceId,
      targetJournals,
      isPausing
        ? JournalStatus.PAUSED
        : journal =>
            normalizeToStartOfDay(journal.journalDate) >= nowMidnight
              ? JournalStatus.PLANNED
              : JournalStatus.SKIPPED,
    );

    return [ppUpdate, ...journalUpdates];
  });

  if (!isPausing) {
    await processDuePlannedPayments(workplaceId);
  }

  return newStatus;
}
