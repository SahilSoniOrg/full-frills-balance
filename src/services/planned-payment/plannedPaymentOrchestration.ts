import {
  preparePlannedPaymentFxQuote,
  PlannedPaymentFxReviewRequiredError,
  type PlannedPaymentFxReview,
} from './plannedPaymentFx';
import type { AuditEventMetadata } from '@/src/types/auditEvents';
import { AppConfig } from '@/src/constants';
import { runAccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { journalPlannedQueries } from '@/src/data/repositories/journal/JournalPlannedQueries';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import {
  settlePlannedOccurrence,
  type PlannedOccurrenceAction,
} from '@/src/services/planned-payment/plannedOccurrenceSettlement';
import { generatePlannedOccurrence } from '@/src/services/planned-payment/plannedPaymentJournalGeneration';
import { normalizeToStartOfDay } from '@/src/services/planned-payment/plannedPaymentRecurrence';
import { JournalStatus } from '@/src/types/enums';
import { JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import { logger } from '@/src/utils/logger';

const dueProcessingByWorkplace = new Map<WorkplaceId, Promise<void>>();

async function settleManualOccurrence(
  workplaceId: WorkplaceId,
  plannedPaymentId: PlannedPaymentId,
  occurrenceDate: number,
  action: Exclude<PlannedOccurrenceAction, { kind: 'generate' }>,
): Promise<void> {
  const quote = await preparePlannedPaymentFxQuote(
    workplaceId,
    plannedPaymentId,
    occurrenceDate,
    action,
  );
  const journal = await runAccountingWriteSession(
    async session =>
      (
        await settlePlannedOccurrence(
          session,
          workplaceId,
          plannedPaymentId,
          occurrenceDate,
          action,
          quote,
        )
      ).journal,
  );
  if (journal?.status === JournalStatus.POSTED) {
    journalPersistenceService.afterAtomicWriteCommit([journal], workplaceId);
  }
}

async function postOccurrence(
  workplaceId: WorkplaceId,
  plannedPaymentId: PlannedPaymentId,
  occurrenceDate: number,
  journalId?: JournalId,
  review?: PlannedPaymentFxReview,
  options?: PlannedJournalPostOptions,
): Promise<void> {
  const postedAt = options?.postedAt ?? Date.now();
  try {
    await settleManualOccurrence(workplaceId, plannedPaymentId, occurrenceDate, {
      kind: 'post',
      postedAt,
      journalId,
      review,
      auditMetadata: options?.auditMetadata,
      expectedCurrent: options?.expectedCurrent,
    });
    logger.info(
      `Manually posted occurrence for planned payment ${plannedPaymentId} at ${new Date(postedAt).toLocaleString()}`,
    );
  } catch (error) {
    if (error instanceof PlannedPaymentFxReviewRequiredError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to post manual occurrence for payment ${plannedPaymentId}: ${message}`);
    throw error;
  }
}

export interface PlannedJournalPostOptions {
  postedAt?: number;
  auditMetadata?: AuditEventMetadata;
  expectedCurrent?: Record<string, unknown>;
}

/** Posts the exact scheduled journal selected from a planned-occurrence list. */
export function postPlannedJournalOccurrence(
  workplaceId: WorkplaceId,
  plannedPaymentId: PlannedPaymentId,
  journalId: JournalId,
  occurrenceDate: number,
  review?: PlannedPaymentFxReview,
  options?: PlannedJournalPostOptions,
): Promise<void> {
  return postOccurrence(workplaceId, plannedPaymentId, occurrenceDate, journalId, review, options);
}

/** Posts the payment's occurrence, creating a posted journal if none is scheduled yet. */
export function postPlannedPaymentOccurrence(
  workplaceId: WorkplaceId,
  plannedPaymentId: PlannedPaymentId,
  occurrenceDate: number,
  review?: PlannedPaymentFxReview,
): Promise<void> {
  return postOccurrence(workplaceId, plannedPaymentId, occurrenceDate, undefined, review);
}

/**
 * Skips a specific occurrence: marks or creates a SKIPPED journal and advances the schedule.
 */
export async function skipPlannedPaymentOccurrence(
  workplaceId: WorkplaceId,
  plannedPaymentId: PlannedPaymentId,
  occurrenceDate: number,
): Promise<void> {
  try {
    await settleManualOccurrence(workplaceId, plannedPaymentId, occurrenceDate, { kind: 'skip' });
    logger.info(
      `Skipped occurrence for planned payment ${plannedPaymentId} at ${new Date(normalizeToStartOfDay(occurrenceDate)).toLocaleDateString()}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to skip occurrence for payment ${plannedPaymentId}: ${message}`);
    throw error;
  }
}

/**
 * Process all active planned payments and generate journals for any due occurrences.
 */
export async function processDuePlannedPayments(
  workplaceId: WorkplaceId,
  signal?: AbortSignal,
  isCurrent?: () => boolean,
): Promise<void> {
  const inFlight = dueProcessingByWorkplace.get(workplaceId);
  if (inFlight) return inFlight;

  const run = processDuePlannedPaymentsNow(workplaceId, signal, isCurrent).finally(() => {
    if (dueProcessingByWorkplace.get(workplaceId) === run) {
      dueProcessingByWorkplace.delete(workplaceId);
    }
  });
  dueProcessingByWorkplace.set(workplaceId, run);
  return run;
}

async function processDuePlannedPaymentsNow(
  workplaceId: WorkplaceId,
  signal?: AbortSignal,
  isCurrent?: () => boolean,
): Promise<void> {
  const isCancelled = () => signal?.aborted === true || isCurrent?.() === false;

  if (isCancelled()) return;
  const asOf = normalizeToStartOfDay(Date.now());
  const settleablePayments = await plannedPaymentRepository.findAllForDueSettlement(workplaceId);
  for (const payment of settleablePayments) {
    if (isCancelled() || !payment.isAutoPost) continue;
    try {
      const planned = await journalPlannedQueries.findByPlannedPaymentAndStatus(
        workplaceId,
        payment.id,
        JournalStatus.PLANNED,
      );
      for (const journal of planned) {
        if (isCancelled()) break;
        const occurrenceDate = normalizeToStartOfDay(journal.journalDate);
        if (occurrenceDate > asOf) continue;
        const action = { kind: 'autoPostDue' as const, asOf, journalId: journal.id };
        const quote = await preparePlannedPaymentFxQuote(
          workplaceId,
          payment.id,
          occurrenceDate,
          action,
        );
        const posted = await runAccountingWriteSession(async session => {
          if (isCancelled()) return null;
          const settlement = await settlePlannedOccurrence(
            session,
            workplaceId,
            payment.id,
            occurrenceDate,
            action,
            quote,
          );
          if (isCancelled())
            throw new Error('Planned occurrence settlement cancelled before commit.');
          return settlement.journal;
        });
        if (posted?.status === JournalStatus.POSTED) {
          journalPersistenceService.afterAtomicWriteCommit([posted], workplaceId);
        }
      }
    } catch (error) {
      if (isCancelled()) break;
      logger.error(`Failed to settle due planned occurrence for payment ${payment.id}`, error);
    }
  }
  const activePayments = await plannedPaymentRepository.findAllActive(workplaceId);

  const nowTime = asOf;
  const horizon = nowTime + AppConfig.insights.recurringHorizonDays * AppConfig.time.msPerDay;
  const maxGenerations = AppConfig.insights.maxPlannedPaymentGenerations;

  for (const pp of activePayments) {
    if (isCancelled()) {
      logger.info('[PlannedPaymentOrchestration] Processing aborted due to signal.');
      break;
    }

    let occurrence = normalizeToStartOfDay(pp.nextOccurrence);
    let generations = 0;
    try {
      while (occurrence <= horizon && generations < maxGenerations) {
        generations++;
        const settlement = await generatePlannedOccurrence(
          workplaceId,
          pp.id,
          occurrence,
          isCancelled,
          asOf,
        );
        if (settlement.completed) break;
        occurrence = normalizeToStartOfDay(settlement.nextOccurrence);
      }
    } catch (error) {
      if (isCancelled()) break;
      logger.error(
        `Failed to generate planned journal for payment ${pp.id}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined,
      );
      continue;
    }

    if (generations >= maxGenerations) {
      logger.warn(
        `[PlannedPaymentOrchestration] Safety cap reached for payment ${pp.id}. Generated ${maxGenerations} journals.`,
      );
    }
  }
}
