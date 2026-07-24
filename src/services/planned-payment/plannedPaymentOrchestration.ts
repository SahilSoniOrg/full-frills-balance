import { AppConfig } from '@/src/constants';
import { MetadataKeys, MetadataSources } from '@/src/constants/ledger-constants';
import { database } from '@/src/data/database/Database';
import Journal, { JournalStatus } from '@/src/data/models/Journal';
import PlannedPayment, { PlannedPaymentStatus } from '@/src/data/models/PlannedPayment';
import Transaction from '@/src/data/models/Transaction';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { ledgerWriteService } from '@/src/services/ledger';
import { generatePlannedJournalForPayment } from '@/src/services/planned-payment/plannedPaymentJournalGeneration';
import { buildPlannedPaymentTransferLines } from '@/src/services/planned-payment/plannedPaymentJournalLines';
import {
  calculateNextOccurrence,
  normalizeToStartOfDay,
} from '@/src/services/planned-payment/plannedPaymentRecurrence';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { PlannedPaymentId, WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { Q } from '@nozbe/watermelondb';

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
  try {
    const earliestPlanned = await database.collections
      .get<Journal>('journals')
      .query(
        Q.where('planned_payment_id', pp.id),
        Q.where('workplace_id', workplaceId),
        Q.where('status', JournalStatus.PLANNED),
        Q.where('deleted_at', Q.eq(null)),
        Q.sortBy('journal_date', Q.asc),
      )
      .fetch()
      .then(res => res[0]);

    const targetDate = earliestPlanned ? earliestPlanned.journalDate : occurrenceDate;
    const normalizedDate = normalizeToStartOfDay(targetDate);
    const dayEnd = normalizedDate + (AppConfig.time.msPerDay - 1);

    const postTime = Date.now();

    const existingPlanned = await database.collections
      .get<Journal>('journals')
      .query(
        Q.where('planned_payment_id', pp.id),
        Q.where('workplace_id', workplaceId),
        Q.where('journal_date', Q.between(normalizedDate, dayEnd)),
        Q.where('status', JournalStatus.PLANNED),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch();

    if (existingPlanned.length > 0) {
      const j = existingPlanned[0];
      const txs = await transactionRepository.findByJournal(workplaceId, j.id);
      const originalDate = j.journalDate;

      await database.write(async () => {
        const metadataOp = await journalRepository.prepareMetadataPatch(
          workplaceId,
          j.id,
          { [MetadataKeys.ORIGINAL_PLANNED_DATE]: originalDate },
          MetadataSources.MANUAL_POST,
        );

        const journalOp = j.prepareUpdate((record: Journal) => {
          record.status = JournalStatus.POSTED;
          record.journalDate = postTime;
          record.updatedAt = new Date();
        });

        const txOps = txs.map((tx: Transaction) =>
          tx.prepareUpdate((record: Transaction) => {
            record.transactionDate = postTime;
            record.updatedAt = new Date();
          }),
        );

        await database.batch([metadataOp, journalOp, ...txOps]);
      });

      rebuildQueueService.enqueueMany(
        new Set(txs.map((t: Transaction) => t.accountId)),
        postTime,
        workplaceId,
      );
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
        pp.workplaceId,
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
  try {
    const earliestPlanned = await database.collections
      .get<Journal>('journals')
      .query(
        Q.where('planned_payment_id', pp.id),
        Q.where('status', JournalStatus.PLANNED),
        Q.where('deleted_at', Q.eq(null)),
        Q.sortBy('journal_date', Q.asc),
      )
      .fetch()
      .then(res => res[0]);

    const targetDate = earliestPlanned ? earliestPlanned.journalDate : occurrenceDate;
    const normalizedDate = normalizeToStartOfDay(targetDate);
    const dayEnd = normalizedDate + (AppConfig.time.msPerDay - 1);

    const existingPlanned = await database.collections
      .get<Journal>('journals')
      .query(
        Q.where('planned_payment_id', pp.id),
        Q.where('journal_date', Q.between(normalizedDate, dayEnd)),
        Q.where('status', JournalStatus.PLANNED),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch();

    await database.write(async () => {
      for (const journal of existingPlanned) {
        await journal.update((record: Journal) => {
          record.status = JournalStatus.SKIPPED;
          record.updatedAt = new Date();
        });
      }
    });

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
          pp.workplaceId,
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
export async function processDuePlannedPayments(workplaceId: WorkplaceId): Promise<void> {
  const activePayments = await plannedPaymentRepository.findAllActive(workplaceId);
  const nowTime = normalizeToStartOfDay(Date.now());
  const horizon = nowTime + AppConfig.insights.recurringHorizonDays * AppConfig.time.msPerDay;

  const allPlannedIds = activePayments.map(p => p.id);
  const existingJournals =
    allPlannedIds.length > 0
      ? await database.collections
          .get<Journal>('journals')
          .query(
            Q.where('planned_payment_id', Q.oneOf(allPlannedIds)),
            Q.where('deleted_at', Q.eq(null)),
          )
          .fetch()
      : [];

  const journalledDays = new Map<string, Set<number>>();
  for (const j of existingJournals) {
    const dayStart = normalizeToStartOfDay(j.journalDate);
    if (!journalledDays.has(j.plannedPaymentId!)) {
      journalledDays.set(j.plannedPaymentId!, new Set());
    }
    journalledDays.get(j.plannedPaymentId!)!.add(dayStart);
  }

  for (const pp of activePayments) {
    let nextOcc = normalizeToStartOfDay(pp.nextOccurrence);

    if (nextOcc > horizon) continue;

    let generationsCount = 0;
    const MAX_GENERATIONS = AppConfig.insights.maxPlannedPaymentGenerations;

    while (nextOcc <= horizon && generationsCount < MAX_GENERATIONS) {
      generationsCount++;

      const alreadyExists = journalledDays.get(pp.id)?.has(nextOcc) ?? false;

      if (!alreadyExists) {
        const dayEnd = nextOcc + (AppConfig.time.msPerDay - 1);
        const dbExists = await database.collections
          .get<Journal>('journals')
          .query(
            Q.where('planned_payment_id', pp.id),
            Q.where('journal_date', Q.between(nextOcc, dayEnd)),
            Q.where('deleted_at', Q.eq(null)),
          )
          .fetchCount();

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
