import DailyCheckIn from '@/src/data/models/DailyCheckIn';
import { dailyCheckInRepository } from '@/src/data/repositories/DailyCheckInRepository';
import { streakService } from '@/src/services/StreakService';
import { WorkplaceId } from '@/src/types/domain';
import dayjs from 'dayjs';
import { of } from 'rxjs';

// ─── Mocks ──────────────────────────────────────────────────────────

jest.mock('@/src/data/repositories/DailyCheckInRepository');
jest.mock('@/src/data/repositories/JournalRepository');
jest.mock('@/src/data/database/Database', () => ({
  database: {
    collections: {
      get: jest.fn(),
    },
    write: jest.fn((cb: () => unknown) => cb()),
    batch: jest.fn(),
  },
}));
jest.mock('@/src/data/database/DatabaseUtils', () => ({
  getRawAdapter: jest.fn().mockReturnValue(null),
}));

const mockedDailyCheckInRepo = dailyCheckInRepository as jest.Mocked<typeof dailyCheckInRepository>;

interface MockCheckIn {
  id: string;
  workplaceId: WorkplaceId;
  checkInDate: number;
  isZeroSpend: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function mockDailyCheckIn(overrides: Partial<MockCheckIn>): MockCheckIn {
  return {
    id: 'mock-checkin-id',
    workplaceId: 'test-workplace-1' as WorkplaceId,
    checkInDate: Date.now(),
    isZeroSpend: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Helper: returns epoch ms for start of a given ISO date (local tz).
 */
function dayStart(isoDate: string): number {
  return dayjs(isoDate).startOf('day').valueOf();
}

describe('StreakService', () => {
  const workplaceId = 'test-workplace-1' as WorkplaceId;

  let mockJournalsFetch: jest.Mock;
  let mockJournalsQuery: { fetch: jest.Mock; observe: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default: no journals or check-ins
    mockJournalsFetch = jest.fn().mockResolvedValue([]);
    mockJournalsQuery = {
      fetch: mockJournalsFetch,
      observe: jest.fn().mockReturnValue(of([])),
    };

    // Mock journalRepository.journalsQuery to return our mock query
    const { journalRepository } = require('@/src/data/repositories/JournalRepository');
    journalRepository.journalsQuery = jest.fn().mockReturnValue(mockJournalsQuery);

    // Mock getRawAdapter to return null (ORM fallback path)
    const { getRawAdapter } = require('@/src/data/database/DatabaseUtils');
    getRawAdapter.mockReturnValue(null);

    mockedDailyCheckInRepo.fetchZeroSpendDateStrings.mockResolvedValue(new Set<string>());
    mockedDailyCheckInRepo.findByDate.mockResolvedValue(null);
    mockedDailyCheckInRepo.checkInsQuery.mockReturnValue({
      observe: jest.fn().mockReturnValue(of([])),
    } as unknown as ReturnType<typeof dailyCheckInRepository.checkInsQuery>);

    mockedDailyCheckInRepo.createIfAbsent.mockImplementation(
      async (_wp: WorkplaceId, date: number, isZero: boolean = true) => {
        return mockDailyCheckIn({
          workplaceId: _wp,
          checkInDate: date,
          isZeroSpend: isZero,
        }) as unknown as DailyCheckIn;
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
      const todayStr = dayjs().format('YYYY-MM-DD');
      const yesterdayStr = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
      const twoDaysAgoStr = dayjs().subtract(2, 'day').format('YYYY-MM-DD');

      // ORM fallback: journal records with journalDate as epoch ms
      const today = dayStart(todayStr);
      const yesterday = dayStart(yesterdayStr);
      const twoDaysAgo = dayStart(twoDaysAgoStr);

      mockJournalsFetch.mockResolvedValue([
        { journalDate: today },
        { journalDate: yesterday },
        { journalDate: twoDaysAgo },
      ]);

      const result = await streakService.calculateStreak(workplaceId);

      expect(result.streakDays).toBe(3);
      expect(result.todayLogged).toBe(true);
      expect(result.lastLoggedDate).toBe(dayjs(todayStr).startOf('day').toISOString());
    });

    it('should maintain active streak when logged yesterday but not today yet', async () => {
      const yesterdayStr = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
      const twoDaysAgoStr = dayjs().subtract(2, 'day').format('YYYY-MM-DD');

      mockJournalsFetch.mockResolvedValue([
        { journalDate: dayStart(yesterdayStr) },
        { journalDate: dayStart(twoDaysAgoStr) },
      ]);

      const result = await streakService.calculateStreak(workplaceId);

      expect(result.streakDays).toBe(2);
      expect(result.todayLogged).toBe(false);
      expect(result.lastLoggedDate).toBe(dayjs(yesterdayStr).startOf('day').toISOString());
    });

    it('should combine zero-spend check-ins and journal entries in streak calculation', async () => {
      const todayStr = dayjs().format('YYYY-MM-DD');
      const yesterdayStr = dayjs().subtract(1, 'day').format('YYYY-MM-DD');

      // Journal entry yesterday
      mockJournalsFetch.mockResolvedValue([{ journalDate: dayStart(yesterdayStr) }]);

      // Check-in today (returned as date strings from the new method)
      mockedDailyCheckInRepo.fetchZeroSpendDateStrings.mockResolvedValue(new Set([todayStr]));

      const result = await streakService.calculateStreak(workplaceId);

      expect(result.streakDays).toBe(2);
      expect(result.todayLogged).toBe(true);
      expect(result.lastLoggedDate).toBe(dayjs(todayStr).startOf('day').toISOString());
    });

    it('should expire streak (0 streak days) when last activity was older than yesterday', async () => {
      const fourDaysAgoStr = dayjs().subtract(4, 'day').format('YYYY-MM-DD');

      mockJournalsFetch.mockResolvedValue([{ journalDate: dayStart(fourDaysAgoStr) }]);

      const result = await streakService.calculateStreak(workplaceId);

      expect(result.streakDays).toBe(0);
      expect(result.todayLogged).toBe(false);
      expect(result.lastLoggedDate).toBe(dayjs(fourDaysAgoStr).startOf('day').toISOString());
    });

    it('should deduplicate multiple journal entries and check-ins on the same day', async () => {
      const todayStr = dayjs().format('YYYY-MM-DD');
      const yesterdayStr = dayjs().subtract(1, 'day').format('YYYY-MM-DD');

      mockJournalsFetch.mockResolvedValue([
        { journalDate: dayStart(todayStr) },
        { journalDate: dayStart(todayStr) },
        { journalDate: dayStart(yesterdayStr) },
      ]);
      mockedDailyCheckInRepo.fetchZeroSpendDateStrings.mockResolvedValue(new Set([todayStr]));

      const result = await streakService.calculateStreak(workplaceId);

      expect(result.streakDays).toBe(2);
      expect(result.todayLogged).toBe(true);
      expect(result.lastLoggedDate).toBe(dayjs(todayStr).startOf('day').toISOString());
    });
  });

  // ── Reactive Observer Tests ──────────────────────────────────────

  describe('observeStreak', () => {
    it('should emit initial streak result via RxJS observable pipeline', done => {
      const todayStr = dayjs().format('YYYY-MM-DD');
      mockJournalsFetch.mockResolvedValue([{ journalDate: dayStart(todayStr) }]);

      streakService.observeStreak(workplaceId).subscribe({
        next: result => {
          expect(result.streakDays).toBe(1);
          expect(result.todayLogged).toBe(true);
          done();
        },
        error: done.fail,
      });
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
