import { database } from '@/src/data/database/Database';
import { getRawAdapter } from '@/src/data/database/DatabaseUtils';
import DailyCheckIn from '@/src/data/models/DailyCheckIn';
import { WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { Q, Query } from '@nozbe/watermelondb';
import dayjs from 'dayjs';

export class DailyCheckInRepository {
  private get collection() {
    return database.collections.get<DailyCheckIn>('daily_check_ins');
  }

  /**
   * Expose query builder for DailyCheckIn model scoped to workplace.
   */
  checkInsQuery(workplaceId: WorkplaceId, ...clauses: Q.Clause[]): Query<DailyCheckIn> {
    return this.collection.query(Q.where('workplace_id', workplaceId), ...clauses);
  }

  /**
   * Find a check-in by workplace and date.
   */
  async findByDate(workplaceId: WorkplaceId, checkInDate: number): Promise<DailyCheckIn | null> {
    const records = await this.collection
      .query(Q.where('workplace_id', workplaceId), Q.where('check_in_date', checkInDate))
      .fetch();
    return records[0] ?? null;
  }

  /**
   * Find all check-ins for a workplace ordered by date descending.
   */
  async findByWorkplace(workplaceId: WorkplaceId, limit?: number): Promise<DailyCheckIn[]> {
    const clauses: Q.Clause[] = [
      Q.where('workplace_id', workplaceId),
      Q.sortBy('check_in_date', 'desc'),
    ];
    if (limit !== undefined) {
      clauses.push(Q.take(limit));
    }
    return this.collection.query(...clauses).fetch();
  }

  /**
   * Fetch distinct YYYY-MM-DD date strings for zero-spend check-ins
   * since `sinceMs` via raw SQL (no model hydration).
   *
   * Falls back to ORM query if the raw adapter is unavailable.
   */
  async fetchZeroSpendDateStrings(workplaceId: WorkplaceId, sinceMs: number): Promise<Set<string>> {
    const adapter = getRawAdapter(database);
    if (adapter) {
      const rows: { day: string }[] = await adapter.queryRaw(
        `SELECT DISTINCT date(check_in_date / 1000, 'unixepoch', 'localtime') AS day
         FROM daily_check_ins
         WHERE workplace_id = ?
           AND is_zero_spend = 1
           AND check_in_date >= ?`,
        [workplaceId, sinceMs],
      );
      return new Set(rows.map(r => r.day));
    }

    // ORM fallback
    const records = await this.collection
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('is_zero_spend', true),
        Q.where('check_in_date', Q.gte(sinceMs)),
        Q.sortBy('check_in_date', 'desc'),
      )
      .fetch();

    const dates = new Set<string>();
    for (const c of records) {
      dates.add(dayjs(c.checkInDate).format('YYYY-MM-DD'));
    }
    return dates;
  }

  /**
   * Create or update a daily check-in record for the specified date atomically.
   */
  async createIfAbsent(
    workplaceId: WorkplaceId,
    checkInDate: number,
    isZeroSpend: boolean,
  ): Promise<DailyCheckIn> {
    return database.write(async () => {
      // Inline query instead of delegating to findByDate() — keeps atomicity explicit
      const existing = await this.collection
        .query(Q.where('workplace_id', workplaceId), Q.where('check_in_date', checkInDate))
        .fetch()
        .then(records => records[0] ?? null);

      if (existing) {
        if (existing.isZeroSpend !== isZeroSpend) {
          await existing.update((r: DailyCheckIn) => {
            r.isZeroSpend = isZeroSpend;
          });
          logger.info(
            `[DailyCheckInRepository] Updated check-in ${new Date(checkInDate).toISOString()} → zero-spend: ${isZeroSpend}`,
          );
        }
        return existing;
      }

      const record = await this.collection.create((r: DailyCheckIn) => {
        r.workplaceId = workplaceId;
        r.checkInDate = checkInDate;
        r.isZeroSpend = isZeroSpend;
      });
      logger.info(
        `[DailyCheckInRepository] Created check-in ${new Date(checkInDate).toISOString()} (zero-spend: ${isZeroSpend})`,
      );
      return record;
    });
  }
}

export const dailyCheckInRepository = new DailyCheckInRepository();
