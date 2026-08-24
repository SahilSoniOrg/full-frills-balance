import { database } from '@/src/data/database/Database';
import Journal from '@/src/data/models/Journal';
import { JournalStatus } from '@/src/types/enums';
import { PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
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

  async findUnpostedByPlannedPayment(
    workplaceId: WorkplaceId,
    plannedPaymentId: PlannedPaymentId,
  ): Promise<Journal[]> {
    return this.journals
      .query(
        Q.where('planned_payment_id', plannedPaymentId),
        Q.where('workplace_id', workplaceId),
        Q.where(
          'status',
          Q.oneOf([JournalStatus.PLANNED, JournalStatus.PAUSED, JournalStatus.SKIPPED]),
        ),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch();
  }

  prepareStatusUpdates(
    workplaceId: WorkplaceId,
    journals: Journal[],
    status: JournalStatus,
  ): Model[] {
    this.assertJournalOwnership(workplaceId, journals);
    return journals.map(journal =>
      journal.prepareUpdate((record: Journal) => {
        record.status = status;
        record.updatedAt = new Date();
      }),
    );
  }

  async batchUpdateStatus(
    workplaceId: WorkplaceId,
    journals: Journal[],
    status: JournalStatus,
  ): Promise<void> {
    if (journals.length === 0) return;
    const updates = this.prepareStatusUpdates(workplaceId, journals, status);
    await database.write(async () => {
      await database.batch(updates);
    });
  }

  private assertJournalOwnership(workplaceId: WorkplaceId, journals: Journal[]): void {
    const foreignJournal = journals.find(journal => journal.workplaceId !== workplaceId);
    if (foreignJournal) {
      throw new Error(`Journal ${foreignJournal.id} does not belong to workplace ${workplaceId}`);
    }
  }
}

export const journalPlannedQueries = new JournalPlannedQueries();
