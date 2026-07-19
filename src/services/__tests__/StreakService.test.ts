import DailyCheckIn from '@/src/data/models/DailyCheckIn';
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
    write: jest.fn((cb: () => unknown) => cb()),
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

/**
 * Helper: creates a mock DailyCheckIn instance without using `as any`.
 */
function mockDailyCheckIn(overrides: Partial<DailyCheckIn>): DailyCheckIn {
  return {
    id: 'mock-checkin-id' as DailyCheckIn['id'],
    workplaceId: 'test-workplace-1' as WorkplaceId,
    checkInDate: Date.now(),
    isZeroSpend: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as DailyCheckIn;
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
    mockedDailyCheckInRepo.createIfAbsent.mockImplementation(
      async (_wp: WorkplaceId, date: number, isZero: boolean = true) => {
        return mockDailyCheckIn({
          workplaceId: _wp,
          checkInDate: date,
          isZeroSpend: isZero,
        });
      },
    );
  });

  // ── Streak Calculation Tests ─────────────────────────────────────

  describe('calculateStreak', () => {
    it('should return 0 streak when no activity exists', async () => {
      const result = await streakService.calculateStreak(workplaceId);

      expect(result.streakDays).toBe(0);
      expect(result.todayLogged).toBe(false);
      expect(result.lastLoggedDate).toBe('');
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

      expect(result.streakDays).toBe(3);
      expect(result.todayLogged).toBe(true);
      expect(result.lastLoggedDate).toBe(dayjs(today).toISOString());
    });

    it('should calculate streak from journals table ONLY, ignoring check-ins', async () => {
      const today = dayStart(dayjs().format('YYYY-MM-DD'));
      const yesterday = dayStart(dayjs().subtract(1, 'day').format('YYYY-MM-DD'));

      // Journal entry yesterday only
      mockJournalsFetch.mockResolvedValue([{ journalDate: yesterday }]);

      // Check-in today
      mockedDailyCheckInRepo.findByWorkplaceSince.mockResolvedValue([
        mockDailyCheckIn({ checkInDate: today }),
      ]);

      const result = await streakService.calculateStreak(workplaceId);

      // Should count journal entry only
      expect(result.streakDays).toBe(1);
      expect(result.todayLogged).toBe(false);
      expect(result.lastLoggedDate).toBe(dayjs(yesterday).toISOString());
    });

    it('should break streak when there is a gap in journal entries', async () => {
      // Journal entry 4 days ago
      const fourDaysAgo = dayStart(dayjs().subtract(4, 'day').format('YYYY-MM-DD'));

      mockJournalsFetch.mockResolvedValue([{ journalDate: fourDaysAgo }]);

      const result = await streakService.calculateStreak(workplaceId);

      expect(result.streakDays).toBe(1);
      expect(result.todayLogged).toBe(false);
      expect(result.lastLoggedDate).toBe(dayjs(fourDaysAgo).toISOString());
    });

    it('should deduplicate multiple journal entries on the same day', async () => {
      const today = dayStart(dayjs().format('YYYY-MM-DD'));
      const yesterday = dayStart(dayjs().subtract(1, 'day').format('YYYY-MM-DD'));

      mockJournalsFetch.mockResolvedValue([
        { journalDate: today },
        { journalDate: today },
        { journalDate: yesterday },
      ]);

      const result = await streakService.calculateStreak(workplaceId);

      expect(result.streakDays).toBe(2);
      expect(result.todayLogged).toBe(true);
      expect(result.lastLoggedDate).toBe(dayjs(today).toISOString());
    });
  });

  // ── Zero-Spend Check-In Tests ────────────────────────────────────

  describe('checkInZeroSpend', () => {
    it('should create a zero-spend check-in for today via createIfAbsent', async () => {
      const result = await streakService.checkInZeroSpend(workplaceId);

      expect(mockedDailyCheckInRepo.createIfAbsent).toHaveBeenCalledTimes(1);
      expect(mockedDailyCheckInRepo.createIfAbsent).toHaveBeenCalledWith(
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

      expect(mockedDailyCheckInRepo.createIfAbsent).toHaveBeenCalledWith(
        workplaceId,
        targetDayStart,
        true,
      );
      expect(dayjs(result.checkInDate).format('YYYY-MM-DD')).toBe(
        dayjs(targetDate).format('YYYY-MM-DD'),
      );
    });
  });
});
