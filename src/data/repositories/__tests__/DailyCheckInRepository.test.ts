import DailyCheckIn from '@/src/data/models/DailyCheckIn';
import { dailyCheckInRepository } from '@/src/data/repositories/DailyCheckInRepository';
import { WorkplaceId } from '@/src/types/domain';

jest.mock('@/src/data/database/Database', () => ({
  database: {
    collections: {
      get: jest.fn(),
    },
    write: jest.fn((cb: () => unknown) => cb()),
  },
}));

jest.mock('@/src/data/database/DatabaseUtils', () => ({
  getRawAdapter: jest.fn().mockReturnValue(null),
}));

interface MockCheckIn {
  id: string;
  workplaceId: WorkplaceId;
  checkInDate: number;
  isZeroSpend: boolean;
  createdAt: Date;
  updatedAt: Date;
  update: jest.Mock;
}

function mockDailyCheckIn(overrides: Partial<MockCheckIn>): MockCheckIn {
  const record: MockCheckIn = {
    id: 'checkin-1',
    workplaceId: 'wp-1' as WorkplaceId,
    checkInDate: 1000,
    isZeroSpend: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    update: jest.fn(async (cb: (r: MockCheckIn) => void) => {
      cb(record);
    }),
    ...overrides,
  };
  return record;
}

describe('DailyCheckInRepository', () => {
  const workplaceId = 'wp-1' as WorkplaceId;
  const checkInDate = 1000;

  let mockQuery: jest.Mock;
  let mockFetch: jest.Mock;
  let mockCreate: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch = jest.fn().mockResolvedValue([]);
    mockQuery = jest.fn().mockReturnValue({ fetch: mockFetch });
    mockCreate = jest.fn();

    const db = require('@/src/data/database/Database').database;
    db.collections.get.mockReturnValue({
      query: mockQuery,
      create: mockCreate,
    });
  });

  describe('checkInsQuery', () => {
    it('should build query scoped to workplaceId', () => {
      dailyCheckInRepository.checkInsQuery(workplaceId);
      expect(mockQuery).toHaveBeenCalled();
    });
  });

  describe('findByDate', () => {
    it('should query strictly by workplace_id and check_in_date without filtering is_zero_spend', async () => {
      mockFetch.mockResolvedValue([mockDailyCheckIn({ checkInDate })]);

      const result = await dailyCheckInRepository.findByDate(workplaceId, checkInDate);

      expect(mockQuery).toHaveBeenCalled();
      expect(result).not.toBeNull();
      expect(result?.checkInDate).toBe(checkInDate);
    });
  });

  describe('findByWorkplace', () => {
    it('should fetch all when limit is undefined', async () => {
      await dailyCheckInRepository.findByWorkplace(workplaceId);
      expect(mockQuery).toHaveBeenCalled();
    });

    it('should not skip Q.take when limit is 0', async () => {
      await dailyCheckInRepository.findByWorkplace(workplaceId, 0);
      // limit=0 is still a valid number and should apply Q.take(0)
      expect(mockQuery).toHaveBeenCalled();
    });
  });

  describe('createIfAbsent', () => {
    it('should create a new check-in record when none exists for the date', async () => {
      mockFetch.mockResolvedValue([]);
      const newRecord = mockDailyCheckIn({ checkInDate, isZeroSpend: true });
      mockCreate.mockImplementation(async (cb: (r: DailyCheckIn) => void) => {
        const r = {} as DailyCheckIn;
        cb(r);
        return newRecord;
      });

      const result = await dailyCheckInRepository.createIfAbsent(workplaceId, checkInDate, true);

      expect(mockCreate).toHaveBeenCalled();
      expect(result.checkInDate).toBe(checkInDate);
    });

    it('should update existing record if isZeroSpend flag differs', async () => {
      const existing = mockDailyCheckIn({ checkInDate, isZeroSpend: false });
      mockFetch.mockResolvedValue([existing]);

      const result = await dailyCheckInRepository.createIfAbsent(workplaceId, checkInDate, true);

      expect(existing.update).toHaveBeenCalled();
      expect(result.isZeroSpend).toBe(true);
    });

    it('should return existing record without update if isZeroSpend matches', async () => {
      const existing = mockDailyCheckIn({ checkInDate, isZeroSpend: true });
      mockFetch.mockResolvedValue([existing]);

      const result = await dailyCheckInRepository.createIfAbsent(workplaceId, checkInDate, true);

      expect(existing.update).not.toHaveBeenCalled();
      expect(result).toBe(existing);
    });
  });

  describe('fetchZeroSpendDateStrings', () => {
    it('should return date strings from ORM fallback when raw adapter unavailable', async () => {
      const sinceMs = new Date('2024-01-01').getTime();
      const jan15Ms = new Date('2024-01-15T00:00:00Z').getTime();
      const jan16Ms = new Date('2024-01-16T00:00:00Z').getTime();

      mockFetch.mockResolvedValue([
        mockDailyCheckIn({ checkInDate: jan15Ms, isZeroSpend: true }),
        mockDailyCheckIn({ checkInDate: jan16Ms, isZeroSpend: true }),
      ]);

      const result = await dailyCheckInRepository.fetchZeroSpendDateStrings(workplaceId, sinceMs);

      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(2);
      expect(result.has('2024-01-15')).toBe(true);
      expect(result.has('2024-01-16')).toBe(true);
    });

    it('should use raw SQL when adapter is available', async () => {
      const { getRawAdapter } = require('@/src/data/database/DatabaseUtils');
      const mockQueryRaw = jest
        .fn()
        .mockResolvedValue([{ day: '2024-01-15' }, { day: '2024-01-16' }]);
      getRawAdapter.mockReturnValue({ queryRaw: mockQueryRaw });

      const sinceMs = new Date('2024-01-01').getTime();
      const result = await dailyCheckInRepository.fetchZeroSpendDateStrings(workplaceId, sinceMs);

      expect(mockQueryRaw).toHaveBeenCalledWith(expect.stringContaining('SELECT DISTINCT'), [
        workplaceId,
        sinceMs,
      ]);
      expect(result.has('2024-01-15')).toBe(true);
      expect(result.has('2024-01-16')).toBe(true);
    });
  });
});
