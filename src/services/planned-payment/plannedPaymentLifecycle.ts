import PlannedPayment from '@/src/data/models/PlannedPayment';
import { persistBatch } from '@/src/data/repositories/persistBatch';
import { journalPlannedQueries } from '@/src/data/repositories/journal/journalPlannedModule';
import { processDuePlannedPayments } from '@/src/services/planned-payment/plannedPaymentOrchestration';
import {
  calculateNextOccurrence,
  normalizeToStartOfDay,
} from '@/src/services/planned-payment/plannedPaymentRecurrence';
import { requirePlannedPayment } from '@/src/services/planned-payment/plannedPaymentWorkplace';
import {
  JournalStatus,
  PlannedPaymentId,
  PlannedPaymentStatus,
  WorkplaceId,
} from '@/src/types/domain';

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

  const ppUpdate = pp.prepareUpdate((record: PlannedPayment) => {
    record.status = newStatus;
    if (!isPausing) {
      record.nextOccurrence = updatedNextOccurrence;
    }
    record.updatedAt = new Date();
  });

  const journalUpdates = targetJournals.map(j =>
    j.prepareUpdate(record => {
      if (isPausing) {
        record.status = JournalStatus.PAUSED;
      } else {
        record.status =
          normalizeToStartOfDay(j.journalDate) >= nowMidnight
            ? JournalStatus.PLANNED
            : JournalStatus.SKIPPED;
      }
      record.updatedAt = new Date();
    }),
  );

  await persistBatch([ppUpdate, ...journalUpdates]);

  if (!isPausing) {
    await processDuePlannedPayments(workplaceId);
  }

  return newStatus;
}
