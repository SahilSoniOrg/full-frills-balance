import DailyCheckIn from '@/src/data/models/DailyCheckIn';
import { dailyCheckInRepository } from '@/src/data/repositories/DailyCheckInRepository';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { WorkplaceId } from '@/src/types/domain';
import { Q } from '@nozbe/watermelondb';
import dayjs from 'dayjs';

/**
 * Result of a streak calculation matching widget payload spec.
 */
export interface StreakResult {
  /** Number of consecutive active days ending at the most recent journal activity */
  streakDays: number;
  /** The ISO string date of the last logged journal activity, or '' if never */
  lastLoggedDate: string;
  /** Whether the user has logged a journal entry today */
  todayLogged: boolean;
}

/**
 * StreakService — Tracks consecutive days of financial journal activity
 * and supports lightweight zero-spend check-ins.
 *
 * A "day" is considered active if there is at least one journal entry for that calendar date.
 */
export class StreakService {
  /**
   * Calculate the current streak for a workplace.
   *
   * Finds consecutive active days in the journals table ending at the most
   * recent activity date.
   */
  async calculateStreak(workplaceId: WorkplaceId): Promise<StreakResult> {
    // Look back up to 365 days (generous bound for streak calculation)
    const lookbackStart = dayjs().startOf('day').subtract(365, 'day').valueOf();

    const journalDates = await this.fetchJournalDates(workplaceId, lookbackStart);

    if (journalDates.length === 0) {
      return {
        streakDays: 0,
        lastLoggedDate: '',
        todayLogged: false,
      };
    }

    // Build a Set of date strings (YYYY-MM-DD) for O(1) lookups
    const activeDates = new Set<string>();
    for (const ts of journalDates) {
      activeDates.add(dayjs(ts).format('YYYY-MM-DD'));
    }

    const todayStr = dayjs().format('YYYY-MM-DD');
    const todayLogged = activeDates.has(todayStr);

    const lastLoggedTs = Math.max(...journalDates);
    const lastLoggedDateObj = dayjs(lastLoggedTs).startOf('day');
    const lastLoggedDate = lastLoggedDateObj.toISOString();

    // Count consecutive days backwards from the most recent activity
    let streakDays = 1;
    while (true) {
      const checkDate = lastLoggedDateObj.subtract(streakDays, 'day').format('YYYY-MM-DD');
      if (activeDates.has(checkDate)) {
        streakDays++;
      } else {
        break;
      }
    }

    return {
      streakDays,
      lastLoggedDate,
      todayLogged,
    };
  }

  /**
   * Create a zero-spend check-in for a given date.
   * If no date is provided, defaults to today.
   */
  async checkInZeroSpend(workplaceId: WorkplaceId, date?: Date): Promise<DailyCheckIn> {
    const targetDate = date ?? new Date();
    const dayStart = dayjs(targetDate).startOf('day').valueOf();

    return dailyCheckInRepository.createIfAbsent(workplaceId, dayStart, true);
  }

  // ─── Private helpers ──────────────────────────────────────────────

  /**
   * Fetch distinct dates (as epoch ms at start of day) for records matching a query since a given timestamp.
   */
  private async fetchDatesSince<T>(
    fetchFn: () => Promise<T[]>,
    extractDate: (record: T) => number,
  ): Promise<number[]> {
    const records = await fetchFn();
    return this.deduplicateDates(records, extractDate);
  }

  /**
   * Deduplicate a list of records by calendar date (YYYY-MM-DD).
   * Returns epoch-ms values (start of day) for each unique date.
   */
  private deduplicateDates<T>(records: T[], extractDate: (r: T) => number): number[] {
    const seen = new Set<string>();
    const dates: number[] = [];
    for (const record of records) {
      const ts = extractDate(record);
      const dayStr = dayjs(ts).format('YYYY-MM-DD');
      if (!seen.has(dayStr)) {
        seen.add(dayStr);
        dates.push(dayjs(ts).startOf('day').valueOf());
      }
    }
    return dates;
  }

  /**
   * Fetch distinct journal dates (as epoch ms) for a workplace since a given date.
   */
  private async fetchJournalDates(workplaceId: WorkplaceId, since: number): Promise<number[]> {
    return this.fetchDatesSince(
      () =>
        journalRepository
          .journalsQuery(
            Q.where('workplace_id', workplaceId),
            Q.where('journal_date', Q.gte(since)),
            Q.sortBy('journal_date', 'desc'),
          )
          .fetch(),
      j => j.journalDate,
    );
  }
}

export const streakService = new StreakService();
