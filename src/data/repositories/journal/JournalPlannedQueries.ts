import { database } from '@/src/data/database/Database';
import Journal, { JournalStatus } from '@/src/data/models/Journal';
import { PlannedPaymentId, WorkplaceId } from '@/src/types/domain';
import { Model, Q } from '@nozbe/watermelondb';

/** Planned-payment journal lookups and status batch helpers. */
export class JournalPlannedQueries {
  private get journals() {
    return database.collections.get<Journal>('journals');
  }

  async findEarliestPlannedByPayment(
    workplaceId: WorkplaceId,
    plannedPaymentId: PlannedPaymentId,
  ): Promise<Journal | undefined> {
    const results = await this.journals
      .query(
        Q.where('planned_payment_id', plannedPaymentId),
        Q.where('workplace_id', workplaceId),
        Q.where('status', JournalStatus.PLANNED),
        Q.where('deleted_at', Q.eq(null)),
        Q.sortBy('journal_date', Q.asc),
      )
      .fetch();
    return results[0];
  }

  async findPlannedOnDay(
    workplaceId: WorkplaceId,
    plannedPaymentId: PlannedPaymentId,
    dayStart: number,
    dayEnd: number,
  ): Promise<Journal[]> {
    return this.journals
      .query(
        Q.where('planned_payment_id', plannedPaymentId),
        Q.where('workplace_id', workplaceId),
        Q.where('journal_date', Q.between(dayStart, dayEnd)),
        Q.where('status', JournalStatus.PLANNED),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch();
  }

  async findByPlannedPaymentIds(
    workplaceId: WorkplaceId,
    plannedPaymentIds: PlannedPaymentId[],
  ): Promise<Journal[]> {
    if (plannedPaymentIds.length === 0) return [];
    return this.journals
      .query(
        Q.where('planned_payment_id', Q.oneOf(plannedPaymentIds)),
        Q.where('workplace_id', workplaceId),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch();
  }

  async countOnDay(
    workplaceId: WorkplaceId,
    plannedPaymentId: PlannedPaymentId,
    dayStart: number,
    dayEnd: number,
  ): Promise<number> {
    return this.journals
      .query(
        Q.where('planned_payment_id', plannedPaymentId),
        Q.where('workplace_id', workplaceId),
        Q.where('journal_date', Q.between(dayStart, dayEnd)),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetchCount();
  }

  async findByPlannedPaymentAndStatus(
    workplaceId: WorkplaceId,
    plannedPaymentId: PlannedPaymentId,
    status: JournalStatus,
  ): Promise<Journal[]> {
    return this.journals
      .query(
        Q.where('planned_payment_id', plannedPaymentId),
        Q.where('workplace_id', workplaceId),
        Q.where('status', status),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch();
  }

  prepareStatusUpdates(journals: Journal[], status: JournalStatus): Model[] {
    return journals.map(journal =>
      journal.prepareUpdate((record: Journal) => {
        record.status = status;
        record.updatedAt = new Date();
      }),
    );
  }

  async batchUpdateStatus(journals: Journal[], status: JournalStatus): Promise<void> {
    if (journals.length === 0) return;
    await database.write(async () => {
      await database.batch(this.prepareStatusUpdates(journals, status));
    });
  }
}

export const journalPlannedQueries = new JournalPlannedQueries();
