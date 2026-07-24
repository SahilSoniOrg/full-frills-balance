import { JournalStatus } from '@/src/data/models/Journal';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import { ledgerWriteService } from '@/src/services/ledger';
import { buildPlannedPaymentTransferLines } from '@/src/services/planned-payment/plannedPaymentJournalLines';
import { normalizeToStartOfDay } from '@/src/services/planned-payment/plannedPaymentRecurrence';
import { PlannedPaymentId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';

/**
 * Creates a PLANNED or POSTED journal for a planned payment occurrence.
 */
export async function generatePlannedJournalForPayment(
  pp: PlannedPayment,
  occurrenceDate: number,
  options?: { status?: JournalStatus; journalDate?: number },
): Promise<void> {
  try {
    if (!pp.toAccountId) {
      logger.warn(`Planned payment ${pp.id} is missing toAccountId — skipping journal generation.`);
      return;
    }

    const journalDate = options?.journalDate ?? normalizeToStartOfDay(occurrenceDate);
    const status =
      options?.status ?? (pp.isAutoPost ? JournalStatus.POSTED : JournalStatus.PLANNED);

    await ledgerWriteService.createJournal(
      {
        journalDate,
        description: pp.name,
        currencyCode: pp.currencyCode,
        transactions: buildPlannedPaymentTransferLines(pp),
        status,
        plannedPaymentId: pp.id as PlannedPaymentId,
      },
      pp.workplaceId,
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : error != null
          ? String(error)
          : 'unknown error (null thrown)';
    logger.error(
      `Failed to generate planned journal for payment ${pp.id}: ${message}`,
      error instanceof Error ? error : undefined,
    );
  }
}
