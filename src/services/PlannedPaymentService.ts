import { database } from '@/src/data/database/Database';
import Journal, { JournalStatus } from '@/src/data/models/Journal';
import PlannedPayment, {
  PlannedPaymentInterval,
  PlannedPaymentStatus,
} from '@/src/data/models/PlannedPayment';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { generatePlannedJournalForPayment } from '@/src/services/planned-payment/plannedPaymentJournalGeneration';
import {
  postPlannedPaymentOccurrence,
  processDuePlannedPayments,
  skipPlannedPaymentOccurrence,
} from '@/src/services/planned-payment/plannedPaymentOrchestration';
import {
  calculateNextOccurrence as advancePlannedOccurrence,
  computeFirstOccurrence as computeFirstPlannedOccurrence,
  normalizeToStartOfDay,
} from '@/src/services/planned-payment/plannedPaymentRecurrence';
import { AccountId, WorkplaceId } from '@/src/types/domain';
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
    return postPlannedPaymentOccurrence(workplaceId, pp, occurrenceDate);
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
    return skipPlannedPaymentOccurrence(workplaceId, pp, occurrenceDate);
  }

  /**
   * Process all active planned payments and generate journals for any due occurrences.
   * Typically called on app start.
   */
  async processDuePayments(workplaceId: WorkplaceId): Promise<void> {
    return processDuePlannedPayments(workplaceId);
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
