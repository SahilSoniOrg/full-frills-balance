import { database } from '@/src/data/database/Database';
import DailyCheckIn from '@/src/data/models/DailyCheckIn';
import { WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { Q } from '@nozbe/watermelondb';

export class DailyCheckInRepository {
  private get collection() {
    return database.collections.get<DailyCheckIn>('daily_check_ins');
  }

  /**
   * Find a check-in by workplace, date, and zero-spend flag.
   */
  async findByDate(
    workplaceId: WorkplaceId,
    checkInDate: number,
    isZeroSpend?: boolean,
  ): Promise<DailyCheckIn | null> {
    const clauses: Q.Clause[] = [
      Q.where('workplace_id', workplaceId),
      Q.where('check_in_date', checkInDate),
    ];
    if (isZeroSpend !== undefined) {
      clauses.push(Q.where('is_zero_spend', isZeroSpend));
    }
    const records = await this.collection.query(...clauses).fetch();
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
    if (limit) {
      clauses.push(Q.take(limit));
    }
    return this.collection.query(...clauses).fetch();
  }

  /**
   * Find all check-ins for a workplace on or after a specific date.
   */
  async findByWorkplaceSince(workplaceId: WorkplaceId, sinceDate: number): Promise<DailyCheckIn[]> {
    return this.collection
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('check_in_date', Q.gte(sinceDate)),
        Q.sortBy('check_in_date', 'desc'),
      )
      .fetch();
  }

  /**
   * Create a new daily check-in record.
   */
  async create(
    workplaceId: WorkplaceId,
    checkInDate: number,
    isZeroSpend: boolean,
  ): Promise<DailyCheckIn> {
    return database.write(async () => {
      const record = await this.collection.create((r: DailyCheckIn) => {
        r.workplaceId = workplaceId;
        r.checkInDate = checkInDate;
        r.isZeroSpend = isZeroSpend;
      });
      logger.info(
        `[DailyCheckInRepository] Created check-in for ${new Date(checkInDate).toISOString()} (zero-spend: ${isZeroSpend})`,
      );
      return record;
    });
  }
}

export const dailyCheckInRepository = new DailyCheckInRepository();
