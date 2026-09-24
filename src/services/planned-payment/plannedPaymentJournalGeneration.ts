import { AppConfig } from '@/src/constants';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import { runAccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import {
  journalPersistenceRepository,
  type JournalPersistenceResult,
} from '@/src/data/repositories/journal/JournalPersistenceRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { buildPlannedPaymentTransferLines } from '@/src/services/planned-payment/plannedPaymentJournalLines';
import {
  calculateNextOccurrence,
  normalizeToStartOfDay,
} from '@/src/services/planned-payment/plannedPaymentRecurrence';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import { JournalStatus, PlannedPaymentStatus } from '@/src/types/enums';
import { logger } from '@/src/utils/logger';

/**
 * Creates one planned-payment occurrence and advances its schedule in the same
 * accounting write session. A rejected write leaves both unchanged for retry.
 */
export async function generatePlannedJournalForPayment(
  pp: PlannedPayment,
  occurrenceDate: number,
  options?: {
    status?: JournalStatus;
    journalDate?: number;
    expectedNextOccurrence?: number;
    expectedStatus?: PlannedPaymentStatus;
    signal?: AbortSignal;
    isCurrent?: () => boolean;
  },
): Promise<boolean> {
  const isCancelled = () => options?.signal?.aborted === true || options?.isCurrent?.() === false;

  try {
    if (isCancelled()) return false;

    const normalizedDate = normalizeToStartOfDay(occurrenceDate);
    const nextOccurrence = calculateNextOccurrence(normalizedDate, pp);
    const scheduleUpdates =
      nextOccurrence > pp.nextOccurrence
        ? {
            nextOccurrence,
            ...(pp.endDate && nextOccurrence > pp.endDate
              ? { status: PlannedPaymentStatus.COMPLETED }
              : {}),
          }
        : null;

    const result = await runAccountingWriteSession(async session => {
      if (isCancelled()) throw new Error('Planned journal generation cancelled before commit.');

      if (!pp.toAccountId) {
        logger.warn(
          `Planned payment ${pp.id} is missing toAccountId — advancing its schedule without creating a journal.`,
        );
      } else {
        await journalPersistenceRepository.assertPlannedOccurrenceAvailable(
          pp.workplaceId,
          pp.id,
          normalizedDate,
          normalizedDate + AppConfig.time.msPerDay - 1,
        );
      }

      const journalResult: JournalPersistenceResult | null = pp.toAccountId
        ? await journalPersistenceService.putInSession(
            session,
            {
              journalDate: options?.journalDate ?? normalizedDate,
              description: pp.name,
              currencyCode: pp.currencyCode,
              transactions: buildPlannedPaymentTransferLines(pp),
              status:
                options?.status ?? (pp.isAutoPost ? JournalStatus.POSTED : JournalStatus.PLANNED),
              plannedPaymentId: pp.id,
            },
            pp.workplaceId,
          )
        : null;

      if (scheduleUpdates) {
        await plannedPaymentRepository.updateInSession(
          session,
          pp.workplaceId,
          pp.id,
          scheduleUpdates,
          options?.expectedNextOccurrence === undefined
            ? options?.expectedStatus === undefined
              ? undefined
              : { status: options.expectedStatus }
            : {
                nextOccurrence: options.expectedNextOccurrence,
                ...(options.expectedStatus === undefined ? {} : { status: options.expectedStatus }),
              },
        );
      }

      if (isCancelled()) throw new Error('Planned journal generation cancelled before commit.');
      return journalResult;
    });

    if (result?.status === JournalStatus.POSTED) {
      journalPersistenceService.afterAtomicWriteCommit([result], pp.workplaceId);
    }
    return true;
  } catch (error) {
    if (options?.signal?.aborted || options?.isCurrent?.() === false) return false;

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
