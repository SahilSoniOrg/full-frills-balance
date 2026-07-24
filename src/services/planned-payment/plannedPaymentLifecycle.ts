import { database } from '@/src/data/database/Database';
import { JournalStatus } from '@/src/data/models/Journal';
import PlannedPayment, { PlannedPaymentStatus } from '@/src/data/models/PlannedPayment';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { processDuePlannedPayments } from '@/src/services/planned-payment/plannedPaymentOrchestration';
import {
  calculateNextOccurrence,
  normalizeToStartOfDay,
} from '@/src/services/planned-payment/plannedPaymentRecurrence';
import { PlannedPaymentId, WorkplaceId } from '@/src/types/domain';

/**
 * Toggles planned-payment ACTIVE ↔ PAUSED.
 * Pausing marks future PLANNED journals as PAUSED; resuming restores/skips and regenerates due occurrences.
 */
export async function togglePlannedPaymentStatus(
  workplaceId: WorkplaceId,
  pp: PlannedPayment,
): Promise<PlannedPaymentStatus> {
  const newStatus =
    pp.status === PlannedPaymentStatus.ACTIVE
      ? PlannedPaymentStatus.PAUSED
      : PlannedPaymentStatus.ACTIVE;

  const isPausing = newStatus === PlannedPaymentStatus.PAUSED;
  const targetStatus = isPausing ? JournalStatus.PLANNED : JournalStatus.PAUSED;

  const targetJournals = await journalRepository.findByPlannedPaymentAndStatus(
    workplaceId,
    pp.id as PlannedPaymentId,
    targetStatus,
  );

  const nowMidnight = normalizeToStartOfDay(Date.now());
  let updatedNextOccurrence = pp.nextOccurrence;

  if (!isPausing) {
    while (updatedNextOccurrence < nowMidnight) {
      updatedNextOccurrence = calculateNextOccurrence(updatedNextOccurrence, pp);
    }
  }

  await database.write(async () => {
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

    await database.batch([ppUpdate, ...journalUpdates]);
  });

  if (!isPausing) {
    await processDuePlannedPayments(workplaceId);
  }

  return newStatus;
}
