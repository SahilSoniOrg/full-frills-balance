import { dailyCheckInRepository } from '@/src/data/repositories/DailyCheckInRepository';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import DailyCheckIn from '@/src/data/models/DailyCheckIn';
import { WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { Q } from '@nozbe/watermelondb';
import dayjs from 'dayjs';

/**
 * Result of a streak calculation.
 */
export interface StreakResult {
  /** Number of consecutive days ending at the most recent activity */
  streakCount: number;
  /** The date (epoch ms) of the last logged activity, or null if never */
  lastLoggedDate: number | null;
  /** Whether the user has logged anything today */
  todayLogged: boolean;
  /** Whether the user can recover missed days (1-2 day gap) */
  canRecoverMissedDays: boolean;
  /** Number of consecutive missed days between today and the last activity */
  missedDaysCount: number;
}

/**
 * StreakService — Tracks consecutive days of financial journal activity
 * and supports lightweight zero-spend check-ins for streak maintenance.
 *
 * A "day" is considered active if there is at least one journal entry OR
 * one daily_check_in record for that calendar date (in the user's local time).
 *
 * The streak is the number of consecutive active days ending at the most
 * recent activity date.
 *
 * Recovery window: If the gap since the last activity is 1-2 days, the
 * user can backdate a zero-spend check-in to close the gap and preserve
 * the streak.
 */
export class StreakService {
  /**
   * Calculate the current streak for a workplace.
   *
   * Finds the most recent activity date and walks backwards counting
   * consecutive active days.
   */
  async calculateStreak(workplaceId: WorkplaceId): Promise<StreakResult> {
    // Look back up to 365 days (generous bound for streak calculation)
    const lookbackStart = dayjs().startOf('day').subtract(365, 'day').valueOf();

    // Fetch all relevant journal dates and check-in dates in one shot each
    const [journalDates, checkInDates] = await Promise.all([
      this.fetchJournalDates(workplaceId, lookbackStart),
      this.fetchCheckInDates(workplaceId, lookbackStart),
    ]);

    // Build a Set of date strings (YYYY-MM-DD) for O(1) lookups
    const activeDates = new Set<string>();
    for (const ts of journalDates) {
      activeDates.add(dayjs(ts).format('YYYY-MM-DD'));
    }
    for (const ts of checkInDates) {
      activeDates.add(dayjs(ts).format('YYYY-MM-DD'));
    }

    const todayStr = dayjs().format('YYYY-MM-DD');
    const todayLogged = activeDates.has(todayStr);

    // Determine the most recent activity date
    const allTimestamps = [...journalDates, ...checkInDates];
    if (allTimestamps.length === 0) {
      return {
        streakCount: 0,
        lastLoggedDate: null,
        todayLogged: false,
        canRecoverMissedDays: false,
        missedDaysCount: 0,
      };
    }

    const lastLoggedTs = Math.max(...allTimestamps);
    const lastLoggedDate = dayjs(lastLoggedTs).startOf('day');

    // Count consecutive days backwards from the most recent activity
    let streakCount = 1;
    while (true) {
      const checkDate = lastLoggedDate.subtract(streakCount, 'day').format('YYYY-MM-DD');
      if (activeDates.has(checkDate)) {
        streakCount++;
      } else {
        break;
      }
    }

    // Calculate missed days: days between last activity and today (exclusive)
    const gapDays = dayjs().startOf('day').diff(lastLoggedDate, 'day');
    // If last activity was today, gapDays = 0, missedDays = 0
    // If last activity was yesterday, gapDays = 1, missedDays = 0 (streak is still intact)
    // If last activity was 2 days ago, gapDays = 2, missedDays = 1
    const missedDaysCount = gapDays > 0 ? gapDays - 1 : 0;

    return {
      streakCount,
      lastLoggedDate: lastLoggedDate.valueOf(),
      todayLogged,
      canRecoverMissedDays: missedDaysCount >= 1 && missedDaysCount <= 2,
      missedDaysCount,
    };
  }

  /**
   * Create a zero-spend check-in for a given date.
   * If no date is provided, defaults to today.
   * Supports backdating for the 2-day recovery window.
   */
  async checkInZeroSpend(workplaceId: WorkplaceId, date?: Date): Promise<DailyCheckIn> {
    const targetDate = date ?? new Date();
    const dayStart = dayjs(targetDate).startOf('day').valueOf();

    // Check for existing check-in to avoid duplicates
    const existing = await dailyCheckInRepository.findByDate(workplaceId, dayStart, true);
    if (existing) {
      logger.info(
        `[StreakService] Zero-spend check-in already exists for ${dayjs(dayStart).format('YYYY-MM-DD')}`,
      );
      return existing;
    }

    return dailyCheckInRepository.create(workplaceId, dayStart, true);
  }

  /**
   * Check whether the user can recover missed days via backdated zero-spend check-ins.
   * Returns the number of missed days (0, 1, or 2) that can be recovered.
   *
   * TODO: This is a thin wrapper around calculateStreak. Consider inlining
   * callers or removing this method in favour of calling calculateStreak directly.
   */
  async canRecoverMissedDays(workplaceId: WorkplaceId): Promise<{
    canRecover: boolean;
    missedDays: number;
  }> {
    const streak = await this.calculateStreak(workplaceId);
    return {
      canRecover: streak.canRecoverMissedDays,
      missedDays: streak.missedDaysCount,
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────

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
    const journals = await journalRepository
      .journalsQuery(
        Q.where('workplace_id', workplaceId),
        Q.where('journal_date', Q.gte(since)),
        Q.sortBy('journal_date', 'desc'),
      )
      .fetch();

    return this.deduplicateDates(journals, j => j.journalDate);
  }

  /**
   * Fetch distinct daily check-in dates (as epoch ms) for a workplace since a given date.
   */
  private async fetchCheckInDates(workplaceId: WorkplaceId, since: number): Promise<number[]> {
    const checkIns = await dailyCheckInRepository.findByWorkplaceSince(workplaceId, since);
    return this.deduplicateDates(checkIns, ci => ci.checkInDate);
  }
}

export const streakService = new StreakService();
