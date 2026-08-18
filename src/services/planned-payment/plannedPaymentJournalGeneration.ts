import PlannedPayment from '@/src/data/models/PlannedPayment';
import { CreateJournalData } from '@/src/data/repositories/journal/journalWriteModule';
import { ledgerWriteService } from '@/src/services/ledger';
import { buildPlannedPaymentTransferLines } from '@/src/services/planned-payment/plannedPaymentJournalLines';
import { normalizeToStartOfDay } from '@/src/services/planned-payment/plannedPaymentRecurrence';
import { JournalStatus } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { Model } from '@nozbe/watermelondb';

/**
 * Creates a PLANNED or POSTED journal for a planned payment occurrence.
 * Returns false when journal creation fails so callers can stop advancing.
 */
export async function generatePlannedJournalForPayment(
  pp: PlannedPayment,
  occurrenceDate: number,
  options?: {
    status?: JournalStatus;
    journalDate?: number;
    extraOps?: (data: CreateJournalData) => Model[];
  },
): Promise<boolean> {
  try {
    if (!pp.toAccountId) {
      logger.warn(`Planned payment ${pp.id} is missing toAccountId — skipping journal generation.`);
      return true;
    }

    const journalDate = options?.journalDate ?? normalizeToStartOfDay(occurrenceDate);
    const status =
      options?.status ?? (pp.isAutoPost ? JournalStatus.POSTED : JournalStatus.PLANNED);

    const data: CreateJournalData = {
      journalDate,
      description: pp.name,
      currencyCode: pp.currencyCode,
      transactions: buildPlannedPaymentTransferLines(pp),
      status,
      plannedPaymentId: pp.id,
    };

    await ledgerWriteService.createJournal(data, pp.workplaceId, {
      extraOps: options?.extraOps ? () => options.extraOps!(data) : undefined,
    });
    return true;
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
    return false;
  }
}
