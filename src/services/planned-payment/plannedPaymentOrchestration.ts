import { AppConfig } from '@/src/constants';
import { MetadataKeys, MetadataSources } from '@/src/constants/ledger-constants';
import Journal from '@/src/data/models/Journal';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import { runAccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import { journalPersistenceRepository } from '@/src/data/repositories/journal/JournalPersistenceRepository';
import { journalPlannedQueries } from '@/src/data/repositories/journal/journalPlannedModule';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import type { PlannedPaymentPersistenceInput } from '@/src/data/repositories/PlannedPaymentRepository';
import { generatePlannedJournalForPayment } from '@/src/services/planned-payment/plannedPaymentJournalGeneration';
import { buildPlannedPaymentTransferLines } from '@/src/services/planned-payment/plannedPaymentJournalLines';
import {
  calculateNextOccurrence,
  normalizeToStartOfDay,
} from '@/src/services/planned-payment/plannedPaymentRecurrence';
import { requirePlannedPayment } from '@/src/services/planned-payment/plannedPaymentWorkplace';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import { JournalStatus, PlannedPaymentStatus } from '@/src/types/enums';
import { PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import { logger } from '@/src/utils/logger';

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
  pp: PlannedPayment,
  normalizedOccurrenceDate: number,
): Partial<PlannedPaymentPersistenceInput> | null {
  const nextOcc = calculateNextOccurrence(normalizedOccurrenceDate, pp);
  if (nextOcc <= pp.nextOccurrence) return null;
  return {
    nextOccurrence: nextOcc,
    ...(pp.endDate && nextOcc > pp.endDate ? { status: PlannedPaymentStatus.COMPLETED } : {}),
  };
}

export async function postPlannedPaymentOccurrence(
  workplaceId: WorkplaceId,
  plannedPaymentId: PlannedPaymentId,
  occurrenceDate: number,
): Promise<void> {
  const pp = await requirePlannedPayment(workplaceId, plannedPaymentId);

  try {
    const { normalizedDate, dayEnd, existingPlanned } = await resolvePlannedOccurrenceContext(
      workplaceId,
      pp,
      occurrenceDate,
    );

    const postTime = Date.now();
    if (existingPlanned.length > 1) {
      throw new Error(`Planned payment ${pp.id} has multiple planned journals for this occurrence`);
    }
    if (existingPlanned.length === 0 && !pp.toAccountId) {
      throw new Error(`Planned payment ${pp.id} is missing toAccountId.`);
    }

    const result = await runAccountingWriteSession(async session => {
      await journalPersistenceRepository.assertPlannedOccurrenceAvailable(
        workplaceId,
        pp.id,
        normalizedDate,
        dayEnd,
        new Set(existingPlanned.map(journal => journal.id)),
      );

      const journalResult =
        existingPlanned.length > 0
          ? await journalPersistenceService.postInSession(
              session,
              existingPlanned[0].id,
              workplaceId,
              postTime,
            )
          : await journalPersistenceService.putInSession(
              session,
              {
                journalDate: postTime,
                description: pp.name,
                currencyCode: pp.currencyCode,
                transactions: buildPlannedPaymentTransferLines(pp),
                status: JournalStatus.POSTED,
                plannedPaymentId: pp.id,
                metadata: {
                  importSource: MetadataSources.MANUAL_POST,
                  metadataJson: JSON.stringify({
                    [MetadataKeys.ORIGINAL_PLANNED_DATE]: normalizedDate,
                  }),
                },
              },
              workplaceId,
            );

      const scheduleUpdates = prepareScheduleAdvance(pp, normalizedDate);
      if (scheduleUpdates) {
        await plannedPaymentRepository.updateInSession(
          session,
          workplaceId,
          pp.id,
          scheduleUpdates,
          { nextOccurrence: pp.nextOccurrence },
        );
      }
      return journalResult;
    });
    journalPersistenceService.afterAtomicWriteCommit([result], workplaceId);

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
    const { normalizedDate, dayEnd, existingPlanned } = await resolvePlannedOccurrenceContext(
      workplaceId,
      pp,
      occurrenceDate,
    );

    if (existingPlanned.length === 0 && !pp.toAccountId) {
      logger.warn(
        `[PlannedPaymentOrchestration] skipOccurrence: payment ${pp.id} has no toAccountId — advancing schedule without creating a journal.`,
      );
    }

    await runAccountingWriteSession(async session => {
      const allowedJournalIds = new Set(existingPlanned.map(journal => journal.id));
      await journalPersistenceRepository.assertPlannedOccurrenceAvailable(
        workplaceId,
        pp.id,
        normalizedDate,
        dayEnd,
        allowedJournalIds,
      );

      if (existingPlanned.length > 0) {
        await journalPersistenceRepository.setNonPostedStatusesInSession(
          session,
          workplaceId,
          existingPlanned.map(journal => ({
            journalId: journal.id,
            status: JournalStatus.SKIPPED,
            expectedStatus: JournalStatus.PLANNED,
          })),
        );
      } else if (pp.toAccountId) {
        await journalPersistenceService.putInSession(
          session,
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
        );
      }

      const scheduleUpdates = prepareScheduleAdvance(pp, normalizedDate);
      if (scheduleUpdates) {
        await plannedPaymentRepository.updateInSession(
          session,
          workplaceId,
          pp.id,
          scheduleUpdates,
          { nextOccurrence: pp.nextOccurrence },
        );
      }
      return undefined;
    });

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
    let expectedNextOccurrence = pp.nextOccurrence;

    if (nextOcc > horizon) continue;

    let generationsCount = 0;
    let generationFailed = false;
    let shouldComplete = false;
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
            expectedNextOccurrence,
            expectedStatus: PlannedPaymentStatus.ACTIVE,
          });
          if (!created) {
            generationFailed = true;
            break;
          }
          expectedNextOccurrence = calculateNextOccurrence(nextOcc, pp);
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
        shouldComplete = pp.status !== PlannedPaymentStatus.COMPLETED;
        break;
      }
    }

    if (generationsCount >= MAX_GENERATIONS) {
      logger.warn(
        `[PlannedPaymentOrchestration] Safety cap reached for payment ${pp.id}. Generated ${MAX_GENERATIONS} journals.`,
      );
    }

    if (isCancelled()) break;
    if (!generationFailed) {
      const scheduleUpdates: Partial<PlannedPaymentPersistenceInput> = {
        ...(nextOcc !== expectedNextOccurrence ? { nextOccurrence: nextOcc } : {}),
        ...(shouldComplete ? { status: PlannedPaymentStatus.COMPLETED } : {}),
      };
      if (Object.keys(scheduleUpdates).length > 0) {
        await runAccountingWriteSession(session =>
          plannedPaymentRepository.updateInSession(session, workplaceId, pp.id, scheduleUpdates, {
            nextOccurrence: expectedNextOccurrence,
          }),
        );
      }
    }
  }
}
