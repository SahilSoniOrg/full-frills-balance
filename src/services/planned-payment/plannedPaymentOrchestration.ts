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
  type PlanCaptureAttachCandidate,
  type PlannedOccurrenceAction,
  type PlannedOccurrenceSettlement,
} from '@/src/services/planned-payment/plannedOccurrenceSettlement';
import { generatePlannedOccurrence } from '@/src/services/planned-payment/plannedPaymentJournalGeneration';
import { normalizeToStartOfDay } from '@/src/services/planned-payment/plannedPaymentRecurrence';
import { JournalStatus } from '@/src/types/enums';
import { JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import { logger } from '@/src/utils/logger';

const dueProcessingByWorkplace = new Map<WorkplaceId, Promise<void>>();

export type PostPlannedOccurrenceResult =
  | { status: 'posted' | 'skipped' }
  | { status: 'attach_candidate'; candidate: PlanCaptureAttachCandidate };

async function settleManualOccurrence(
  workplaceId: WorkplaceId,
  plannedPaymentId: PlannedPaymentId,
  occurrenceDate: number,
  action: Exclude<PlannedOccurrenceAction, { kind: 'generate' }>,
): Promise<PlannedOccurrenceSettlement> {
  const quote = await preparePlannedPaymentFxQuote(
    workplaceId,
    plannedPaymentId,
    occurrenceDate,
    action,
  );
  const settlement = await runAccountingWriteSession(async session =>
    settlePlannedOccurrence(session, workplaceId, plannedPaymentId, occurrenceDate, action, quote),
  );
  if (settlement.journal?.status === JournalStatus.POSTED) {
    journalPersistenceService.afterAtomicWriteCommit([settlement.journal], workplaceId);
  }
  return settlement;
}

async function postOccurrence(
  workplaceId: WorkplaceId,
  plannedPaymentId: PlannedPaymentId,
  occurrenceDate: number,
  journalId?: JournalId,
  review?: PlannedPaymentFxReview,
  options?: PlannedJournalPostOptions,
): Promise<PostPlannedOccurrenceResult> {
  const postedAt = options?.postedAt ?? Date.now();
  try {
    const settlement = await settleManualOccurrence(workplaceId, plannedPaymentId, occurrenceDate, {
      kind: 'post',
      postedAt,
      journalId,
      review,
      auditMetadata: options?.auditMetadata,
      expectedCurrent: options?.expectedCurrent,
      confirmPostDespiteCandidate: options?.confirmPostDespiteCandidate,
    });
    if (settlement.attachCandidate) {
      return { status: 'attach_candidate', candidate: settlement.attachCandidate };
    }
    return { status: settlement.journal ? 'posted' : 'skipped' };
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
  /** User confirmed Post after a "link instead?" prompt. */
  confirmPostDespiteCandidate?: boolean;
}

/** Posts the exact scheduled journal selected from a planned-occurrence list. */
export function postPlannedJournalOccurrence(
  workplaceId: WorkplaceId,
  plannedPaymentId: PlannedPaymentId,
  journalId: JournalId,
  occurrenceDate: number,
  review?: PlannedPaymentFxReview,
  options?: PlannedJournalPostOptions,
): Promise<PostPlannedOccurrenceResult> {
  return postOccurrence(workplaceId, plannedPaymentId, occurrenceDate, journalId, review, options);
}

/** Posts the payment's occurrence, creating a posted journal if none is scheduled yet. */
export function postPlannedPaymentOccurrence(
  workplaceId: WorkplaceId,
  plannedPaymentId: PlannedPaymentId,
  occurrenceDate: number,
  review?: PlannedPaymentFxReview,
  options?: PlannedJournalPostOptions,
): Promise<PostPlannedOccurrenceResult> {
  return postOccurrence(workplaceId, plannedPaymentId, occurrenceDate, undefined, review, options);
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to skip occurrence for payment ${plannedPaymentId}: ${message}`);
    throw error;
  }
}

export type { PlanCaptureAttachCandidate };

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
  for (const journal of await journalPlannedQueries.findDueAutoPostJournals(
    workplaceId,
    asOf + AppConfig.time.msPerDay,
  )) {
    if (isCancelled()) break;
    try {
      await journalPersistenceService.post(journal.id, workplaceId, journal.journalDate);
    } catch (error) {
      logger.error(`Failed to auto-post planned journal ${journal.id}`, error);
    }
  }
  const activePayments = await plannedPaymentRepository.findAllActive(workplaceId);

  const nowTime = asOf;
  const horizon = nowTime + AppConfig.insights.recurringHorizonDays * AppConfig.time.msPerDay;
  const maxGenerations = AppConfig.insights.maxPlannedPaymentGenerations;

  for (const pp of activePayments) {
    if (isCancelled()) {
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
