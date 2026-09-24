import { runAccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import {
  settlePlannedOccurrence,
  type PlannedOccurrenceSettlement,
} from '@/src/services/planned-payment/plannedOccurrenceSettlement';
import { JournalStatus } from '@/src/types/enums';
import { PlannedPaymentId, WorkplaceId } from '@/src/types/ids';

/**
 * Settles the payment's current due occurrence in its own accounting write session.
 * Cancellation observed before commit rejects the write, leaving everything unchanged for retry.
 */
export async function generatePlannedOccurrence(
  workplaceId: WorkplaceId,
  plannedPaymentId: PlannedPaymentId,
  occurrenceDate: number,
  isCancelled: () => boolean = () => false,
): Promise<PlannedOccurrenceSettlement> {
  const assertNotCancelled = () => {
    if (isCancelled()) throw new Error('Planned journal generation cancelled before commit.');
  };

  assertNotCancelled();
  const settlement = await runAccountingWriteSession(async session => {
    assertNotCancelled();
    const result = await settlePlannedOccurrence(
      session,
      workplaceId,
      plannedPaymentId,
      occurrenceDate,
      { kind: 'generate' },
    );
    assertNotCancelled();
    return result;
  });

  if (settlement.journal?.status === JournalStatus.POSTED) {
    journalPersistenceService.afterAtomicWriteCommit([settlement.journal], workplaceId);
  }
  return settlement;
}
