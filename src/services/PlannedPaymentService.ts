import { AppConfig } from '@/src/constants';
import { MetadataKeys, MetadataSources } from '@/src/constants/ledger-constants';
import { database } from '@/src/data/database/Database';
import Journal, { JournalStatus } from '@/src/data/models/Journal';
import PlannedPayment, {
  PlannedPaymentInterval,
  PlannedPaymentStatus,
} from '@/src/data/models/PlannedPayment';
import Transaction from '@/src/data/models/Transaction';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { ledgerWriteService } from '@/src/services/ledger';
import { generatePlannedJournalForPayment } from '@/src/services/planned-payment/plannedPaymentJournalGeneration';
import { buildPlannedPaymentTransferLines } from '@/src/services/planned-payment/plannedPaymentJournalLines';
import {
  calculateNextOccurrence as advancePlannedOccurrence,
  computeFirstOccurrence as computeFirstPlannedOccurrence,
  normalizeToStartOfDay,
} from '@/src/services/planned-payment/plannedPaymentRecurrence';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { AccountId, PlannedPaymentId, WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { Q } from '@nozbe/watermelondb';

export class PlannedPaymentService {
  /**
   * Calculates the next occurrence based on interval and recurrence rules.
   */
  calculateNextOccurrence(
    current: number,
    pp: {
      intervalN: number;
      intervalType: PlannedPaymentInterval;
      recurrenceDay?: number;
      recurrenceMonth?: number;
    },
  ): number {
    return advancePlannedOccurrence(current, pp);
  }

  /** Computes the first occurrence date for a new planned payment. */
  computeFirstOccurrence(
    startDate: number,
    pp: {
      intervalN: number;
      intervalType: PlannedPaymentInterval;
      recurrenceDay?: number;
      recurrenceMonth?: number;
    },
  ): number {
    return computeFirstPlannedOccurrence(startDate, pp);
  }

  /**
   * Generates a PLANNED journal from a rule.
   */
  async generatePlannedJournal(pp: PlannedPayment, occurrenceDate: number): Promise<void> {
    return generatePlannedJournalForPayment(pp, occurrenceDate);
  }

  async postOccurrence(
    workplaceId: WorkplaceId,
    pp: PlannedPayment,
    occurrenceDate: number,
  ): Promise<void> {
    try {
      // normalizedDate is midnight of the occurrence day — used only for day-window queries.
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

      // Use current time as the actual journal timestamp so manually posted
      // journals aren't all stamped at midnight (Bug 3 fix).
      const postTime = Date.now();

      // 1. Check if we already have a PLANNED journal for this occurrence
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
        // Promote to POSTED by patching status and updating the journal date
        // to the current time so the post timestamp is accurate.
        const j = existingPlanned[0];
        const txs = await transactionRepository.findByJournal(workplaceId, j.id);
        const originalDate = j.journalDate;

        // Single atomic write: metadata + journal + transactions.
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
        // Rebuild balance for affected accounts.
        rebuildQueueService.enqueueMany(
          new Set(txs.map((t: Transaction) => t.accountId)),
          postTime,
          workplaceId,
        );
      } else {
        // Fallback: Create new POSTED journal if none existed
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

      // 2. Advance the next occurrence
      const nextOcc = this.calculateNextOccurrence(normalizedDate, pp);

      // 3. Update the planned payment record
      // Only advance if the new next occurrence is actually later than the current one.
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
   * Skips a specific occurrence of a planned payment.
   * Deletes any existing PLANNED journal for that occurrence and advances the schedule.
   */
  async skipOccurrence(
    workplaceId: WorkplaceId,
    pp: PlannedPayment,
    occurrenceDate: number,
  ): Promise<void> {
    try {
      // 1. Target the earliest scheduled journal if one exists, otherwise use the provided occurrenceDate
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
        // Guard: a missing destination account would produce a 1-legged journal
        // (CREDIT with no DEBIT), silently corrupting running_balance.
        // Match the same guard used in generatePlannedJournal.
        if (!pp.toAccountId) {
          logger.warn(
            `[PlannedPaymentService] skipOccurrence: payment ${pp.id} has no toAccountId — advancing schedule without creating a journal.`,
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

      // 2. Advance the schedule
      const nextOcc = this.calculateNextOccurrence(normalizedDate, pp);

      // 3. Update the planned payment record
      // Only advance if the new next occurrence is actually later than the current one.
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
   * Typically called on app start.
   */
  async processDuePayments(workplaceId: WorkplaceId): Promise<void> {
    const activePayments = await plannedPaymentRepository.findAllActive(workplaceId);
    const nowTime = normalizeToStartOfDay(Date.now());
    const horizon = nowTime + AppConfig.insights.recurringHorizonDays * AppConfig.time.msPerDay;

    // H-3 fix: pre-fetch all relevant journals in ONE query before the loop.
    // Without this, the while-loop issues a fetchCount() per occurrence —
    // O(N×occurrences) sequential DB round-trips at startup.
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

    // Build a quick-lookup: paymentId → Set of day-start timestamps already journalled
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

        // In-memory duplicate check — no DB query per occurrence.
        const alreadyExists = journalledDays.get(pp.id)?.has(nextOcc) ?? false;

        if (!alreadyExists) {
          // F-09 Fix: Add a secondary DB-level check right before generation
          // to prevent duplicate generation if processDuePayments runs concurrently
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
            await this.generatePlannedJournal(pp, nextOcc);
            // Register the new day so back-to-back occurrences don't double-generate.
            if (!journalledDays.has(pp.id)) journalledDays.set(pp.id, new Set());
            journalledDays.get(pp.id)!.add(nextOcc);
          } else {
            logger.warn(
              `[PlannedPaymentService] Prevented duplicate journal generation for payment ${pp.id} via db-level check.`,
            );
          }
        }

        nextOcc = this.calculateNextOccurrence(nextOcc, pp);

        if (pp.endDate && nextOcc > pp.endDate) {
          await plannedPaymentRepository.update(workplaceId, pp, {
            status: PlannedPaymentStatus.COMPLETED,
          });
          break;
        }
      }

      if (generationsCount >= MAX_GENERATIONS) {
        logger.warn(
          `[PlannedPaymentService] Safety cap reached for payment ${pp.id}. Generated ${MAX_GENERATIONS} journals.`,
        );
      }

      if (nextOcc !== pp.nextOccurrence) {
        await plannedPaymentRepository.update(workplaceId, pp, { nextOccurrence: nextOcc });
      }
    }
  }

  /**
   * Prepares WatermelonDB operations to merge planned payments from source accounts to a target account.
   */
  async prepareMergeOperations(
    workplaceId: WorkplaceId,
    sourceAccountIds: AccountId[],
    targetAccountId: AccountId,
  ): Promise<PlannedPayment[]> {
    const plannedFrom = await plannedPaymentRepository.findAllByFromAccountIds(
      workplaceId,
      sourceAccountIds,
    );
    const plannedTo = await plannedPaymentRepository.findAllByToAccountIds(
      workplaceId,
      sourceAccountIds,
    );

    // Use a Map to aggregate mutations for the same record
    const mutations = new Map<
      string,
      { from?: AccountId; to?: AccountId; record: PlannedPayment }
    >();

    plannedFrom.forEach(p => {
      if (!mutations.has(p.id)) {
        mutations.set(p.id, { record: p });
      }
      mutations.get(p.id)!.from = targetAccountId;
    });

    plannedTo.forEach(p => {
      if (!mutations.has(p.id)) {
        mutations.set(p.id, { record: p });
      }
      mutations.get(p.id)!.to = targetAccountId;
    });

    // Emit exactly one prepareUpdate per record
    return Array.from(mutations.values()).map(({ record, from, to }) => {
      return record.prepareUpdate((r: PlannedPayment) => {
        if (from) r.fromAccountId = from;
        if (to) r.toAccountId = to;
        r.updatedAt = new Date();
      });
    });
  }

  /**
   * Toggles the status of a planned payment.
   * If pausing, it cleans up (soft-deletes) future PLANNED journals and transactions.
   * If resuming, it regenerates future occurrences.
   */
  async toggleStatus(workplaceId: WorkplaceId, pp: PlannedPayment): Promise<PlannedPaymentStatus> {
    const newStatus =
      pp.status === PlannedPaymentStatus.ACTIVE
        ? PlannedPaymentStatus.PAUSED
        : PlannedPaymentStatus.ACTIVE;

    const isPausing = newStatus === PlannedPaymentStatus.PAUSED;
    const targetStatus = isPausing ? JournalStatus.PLANNED : JournalStatus.PAUSED;

    const targetJournals = await database.collections
      .get<Journal>('journals')
      .query(
        Q.where('planned_payment_id', pp.id),
        Q.where('workplace_id', workplaceId),
        Q.where('status', targetStatus),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch();

    const nowMidnight = normalizeToStartOfDay(Date.now());
    let updatedNextOccurrence = pp.nextOccurrence;

    if (!isPausing) {
      // Catch up nextOccurrence to the first occurrence on or after today
      while (updatedNextOccurrence < nowMidnight) {
        updatedNextOccurrence = this.calculateNextOccurrence(updatedNextOccurrence, pp);
      }
    }

    await database.write(async () => {
      const ppUpdate = pp.prepareUpdate((record: PlannedPayment) => {
        record.status = newStatus;
        if (!isPausing) {
          record.nextOccurrence = updatedNextOccurrence;
        }
        record.updatedAt = new Date();
      });

      const journalUpdates = targetJournals.map(j =>
        j.prepareUpdate((record: Journal) => {
          if (isPausing) {
            record.status = JournalStatus.PAUSED;
          } else {
            record.status =
              normalizeToStartOfDay(j.journalDate) >= nowMidnight
                ? JournalStatus.PLANNED
                : JournalStatus.SKIPPED;
          }
          record.updatedAt = new Date();
        }),
      );

      await database.batch([ppUpdate, ...journalUpdates]);
    });

    if (!isPausing) {
      // Regenerate future occurrences
      await this.processDuePayments(workplaceId);
    }

    return newStatus;
  }
}

export const plannedPaymentService = new PlannedPaymentService();
