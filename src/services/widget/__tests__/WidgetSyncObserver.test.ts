import { WidgetSyncObserver } from '../WidgetSyncObserver';

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

import { database } from '@/src/data/database/Database';
import { of } from 'rxjs';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Default mock: every table returns an empty array synchronously */
function resetDatabaseMock(): void {
  (database.collections.get as jest.Mock).mockReset();
  (database.collections.get as jest.Mock).mockImplementation(() => ({
    query: jest.fn().mockReturnValue({
      observe: jest.fn().mockReturnValue(of([])),
    }),
  }));
}

/**
 * Seed a specific table with records. All other tables return empty arrays.
 */
function mockTableData(tableName: string, records: unknown[]): void {
  // Override only the named table; keep the default fallback for everything else
  const origImpl = (database.collections.get as jest.Mock).getMockImplementation();
  (database.collections.get as jest.Mock).mockImplementation((name: string) => {
    if (name === tableName) {
      return {
        query: jest.fn().mockReturnValue({
          observe: jest.fn().mockReturnValue(of(records)),
        }),
      };
    }
    // Delegate to original default fallback
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
      observer.start(); // second call — no-op
      expect(observer.started).toBe(true);
    });

    it('should be idempotent on multiple stop calls', () => {
      observer.stop();
      expect(observer.started).toBe(false);
      observer.stop();
      expect(observer.started).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Payload shape
  // -----------------------------------------------------------------------

  describe('payload shape', () => {
    it('should produce a valid WidgetPayload with empty data', async () => {
      observer.start();
      await new Promise(r => setImmediate(r));

      const payload = observer.currentPayload;

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

      const payload = observer.currentPayload;
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

      const p = observer.currentPayload;
      expect(p.pendingSms).not.toBeNull();
      expect(p.pendingSms!.id).toBe('inbox-1');
      expect(p.pendingSms!.merchant).toBe('Starbucks');
      expect(p.pendingSms!.amount).toBe(5.5);
    });

    it('should set pendingSms to null when inbox is empty', async () => {
      observer.start();
      await new Promise(r => setImmediate(r));
      expect(observer.currentPayload.pendingSms).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Debounce behaviour
  // -----------------------------------------------------------------------

  describe('debounce behaviour', () => {
    it('should not call native bridge before the debounce window expires', async () => {
      jest.useFakeTimers({ legacyFakeTimers: false });

      observer.start();
      // Let synchronous emissions settle
      await new Promise(r => setImmediate(r));

      // At this point combineLatest has emitted, but debounceTime(300) hasn't
      // fired yet, so pushToNative$ should NOT have been called.
      expect(mockSyncWidgetData).not.toHaveBeenCalled();

      jest.useRealTimers();
    });
  });

  // -----------------------------------------------------------------------
  // Partial / null safety
  // -----------------------------------------------------------------------

  describe('partial / null safety', () => {
    it('should produce a payload even when a source emits late', async () => {
      const { Subject } = jest.requireActual('rxjs');
      const delayedJournals$ = new Subject<unknown[]>();
      const origImpl = (database.collections.get as jest.Mock).getMockImplementation();

      (database.collections.get as jest.Mock).mockImplementation((name: string) => {
        if (name === 'journals') {
          return {
            query: jest.fn().mockReturnValue({
              observe: jest.fn().mockReturnValue(delayedJournals$.asObservable()),
            }),
          };
        }
        // Fallback to original default
        return origImpl ? origImpl(name) : { query: jest.fn(() => ({ observe: () => of([]) })) };
      });

      observer.start();

      // Journals haven't emitted yet, so combineLatest hasn't emitted.
      // currentPayload should still be at initial empty state.
      const p = observer.currentPayload;
      expect(p.streak.streakCount).toBe(0);

      // Now emit journals — combineLatest should fire
      const todayStr = new Date().toISOString().slice(0, 10);
      delayedJournals$.next([{ id: 'j1', journalDate: new Date(todayStr).getTime() }]);
      await new Promise(r => setImmediate(r));

      const p2 = observer.currentPayload;
      expect(p2.streak.todayLogged).toBe(true);
    });

    it('should handle empty DB gracefully', async () => {
      observer.start();
      await new Promise(r => setImmediate(r));

      const payload = observer.currentPayload;
      expect(payload.streak).toBeDefined();
      expect(payload.pet).toBeDefined();
      expect(payload.safeToSpend).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // triggerSync
  // -----------------------------------------------------------------------

  describe('triggerSync', () => {
    it('should do nothing when observer is not started', async () => {
      await observer.triggerSync();
      expect(mockSyncWidgetData).not.toHaveBeenCalled();
    });

    it('should push the latest payload to native bridge', async () => {
      observer.start();
      await new Promise(r => setImmediate(r));

      await observer.triggerSync();

      expect(mockSyncWidgetData).toHaveBeenCalled();
      expect(mockSyncWidgetData).toHaveBeenCalledWith(
        expect.objectContaining({
          safeToSpend: expect.any(Object),
        }),
      );
    });
  });
});
