import { WidgetSyncObserver } from '../WidgetSyncObserver';
import { database } from '@/src/data/database/Database';
import { of, firstValueFrom } from 'rxjs';

// ---------------------------------------------------------------------------
// Mocks — must be defined before any imports that use them
// ---------------------------------------------------------------------------

const mockSyncWidgetData = jest.fn().mockResolvedValue(undefined);

jest.mock('@/src/data/database/Database', () => ({
  database: {
    collections: {
      get: jest.fn(),
    },
  },
}));

jest.mock('@/src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@/modules/expo-widgets', () => ({
  default: {
    syncWidgetData: mockSyncWidgetData,
    refreshWidgets: jest.fn().mockResolvedValue(undefined),
  },
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function resetDatabaseMock(): void {
  (database.collections.get as jest.Mock).mockReset();
  (database.collections.get as jest.Mock).mockImplementation(() => ({
    query: jest.fn().mockReturnValue({
      observe: jest.fn().mockReturnValue(of([])),
    }),
  }));
}

function mockTableData(tableName: string, records: unknown[]): void {
  const origImpl = (database.collections.get as jest.Mock).getMockImplementation();
  (database.collections.get as jest.Mock).mockImplementation((name: string) => {
    if (name === tableName) {
      return {
        query: jest.fn().mockReturnValue({
          observe: jest.fn().mockReturnValue(of(records)),
        }),
      };
    }
    if (origImpl) {
      return origImpl(name);
    }
    return {
      query: jest.fn().mockReturnValue({
        observe: jest.fn().mockReturnValue(of([])),
      }),
    };
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WidgetSyncObserver', () => {
  let observer: WidgetSyncObserver;

  beforeEach(() => {
    jest.clearAllMocks();
    resetDatabaseMock();
    observer = new WidgetSyncObserver();
  });

  afterEach(() => {
    observer.stop();
    jest.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  describe('lifecycle', () => {
    it('should start and stop cleanly', () => {
      expect(observer.started).toBe(false);
      observer.start();
      expect(observer.started).toBe(true);
      observer.stop();
      expect(observer.started).toBe(false);
    });

    it('should be idempotent on multiple start calls', () => {
      observer.start();
      observer.start();
      expect(observer.started).toBe(true);
    });

    it('should be idempotent on multiple stop calls', () => {
      observer.stop();
      expect(observer.started).toBe(false);
      observer.stop();
      expect(observer.started).toBe(false);
    });

    it('should dispose cleanly', () => {
      observer.start();
      observer.dispose();
      expect(observer.started).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Payload stream
  // -----------------------------------------------------------------------

  describe('payload$', () => {
    it('should produce a valid WidgetPayload with empty data', async () => {
      observer.start();
      await new Promise(r => setImmediate(r));

      const payload = await firstValueFrom(observer.payload$);

      expect(payload).toHaveProperty('streak');
      expect(payload).toHaveProperty('pendingSms');
      expect(payload).toHaveProperty('pet');
      expect(payload).toHaveProperty('safeToSpend');

      expect(payload.streak.streakCount).toBe(0);
      expect(payload.streak.lastLoggedDate).toBeNull();
      expect(payload.streak.todayLogged).toBe(false);
      expect(payload.pendingSms).toBeNull();
      expect(payload.pet.petHealth).toBeGreaterThanOrEqual(0);
      expect(payload.pet.petHealth).toBeLessThanOrEqual(100);
      expect(payload.safeToSpend.dailyAllowance).toBe(0);
    });

    it('should populate streak data from journals', async () => {
      const todayStr = new Date().toISOString().slice(0, 10);
      const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

      mockTableData('journals', [
        { id: 'j1', journalDate: new Date(todayStr).getTime() },
        { id: 'j2', journalDate: new Date(yesterdayStr).getTime() },
      ]);

      observer.start();
      await new Promise(r => setImmediate(r));

      const payload = await firstValueFrom(observer.payload$);
      expect(payload.streak.todayLogged).toBe(true);
      expect(payload.streak.streakCount).toBeGreaterThanOrEqual(1);
    });

    it('should populate pendingSms from inbox records', async () => {
      const mockInbox = [
        {
          id: 'inbox-1',
          parsedMerchant: 'Starbucks',
          parsedAmount: 5.5,
          parsedCurrencyCode: 'USD',
          inputDate: Date.now(),
          createdAt: new Date(),
        },
      ];

      mockTableData('transaction_inbox_records', mockInbox);
      observer.start();
      await new Promise(r => setImmediate(r));

      const p = await firstValueFrom(observer.payload$);
      expect(p.pendingSms).not.toBeNull();
      expect(p.pendingSms!.id).toBe('inbox-1');
      expect(p.pendingSms!.merchant).toBe('Starbucks');
      expect(p.pendingSms!.amount).toBe(5.5);
    });

    it('should set pendingSms to null when inbox is empty', async () => {
      observer.start();
      await new Promise(r => setImmediate(r));
      const payload = await firstValueFrom(observer.payload$);
      expect(payload.pendingSms).toBeNull();
    });

    it('should handle empty DB gracefully', async () => {
      observer.start();
      await new Promise(r => setImmediate(r));

      const payload = await firstValueFrom(observer.payload$);
      expect(payload.streak).toBeDefined();
      expect(payload.pet).toBeDefined();
      expect(payload.safeToSpend).toBeDefined();
    });
  });
});
