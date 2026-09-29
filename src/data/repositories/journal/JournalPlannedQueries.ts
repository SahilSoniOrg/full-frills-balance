import { MetadataKeys } from '@/src/constants/ledger-constants';
import { database } from '@/src/data/database/Database';
import Journal from '@/src/data/models/Journal';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import { JournalStatus } from '@/src/types/enums';
import { JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import { safeParseJSON } from '@/src/utils/serialization';
import { Q } from '@nozbe/watermelondb';

export type PlannedOccurrenceJournals =
  | { kind: 'none' }
  | { kind: 'planned'; journals: Journal[] }
  | { kind: 'settled'; journalId: JournalId };

/** Read queries for planned-payment journals. Writes go through journal persistence. */
export class JournalPlannedQueries {
  private get journals() {
    return database.collections.get<Journal>('journals');
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
}

export const journalPlannedQueries = new JournalPlannedQueries();
