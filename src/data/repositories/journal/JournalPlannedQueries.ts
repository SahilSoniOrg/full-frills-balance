import { MetadataKeys } from '@/src/constants/ledger-constants';
import { database } from '@/src/data/database/Database';
import Journal from '@/src/data/models/Journal';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import { JournalStatus } from '@/src/types/enums';
import { JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import { safeParseJSON } from '@/src/utils/serialization';
import { Model, Q } from '@nozbe/watermelondb';

export type PlannedJournalStatus =
  JournalStatus.PLANNED | JournalStatus.PAUSED | JournalStatus.SKIPPED;

export type PlannedOccurrenceJournals =
  | { kind: 'none' }
  | { kind: 'planned'; journals: Journal[] }
  | { kind: 'settled'; journalId: JournalId };

const PLANNED_STATUSES = new Set<JournalStatus>([
  JournalStatus.PLANNED,
  JournalStatus.PAUSED,
  JournalStatus.SKIPPED,
]);

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

  /**
   * Classifies the payment's journals for one occurrence day. Posted journals claim the day of
   * their ORIGINAL_PLANNED_DATE when recorded; any non-planned claim outranks planned journals.
   */
  async findOccurrenceJournals(
    workplaceId: WorkplaceId,
    plannedPaymentId: PlannedPaymentId,
    dayStart: number,
    dayEnd: number,
  ): Promise<PlannedOccurrenceJournals> {
    const journals = await this.journals
      .query(
        Q.where('planned_payment_id', plannedPaymentId),
        Q.where('workplace_id', workplaceId),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch();
    const originalDateByJournalId = await this.originalPlannedDates(
      workplaceId,
      journals
        .filter(journal => journal.status === JournalStatus.POSTED)
        .map(journal => journal.id),
    );
    const inWindow = (date: number) => date >= dayStart && date <= dayEnd;

    const settled = journals.find(
      journal =>
        journal.status !== JournalStatus.PLANNED &&
        inWindow(originalDateByJournalId.get(journal.id) ?? journal.journalDate),
    );
    if (settled) return { kind: 'settled', journalId: settled.id };

    const planned = journals.filter(
      journal => journal.status === JournalStatus.PLANNED && inWindow(journal.journalDate),
    );
    return planned.length > 0 ? { kind: 'planned', journals: planned } : { kind: 'none' };
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
    status: PlannedJournalStatus | ((journal: Journal) => PlannedJournalStatus),
  ): Model[] {
    this.assertJournalOwnership(workplaceId, journals);
    const updates = journals.map(journal => ({
      journal,
      status: typeof status === 'function' ? status(journal) : status,
    }));
    const invalidUpdate = updates.find(update => !PLANNED_STATUSES.has(update.status));
    if (invalidUpdate) {
      throw new Error(`Unsupported planned journal status: ${invalidUpdate.status}`);
    }
    return updates.map(({ journal, status: nextStatus }) =>
      journal.prepareUpdate((record: Journal) => {
        record.status = nextStatus;
        record.updatedAt = new Date();
      }),
    );
  }

  async batchUpdateStatus(
    workplaceId: WorkplaceId,
    journals: Journal[],
    status: PlannedJournalStatus,
  ): Promise<void> {
    if (journals.length === 0) return;
    const updates = this.prepareStatusUpdates(workplaceId, journals, status);
    await database.write(async () => {
      await database.batch(updates);
    });
  }

  private async originalPlannedDates(
    workplaceId: WorkplaceId,
    journalIds: JournalId[],
  ): Promise<Map<JournalId, number>> {
    const originalDateByJournalId = new Map<JournalId, number>();
    if (journalIds.length === 0) return originalDateByJournalId;
    const metadata = await database.collections
      .get<JournalMetadata>('journal_metadata')
      .query(Q.where('workplace_id', workplaceId), Q.where('journal_id', Q.oneOf(journalIds)))
      .fetch();
    for (const row of metadata) {
      const metadataJson = safeParseJSON<Record<string, unknown>>(row.metadataJson, {});
      const rawOriginalDate = metadataJson[MetadataKeys.ORIGINAL_PLANNED_DATE];
      const originalDate =
        typeof rawOriginalDate === 'number' || typeof rawOriginalDate === 'string'
          ? Number(rawOriginalDate)
          : Number.NaN;
      if (Number.isFinite(originalDate)) {
        originalDateByJournalId.set(row.journalId, originalDate);
      }
    }
    return originalDateByJournalId;
  }

  private assertJournalOwnership(workplaceId: WorkplaceId, journals: Journal[]): void {
    this.assertModelOwnership(workplaceId, journals);
  }

  private assertModelOwnership(workplaceId: WorkplaceId, journals: Journal[]): void {
    const foreignJournal = journals.find(journal => journal.workplaceId !== workplaceId);
    if (foreignJournal) {
      throw new Error(`Journal ${foreignJournal.id} does not belong to workplace ${workplaceId}`);
    }
  }
}

export const journalPlannedQueries = new JournalPlannedQueries();
