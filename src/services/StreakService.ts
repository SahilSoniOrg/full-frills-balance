import { database } from '@/src/data/database/Database';
import { getRawAdapter } from '@/src/data/database/DatabaseUtils';
import DailyCheckIn from '@/src/data/models/DailyCheckIn';
import { dailyCheckInRepository } from '@/src/data/repositories/DailyCheckInRepository';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { WorkplaceId } from '@/src/types/domain';
import { Q } from '@nozbe/watermelondb';
import dayjs from 'dayjs';
import { combineLatest, debounceTime, from, Observable, switchMap } from 'rxjs';

/** Maximum lookback window (days) for streak calculation. */
const STREAK_LOOKBACK_DAYS = 90;

/**
 * Result of a streak calculation matching widget payload spec.
 */
export interface StreakResult {
  /** Number of consecutive active days ending at the most recent activity */
  streakDays: number;
  /** The ISO string date of the last logged activity (journal or check-in), or '' if never */
  lastLoggedDate: string;
  /** Whether the user has logged a journal entry or check-in today */
  todayLogged: boolean;
}

/**
 * StreakService — Tracks consecutive days of financial journal activity
 * and supports lightweight zero-spend check-ins.
 *
 * A "day" is considered active if there is at least one journal entry
 * or a zero-spend check-in for that calendar date.
 */
export class StreakService {
  /**
   * Pure calculation helper for converting journals and daily check-ins into a WidgetStreakPayload.
   */
  static calculateStreakFromRecords(
    journals: { journalDate?: number | Date; journal_date?: number | Date }[],
    checkIns: { checkInDate?: number; check_in_date?: number }[] = [],
    referenceDate: Date = new Date(),
  ): {
    streakCount: number;
    lastLoggedDate: string | null;
    todayLogged: boolean;
    canRecoverMissedDays: boolean;
    missedDaysCount: number;
  } {
    const todayStr = dayjs(referenceDate).format('YYYY-MM-DD');
    const yesterdayStr = dayjs(referenceDate).subtract(1, 'day').format('YYYY-MM-DD');

    const activeDates = new Set<string>();
    for (const j of journals) {
      const rawDate = j.journalDate ?? j.journal_date;
      if (!rawDate) continue;
      activeDates.add(dayjs(rawDate).format('YYYY-MM-DD'));
    }
    for (const c of checkIns) {
      const rawDate = c.checkInDate ?? c.check_in_date;
      if (!rawDate) continue;
      activeDates.add(dayjs(rawDate).format('YYYY-MM-DD'));
    }

    const todayLogged = activeDates.has(todayStr);
    let streakCount = 0;
    let checkCursor = dayjs(todayLogged ? todayStr : yesterdayStr);

    if (todayLogged || activeDates.has(yesterdayStr)) {
      while (activeDates.has(checkCursor.format('YYYY-MM-DD'))) {
        streakCount++;
        checkCursor = checkCursor.subtract(1, 'day');
      }
    }

    const sortedPastDates = [...activeDates]
      .filter(d => d <= todayStr)
      .sort()
      .reverse();
    const lastLoggedDate = sortedPastDates.length > 0 ? sortedPastDates[0] : null;

    return {
      streakCount,
      lastLoggedDate,
      todayLogged,
      canRecoverMissedDays: false,
      missedDaysCount: 0,
    };
  }

  /**
   * Pure calculation helper for converting journal records into a WidgetStreakPayload.
   */
  static calculateStreakFromJournals(
    journals: { journalDate?: number | Date; journal_date?: number | Date }[],
    referenceDate: Date = new Date(),
  ) {
    return StreakService.calculateStreakFromRecords(journals, [], referenceDate);
  }

  /**
   * Observe current streak reactively for a workplace.
   * Scoped to recent dates only — avoids observing the entire journal table.
   */
  observeStreak(workplaceId: WorkplaceId): Observable<StreakResult> {
    const lookbackMs = dayjs().subtract(STREAK_LOOKBACK_DAYS, 'day').startOf('day').valueOf();

    const journals$ = journalRepository
      .journalsQuery(
        Q.where('workplace_id', workplaceId),
        Q.where('journal_date', Q.gte(lookbackMs)),
      )
      .observe();

    const checkIns$ = dailyCheckInRepository
      .checkInsQuery(
        workplaceId,
        Q.where('is_zero_spend', true),
        Q.where('check_in_date', Q.gte(lookbackMs)),
      )
      .observe();

    return combineLatest([journals$, checkIns$]).pipe(
      debounceTime(100),
      switchMap(() => from(this.calculateStreak(workplaceId))),
    );
  }

  /**
   * Calculate the current active streak for a workplace.
   *
   * Uses raw SQL when available to fetch only distinct date strings
   * (no model hydration), bounded to STREAK_LOOKBACK_DAYS.
   */
  async calculateStreak(workplaceId: WorkplaceId): Promise<StreakResult> {
    const lookbackMs = dayjs().subtract(STREAK_LOOKBACK_DAYS, 'day').startOf('day').valueOf();

    const [journalDates, checkInDates] = await Promise.all([
      this.fetchJournalDateStrings(workplaceId, lookbackMs),
      dailyCheckInRepository.fetchZeroSpendDateStrings(workplaceId, lookbackMs),
    ]);

    // Merge both sets into a single active-dates set
    const activeDates = new Set<string>(journalDates);
    for (const d of checkInDates) {
      activeDates.add(d);
    }

    if (activeDates.size === 0) {
      return { streakDays: 0, lastLoggedDate: '', todayLogged: false };
    }

    const todayStr = dayjs().format('YYYY-MM-DD');
    const yesterdayStr = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
    const todayLogged = activeDates.has(todayStr);

    // Derive lastLoggedDate from sorted active dates
    const sortedDates = [...activeDates].sort();
    const lastDateStr = sortedDates[sortedDates.length - 1];
    const lastLoggedDate = dayjs(lastDateStr).startOf('day').toISOString();

    // Determine streak anchor: must be today or yesterday
    let anchorDateStr: string | null = null;
    if (todayLogged) {
      anchorDateStr = todayStr;
    } else if (activeDates.has(yesterdayStr)) {
      anchorDateStr = yesterdayStr;
    }

    if (!anchorDateStr) {
      return { streakDays: 0, lastLoggedDate, todayLogged };
    }

    // Count contiguous active days backward from anchor
    let streakDays = 0;
    let checkCursor = dayjs(anchorDateStr);
    while (activeDates.has(checkCursor.format('YYYY-MM-DD'))) {
      streakDays++;
      checkCursor = checkCursor.subtract(1, 'day');
    }

    return { streakDays, lastLoggedDate, todayLogged };
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

  // ── Private ───────────────────────────────────────────────────────

  /**
   * Fetch distinct YYYY-MM-DD date strings for non-deleted journals
   * since `sinceMs` via raw SQL (no model hydration).
   *
   * Falls back to ORM query if the raw adapter is unavailable.
   */
  private async fetchJournalDateStrings(
    workplaceId: WorkplaceId,
    sinceMs: number,
  ): Promise<Set<string>> {
    const adapter = getRawAdapter(database);
    if (adapter) {
      const rows: { day: string }[] = await adapter.queryRaw(
        `SELECT DISTINCT date(journal_date / 1000, 'unixepoch', 'localtime') AS day
         FROM journals
         WHERE workplace_id = ?
           AND deleted_at IS NULL
           AND journal_date >= ?`,
        [workplaceId, sinceMs],
      );
      return new Set(rows.map(r => r.day));
    }

    // ORM fallback — bounded fetch
    const journals = await journalRepository
      .journalsQuery(
        Q.where('workplace_id', workplaceId),
        Q.where('journal_date', Q.gte(sinceMs)),
        Q.sortBy('journal_date', 'desc'),
      )
      .fetch();

    const dates = new Set<string>();
    for (const j of journals) {
      dates.add(dayjs(j.journalDate).format('YYYY-MM-DD'));
    }
    return dates;
  }
}

export const streakService = new StreakService();
