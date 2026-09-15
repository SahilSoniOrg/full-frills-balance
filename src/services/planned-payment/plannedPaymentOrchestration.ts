import { AppConfig } from '@/src/constants';
import Journal from '@/src/data/models/Journal';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import { journalPlannedQueries } from '@/src/data/repositories/journal/journalPlannedModule';
import { persistBatch } from '@/src/data/repositories/persistBatch';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { ledgerCreateService } from '@/src/services/ledger/ledgerCreateService';
import { ledgerLifecycleService } from '@/src/services/ledger/ledgerLifecycleService';
import { generatePlannedJournalForPayment } from '@/src/services/planned-payment/plannedPaymentJournalGeneration';
import { buildPlannedPaymentTransferLines } from '@/src/services/planned-payment/plannedPaymentJournalLines';
import {
  calculateNextOccurrence,
  normalizeToStartOfDay,
} from '@/src/services/planned-payment/plannedPaymentRecurrence';
import { requirePlannedPayment } from '@/src/services/planned-payment/plannedPaymentWorkplace';
import { JournalStatus, PlannedPaymentStatus } from '@/src/types/enums';
import { PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import { logger } from '@/src/utils/logger';
import { Model } from '@nozbe/watermelondb';

export interface PlannedOccurrenceContext {
  normalizedDate: number;
  dayEnd: number;
  existingPlanned: Journal[];
}

const dueProcessingByWorkplace = new Map<WorkplaceId, Promise<void>>();

/**
 * Resolves the occurrence day window and any existing PLANNED journals for that day.
 * Always workplace-scopes journal queries.
 */
export async function resolvePlannedOccurrenceContext(
  workplaceId: WorkplaceId,
  pp: PlannedPayment,
  occurrenceDate: number,
): Promise<PlannedOccurrenceContext> {
  const plannedPaymentId = pp.id;
  const normalizedDate = normalizeToStartOfDay(occurrenceDate);
  const dayEnd = normalizedDate + (AppConfig.time.msPerDay - 1);

  const existingPlanned = await journalPlannedQueries.findPlannedOnDay(
    workplaceId,
    plannedPaymentId,
    normalizedDate,
    dayEnd,
  );

  return { normalizedDate, dayEnd, existingPlanned };
}

function prepareScheduleAdvance(
  workplaceId: WorkplaceId,
  pp: PlannedPayment,
  normalizedOccurrenceDate: number,
): Model | null {
  const nextOcc = calculateNextOccurrence(normalizedOccurrenceDate, pp);
  if (nextOcc <= pp.nextOccurrence) return null;
  return plannedPaymentRepository.prepareUpdate(workplaceId, pp, {
    nextOccurrence: nextOcc,
    ...(pp.endDate && nextOcc > pp.endDate ? { status: PlannedPaymentStatus.COMPLETED } : {}),
  });
}

export async function postPlannedPaymentOccurrence(
  workplaceId: WorkplaceId,
  plannedPaymentId: PlannedPaymentId,
  occurrenceDate: number,
): Promise<void> {
  const pp = await requirePlannedPayment(workplaceId, plannedPaymentId);

  try {
    const { normalizedDate, existingPlanned } = await resolvePlannedOccurrenceContext(
      workplaceId,
      pp,
      occurrenceDate,
    );

    const postTime = Date.now();
    const getScheduleOp = () => {
      const scheduleOp = prepareScheduleAdvance(workplaceId, pp, normalizedDate);
      return scheduleOp ? [scheduleOp] : [];
    };

    if (existingPlanned.length > 0) {
      await ledgerLifecycleService.postJournal(existingPlanned[0].id, workplaceId, {
        extraOps: getScheduleOp,
      });
    } else {
      if (!pp.toAccountId) {
        throw new Error(`Planned payment ${pp.id} is missing toAccountId.`);
      }

      await ledgerCreateService.createJournal(
        {
          journalDate: postTime,
          description: pp.name,
          currencyCode: pp.currencyCode,
          transactions: buildPlannedPaymentTransferLines(pp),
          status: JournalStatus.POSTED,
          plannedPaymentId: pp.id,
        },
        workplaceId,
        { extraOps: getScheduleOp },
      );
    }

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
  plannedPaymentId: PlannedPaymentId,
  occurrenceDate: number,
): Promise<void> {
  const pp = await requirePlannedPayment(workplaceId, plannedPaymentId);

  try {
    const { normalizedDate, existingPlanned } = await resolvePlannedOccurrenceContext(
      workplaceId,
      pp,
      occurrenceDate,
    );

    if (existingPlanned.length > 0) {
      await persistBatch(() => {
        const scheduleOp = prepareScheduleAdvance(workplaceId, pp, normalizedDate);
        return [
          ...journalPlannedQueries.prepareStatusUpdates(
            workplaceId,
            existingPlanned,
            JournalStatus.SKIPPED,
          ),
          ...(scheduleOp ? [scheduleOp] : []),
        ];
      });
    } else if (!pp.toAccountId) {
      logger.warn(
        `[PlannedPaymentOrchestration] skipOccurrence: payment ${pp.id} has no toAccountId — advancing schedule without creating a journal.`,
      );
      await persistBatch(() => {
        const scheduleOp = prepareScheduleAdvance(workplaceId, pp, normalizedDate);
        return scheduleOp ? [scheduleOp] : [];
      });
    } else {
      await ledgerCreateService.createJournal(
        {
          journalDate: normalizedDate,
          description: pp.name,
          currencyCode: pp.currencyCode,
          transactions: buildPlannedPaymentTransferLines(pp, {
            includeNotes: false,
            includeCurrency: false,
          }),
          status: JournalStatus.SKIPPED,
          plannedPaymentId: pp.id,
        },
        workplaceId,
        {
          extraOps: () => {
            const scheduleOp = prepareScheduleAdvance(workplaceId, pp, normalizedDate);
            return scheduleOp ? [scheduleOp] : [];
          },
        },
      );
    }

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
  const activePayments = await plannedPaymentRepository.findAllActive(workplaceId);
  if (isCancelled()) return;

  const nowTime = normalizeToStartOfDay(Date.now());
  const horizon = nowTime + AppConfig.insights.recurringHorizonDays * AppConfig.time.msPerDay;

  const allPlannedIds = activePayments.map(p => p.id);
  const existingJournals = await journalPlannedQueries.findByPlannedPaymentIds(
    workplaceId,
    allPlannedIds,
  );
  if (isCancelled()) return;

  const journalledDays = new Map<string, Set<number>>();
  for (const j of existingJournals) {
    const dayStart = normalizeToStartOfDay(j.journalDate);
    if (!journalledDays.has(j.plannedPaymentId!)) {
      journalledDays.set(j.plannedPaymentId!, new Set());
    }
    journalledDays.get(j.plannedPaymentId!)!.add(dayStart);
  }

  for (const pp of activePayments) {
    if (isCancelled()) {
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
          pp.id,
          nextOcc,
          dayEnd,
        );

        if (isCancelled()) break;

        if (dbExists === 0) {
          const created = await generatePlannedJournalForPayment(pp, nextOcc, {
            signal,
            isCurrent,
            extraOps: () => {
              const scheduleOp = prepareScheduleAdvance(workplaceId, pp, nextOcc);
              return scheduleOp ? [scheduleOp] : [];
            },
          });
          if (!created) break;
          if (isCancelled()) break;
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
        if (isCancelled()) break;
        if (pp.status !== PlannedPaymentStatus.COMPLETED) {
          await plannedPaymentRepository.update(workplaceId, pp, {
            status: PlannedPaymentStatus.COMPLETED,
          });
        }
        break;
      }
    }

    if (generationsCount >= MAX_GENERATIONS) {
      logger.warn(
        `[PlannedPaymentOrchestration] Safety cap reached for payment ${pp.id}. Generated ${MAX_GENERATIONS} journals.`,
      );
    }

    if (nextOcc !== pp.nextOccurrence) {
      if (isCancelled()) break;
      await plannedPaymentRepository.update(workplaceId, pp, { nextOccurrence: nextOcc });
    }
  }
}
