import { AppConfig } from '@/src/constants';
import Journal, { JournalStatus } from '@/src/data/models/Journal';
import PlannedPayment, { PlannedPaymentStatus } from '@/src/data/models/PlannedPayment';
import { journalPlannedQueries } from '@/src/data/repositories/journal/journalPlannedModule';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { ledgerWriteService } from '@/src/services/ledger';
import { generatePlannedJournalForPayment } from '@/src/services/planned-payment/plannedPaymentJournalGeneration';
import { buildPlannedPaymentTransferLines } from '@/src/services/planned-payment/plannedPaymentJournalLines';
import {
  calculateNextOccurrence,
  normalizeToStartOfDay,
} from '@/src/services/planned-payment/plannedPaymentRecurrence';
import { assertPlannedPaymentWorkplace } from '@/src/services/planned-payment/plannedPaymentWorkplace';
import { PlannedPaymentId, WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';

export interface PlannedOccurrenceContext {
  normalizedDate: number;
  dayEnd: number;
  existingPlanned: Journal[];
}

/**
 * Resolves the occurrence day window and any existing PLANNED journals for that day.
 * Always workplace-scopes journal queries.
 */
export async function resolvePlannedOccurrenceContext(
  workplaceId: WorkplaceId,
  pp: PlannedPayment,
  occurrenceDate: number,
): Promise<PlannedOccurrenceContext> {
  assertPlannedPaymentWorkplace(workplaceId, pp);

  const plannedPaymentId = pp.id as PlannedPaymentId;
  const earliestPlanned = await journalPlannedQueries.findEarliestPlannedByPayment(
    workplaceId,
    plannedPaymentId,
  );

  const targetDate = earliestPlanned ? earliestPlanned.journalDate : occurrenceDate;
  const normalizedDate = normalizeToStartOfDay(targetDate);
  const dayEnd = normalizedDate + (AppConfig.time.msPerDay - 1);

  const existingPlanned = await journalPlannedQueries.findPlannedOnDay(
    workplaceId,
    plannedPaymentId,
    normalizedDate,
    dayEnd,
  );

  return { normalizedDate, dayEnd, existingPlanned };
}

async function advancePlannedPaymentSchedule(
  workplaceId: WorkplaceId,
  pp: PlannedPayment,
  normalizedOccurrenceDate: number,
): Promise<void> {
  const nextOcc = calculateNextOccurrence(normalizedOccurrenceDate, pp);

  if (nextOcc > pp.nextOccurrence) {
    if (pp.endDate && nextOcc > pp.endDate) {
      await plannedPaymentRepository.update(workplaceId, pp, {
        nextOccurrence: nextOcc,
        status: PlannedPaymentStatus.COMPLETED,
      });
    } else {
      await plannedPaymentRepository.update(workplaceId, pp, {
        nextOccurrence: nextOcc,
      });
    }
  }
}

export async function postPlannedPaymentOccurrence(
  workplaceId: WorkplaceId,
  pp: PlannedPayment,
  occurrenceDate: number,
): Promise<void> {
  assertPlannedPaymentWorkplace(workplaceId, pp);

  try {
    const { normalizedDate, existingPlanned } = await resolvePlannedOccurrenceContext(
      workplaceId,
      pp,
      occurrenceDate,
    );

    const postTime = Date.now();

    if (existingPlanned.length > 0) {
      await ledgerWriteService.postJournal(existingPlanned[0].id, workplaceId);
    } else {
      if (!pp.toAccountId) {
        throw new Error(`Planned payment ${pp.id} is missing toAccountId.`);
      }

      await ledgerWriteService.createJournal(
        {
          journalDate: postTime,
          description: pp.name,
          currencyCode: pp.currencyCode,
          transactions: buildPlannedPaymentTransferLines(pp),
          status: JournalStatus.POSTED,
          plannedPaymentId: pp.id as PlannedPaymentId,
        },
        workplaceId,
      );
    }

    await advancePlannedPaymentSchedule(workplaceId, pp, normalizedDate);

    logger.info(
      `Manually posted occurrence for planned payment ${pp.id} at ${new Date(postTime).toLocaleString()}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to post manual occurrence for payment ${pp.id}: ${message}`);
    throw error;
  }
}

/**
 * Skips a specific occurrence: marks or creates a SKIPPED journal and advances the schedule.
 */
export async function skipPlannedPaymentOccurrence(
  workplaceId: WorkplaceId,
  pp: PlannedPayment,
  occurrenceDate: number,
): Promise<void> {
  assertPlannedPaymentWorkplace(workplaceId, pp);

  try {
    const { normalizedDate, existingPlanned } = await resolvePlannedOccurrenceContext(
      workplaceId,
      pp,
      occurrenceDate,
    );

    await journalPlannedQueries.batchUpdateStatus(
      workplaceId,
      existingPlanned,
      JournalStatus.SKIPPED,
    );

    if (existingPlanned.length === 0) {
      if (!pp.toAccountId) {
        logger.warn(
          `[PlannedPaymentOrchestration] skipOccurrence: payment ${pp.id} has no toAccountId — advancing schedule without creating a journal.`,
        );
      } else {
        await ledgerWriteService.createJournal(
          {
            journalDate: normalizedDate,
            description: pp.name,
            currencyCode: pp.currencyCode,
            transactions: buildPlannedPaymentTransferLines(pp, {
              includeNotes: false,
              includeCurrency: false,
            }),
            status: JournalStatus.SKIPPED,
            plannedPaymentId: pp.id as PlannedPaymentId,
          },
          workplaceId,
        );
      }
    }

    await advancePlannedPaymentSchedule(workplaceId, pp, normalizedDate);

    logger.info(
      `Skipped occurrence for planned payment ${pp.id} at ${new Date(normalizedDate).toLocaleDateString()}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to skip occurrence for payment ${pp.id}: ${message}`);
    throw error;
  }
}

/**
 * Process all active planned payments and generate journals for any due occurrences.
 */
export async function processDuePlannedPayments(
  workplaceId: WorkplaceId,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) return;
  const activePayments = await plannedPaymentRepository.findAllActive(workplaceId);
  if (signal?.aborted) return;

  const nowTime = normalizeToStartOfDay(Date.now());
  const horizon = nowTime + AppConfig.insights.recurringHorizonDays * AppConfig.time.msPerDay;

  const allPlannedIds = activePayments.map(p => p.id as PlannedPaymentId);
  const existingJournals = await journalPlannedQueries.findByPlannedPaymentIds(
    workplaceId,
    allPlannedIds,
  );
  if (signal?.aborted) return;

  const journalledDays = new Map<string, Set<number>>();
  for (const j of existingJournals) {
    const dayStart = normalizeToStartOfDay(j.journalDate);
    if (!journalledDays.has(j.plannedPaymentId!)) {
      journalledDays.set(j.plannedPaymentId!, new Set());
    }
    journalledDays.get(j.plannedPaymentId!)!.add(dayStart);
  }

  for (const pp of activePayments) {
    if (signal?.aborted) {
      logger.info('[PlannedPaymentOrchestration] Processing aborted due to signal.');
      break;
    }
    let nextOcc = normalizeToStartOfDay(pp.nextOccurrence);

    if (nextOcc > horizon) continue;

    let generationsCount = 0;
    const MAX_GENERATIONS = AppConfig.insights.maxPlannedPaymentGenerations;

    while (nextOcc <= horizon && generationsCount < MAX_GENERATIONS) {
      generationsCount++;

      const alreadyExists = journalledDays.get(pp.id)?.has(nextOcc) ?? false;

      if (!alreadyExists) {
        const dayEnd = nextOcc + (AppConfig.time.msPerDay - 1);
        const dbExists = await journalPlannedQueries.countOnDay(
          workplaceId,
          pp.id as PlannedPaymentId,
          nextOcc,
          dayEnd,
        );

        if (dbExists === 0) {
          await generatePlannedJournalForPayment(pp, nextOcc);
          if (!journalledDays.has(pp.id)) journalledDays.set(pp.id, new Set());
          journalledDays.get(pp.id)!.add(nextOcc);
        } else {
          logger.warn(
            `[PlannedPaymentOrchestration] Prevented duplicate journal generation for payment ${pp.id} via db-level check.`,
          );
        }
      }

      nextOcc = calculateNextOccurrence(nextOcc, pp);

      if (pp.endDate && nextOcc > pp.endDate) {
        await plannedPaymentRepository.update(workplaceId, pp, {
          status: PlannedPaymentStatus.COMPLETED,
        });
        break;
      }
    }

    if (generationsCount >= MAX_GENERATIONS) {
      logger.warn(
        `[PlannedPaymentOrchestration] Safety cap reached for payment ${pp.id}. Generated ${MAX_GENERATIONS} journals.`,
      );
    }

    if (nextOcc !== pp.nextOccurrence) {
      await plannedPaymentRepository.update(workplaceId, pp, { nextOccurrence: nextOcc });
    }
  }
}
