import { dailyCheckInRepository } from '@/src/data/repositories/DailyCheckInRepository';
import { streakService } from '@/src/services/StreakService';
import { WorkplaceId } from '@/src/types/domain';
import dayjs from 'dayjs';

// ─── Mocks ──────────────────────────────────────────────────────────

jest.mock('@/src/data/repositories/DailyCheckInRepository');
jest.mock('@/src/data/database/Database', () => ({
  database: {
    collections: {
      get: jest.fn(),
    },
    write: jest.fn((cb: () => any) => cb()),
    batch: jest.fn(),
  },
}));

const mockedDailyCheckInRepo = dailyCheckInRepository as jest.Mocked<typeof dailyCheckInRepository>;

/**
 * Helper: returns epoch ms for start of a given ISO date (local tz).
 */
function dayStart(isoDate: string): number {
  return dayjs(isoDate).startOf('day').valueOf();
}

describe('StreakService', () => {
  const workplaceId = 'test-workplace-1' as WorkplaceId;

  let mockJournalsFetch: jest.Mock;
  let mockJournalsQuery: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default: no journals or check-ins
    mockJournalsFetch = jest.fn().mockResolvedValue([]);
    mockJournalsQuery = jest.fn().mockReturnValue({ fetch: mockJournalsFetch });
    const db = require('@/src/data/database/Database').database;
    db.collections.get.mockReturnValue({ query: mockJournalsQuery });

    mockedDailyCheckInRepo.findByWorkplaceSince.mockResolvedValue([]);
    mockedDailyCheckInRepo.findByDate.mockResolvedValue(null);
    mockedDailyCheckInRepo.create.mockImplementation(
      async (_wp: WorkplaceId, date: number, isZero: boolean) => {
        return {
          id: 'mock-checkin-id',
          workplaceId: _wp,
          checkInDate: date,
          isZeroSpend: isZero,
        } as any;
      },
    );
  });

  // ── Streak Calculation Tests ─────────────────────────────────────

  describe('calculateStreak', () => {
    it('should return 0 streak when no activity exists', async () => {
      const result = await streakService.calculateStreak(workplaceId);

      expect(result.streakCount).toBe(0);
      expect(result.todayLogged).toBe(false);
      expect(result.lastLoggedDate).toBeNull();
      expect(result.canRecoverMissedDays).toBe(false);
      expect(result.missedDaysCount).toBe(0);
    });

    it('should count consecutive days from most recent activity with journal entries', async () => {
      const today = dayStart(dayjs().format('YYYY-MM-DD'));
      const yesterday = dayStart(dayjs().subtract(1, 'day').format('YYYY-MM-DD'));
      const twoDaysAgo = dayStart(dayjs().subtract(2, 'day').format('YYYY-MM-DD'));

      mockJournalsFetch.mockResolvedValue([
        { journalDate: today },
        { journalDate: yesterday },
        { journalDate: twoDaysAgo },
      ]);

      const result = await streakService.calculateStreak(workplaceId);

      expect(result.streakCount).toBe(3);
      expect(result.todayLogged).toBe(true);
      expect(result.canRecoverMissedDays).toBe(false);
      expect(result.missedDaysCount).toBe(0);
    });

    it('should include daily check-ins in streak calculation', async () => {
      const today = dayStart(dayjs().format('YYYY-MM-DD'));
      const yesterday = dayStart(dayjs().subtract(1, 'day').format('YYYY-MM-DD'));

      mockJournalsFetch.mockResolvedValue([{ journalDate: yesterday }]);

      mockedDailyCheckInRepo.findByWorkplaceSince.mockResolvedValue([
        { checkInDate: today } as any,
      ]);

      const result = await streakService.calculateStreak(workplaceId);

      expect(result.streakCount).toBe(2);
      expect(result.todayLogged).toBe(true);
    });

    it('should break streak when there is a 3+ day gap since last activity', async () => {
      // Last activity 4 days ago — gap of 3 missed days (days -3, -2, -1)
      const fourDaysAgo = dayStart(dayjs().subtract(4, 'day').format('YYYY-MM-DD'));

      mockJournalsFetch.mockResolvedValue([{ journalDate: fourDaysAgo }]);

      const result = await streakService.calculateStreak(workplaceId);

      expect(result.streakCount).toBe(1);
      expect(result.todayLogged).toBe(false);
      expect(result.canRecoverMissedDays).toBe(false);
      expect(result.missedDaysCount).toBe(3);
    });

    it('should handle mixed journal and check-in dates without duplicates', async () => {
      const today = dayStart(dayjs().format('YYYY-MM-DD'));
      const yesterday = dayStart(dayjs().subtract(1, 'day').format('YYYY-MM-DD'));
      const twoDaysAgo = dayStart(dayjs().subtract(2, 'day').format('YYYY-MM-DD'));

      mockJournalsFetch.mockResolvedValue([{ journalDate: today }, { journalDate: twoDaysAgo }]);

      mockedDailyCheckInRepo.findByWorkplaceSince.mockResolvedValue([
        { checkInDate: yesterday } as any,
      ]);

      const result = await streakService.calculateStreak(workplaceId);

      expect(result.streakCount).toBe(3);
      expect(result.todayLogged).toBe(true);
    });
  });

  // ── Zero-Spend Check-In Tests ────────────────────────────────────

  describe('checkInZeroSpend', () => {
    it('should create a zero-spend check-in for today', async () => {
      const result = await streakService.checkInZeroSpend(workplaceId);

      expect(mockedDailyCheckInRepo.create).toHaveBeenCalledTimes(1);
      expect(mockedDailyCheckInRepo.create).toHaveBeenCalledWith(
        workplaceId,
        dayStart(dayjs().format('YYYY-MM-DD')),
        true,
      );
      expect(result.isZeroSpend).toBe(true);
    });

    it('should create a zero-spend check-in for a specified date (backdating)', async () => {
      const targetDate = dayjs().subtract(1, 'day').toDate();
      const targetDayStart = dayStart(dayjs(targetDate).format('YYYY-MM-DD'));

      const result = await streakService.checkInZeroSpend(workplaceId, targetDate);

      expect(mockedDailyCheckInRepo.create).toHaveBeenCalledWith(workplaceId, targetDayStart, true);
      expect(dayjs(result.checkInDate).format('YYYY-MM-DD')).toBe(
        dayjs(targetDate).format('YYYY-MM-DD'),
      );
    });

    it('should return existing check-in if one already exists for the date', async () => {
      const todayStart = dayStart(dayjs().format('YYYY-MM-DD'));
      mockedDailyCheckInRepo.findByDate.mockResolvedValue({
        id: 'existing-id',
        workplaceId,
        checkInDate: todayStart,
        isZeroSpend: true,
      } as any);

      const result = await streakService.checkInZeroSpend(workplaceId);

      expect(mockedDailyCheckInRepo.create).not.toHaveBeenCalled();
      expect(result.id).toBe('existing-id');
    });
  });

  // ── Recovery Window Tests ────────────────────────────────────────

  describe('canRecoverMissedDays', () => {
    it('should return canRecover=true when 1 day is missed (last activity 2 days ago)', async () => {
      // Activity 2 days ago → gap of 1 missed day (yesterday)
      const twoDaysAgo = dayStart(dayjs().subtract(2, 'day').format('YYYY-MM-DD'));

      mockJournalsFetch.mockResolvedValue([{ journalDate: twoDaysAgo }]);

      const result = await streakService.canRecoverMissedDays(workplaceId);

      expect(result.canRecover).toBe(true);
      expect(result.missedDays).toBe(1);
    });

    it('should return canRecover=true when 2 days are missed (last activity 3 days ago)', async () => {
      // Activity 3 days ago → gap of 2 missed days (day before yesterday, yesterday)
      const threeDaysAgo = dayStart(dayjs().subtract(3, 'day').format('YYYY-MM-DD'));

      mockJournalsFetch.mockResolvedValue([{ journalDate: threeDaysAgo }]);

      const result = await streakService.canRecoverMissedDays(workplaceId);

      expect(result.canRecover).toBe(true);
      expect(result.missedDays).toBe(2);
    });

    it('should return canRecover=false when 3+ days are missed (last activity 4+ days ago)', async () => {
      // Activity 4 days ago → gap of 3 missed days → not recoverable
      const fourDaysAgo = dayStart(dayjs().subtract(4, 'day').format('YYYY-MM-DD'));

      mockJournalsFetch.mockResolvedValue([{ journalDate: fourDaysAgo }]);

      const result = await streakService.canRecoverMissedDays(workplaceId);

      expect(result.canRecover).toBe(false);
      expect(result.missedDays).toBe(3);
    });

    it('should return canRecover=false when today is already logged', async () => {
      const today = dayStart(dayjs().format('YYYY-MM-DD'));

      mockJournalsFetch.mockResolvedValue([{ journalDate: today }]);

      const result = await streakService.canRecoverMissedDays(workplaceId);

      expect(result.canRecover).toBe(false);
      expect(result.missedDays).toBe(0);
    });
  });

  // ── Integration Scenarios ────────────────────────────────────────

  describe('streak with recovery', () => {
    it('should allow recovery via backdated check-ins, then extend the streak', async () => {
      // Scenario:
      //   Day -3: User journals (last activity before gap)
      //   Day -2: Missed (gap day 1)
      //   Day -1: Missed (gap day 2)
      //   Day  0 (today): User journals AND backdated check-in for Day -2 AND Day -1

      const threeDaysAgo = dayStart(dayjs().subtract(3, 'day').format('YYYY-MM-DD'));
      const twoDaysAgo = dayStart(dayjs().subtract(2, 'day').format('YYYY-MM-DD'));
      const yesterday = dayStart(dayjs().subtract(1, 'day').format('YYYY-MM-DD'));
      const today = dayStart(dayjs().format('YYYY-MM-DD'));

      // Before recovery: only day -3 has activity
      mockJournalsFetch.mockResolvedValue([{ journalDate: threeDaysAgo }]);
      mockedDailyCheckInRepo.findByWorkplaceSince.mockResolvedValue([]);
      mockedDailyCheckInRepo.findByDate.mockResolvedValue(null);

      let result = await streakService.calculateStreak(workplaceId);
      expect(result.streakCount).toBe(1);
      expect(result.canRecoverMissedDays).toBe(true);
      expect(result.missedDaysCount).toBe(2);

      // Now user journals today AND backdated check-ins for day -2 and day -1
      mockJournalsFetch.mockResolvedValue([{ journalDate: threeDaysAgo }, { journalDate: today }]);

      // Backdate check-in for day -2
      await streakService.checkInZeroSpend(workplaceId, new Date(twoDaysAgo));

      // Backdate check-in for day -1
      await streakService.checkInZeroSpend(workplaceId, new Date(yesterday));

      // Now check-in repos should return both backdated check-ins
      mockedDailyCheckInRepo.findByWorkplaceSince.mockResolvedValue([
        { checkInDate: yesterday } as any,
        { checkInDate: twoDaysAgo } as any,
      ]);

      result = await streakService.calculateStreak(workplaceId);
      // After recovery: day -3 (journal), day -2 (check-in), day -1 (check-in), today (journal)
      // Most recent = today. Walking back: today ✓, yesterday ✓, 2 days ago ✓, 3 days ago ✓ → streakCount = 4
      expect(result.streakCount).toBe(4);
      expect(result.todayLogged).toBe(true);
      expect(result.canRecoverMissedDays).toBe(false);
      expect(result.missedDaysCount).toBe(0);
    });
  });
});
