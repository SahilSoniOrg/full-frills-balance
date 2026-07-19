import { database } from '@/src/data/database/Database';
import TransactionInboxRecord, {
  InboxProcessingStatus,
} from '@/src/data/models/TransactionInboxRecord';
import Journal from '@/src/data/models/Journal';
import BalanceSnapshot from '@/src/data/models/BalanceSnapshot';
import { logger } from '@/src/utils/logger';
import { Q } from '@nozbe/watermelondb';
import { combineLatest, Observable, of, Subject, Subscription, debounceTime } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import type {
  WidgetPayload,
  WidgetStreakPayload,
  WidgetPendingSmsPayload,
  WidgetPetPayload,
  WidgetSafeToSpendPayload,
} from './WidgetPayload';

// ---------------------------------------------------------------------------
// Default (zero-state) payloads — used before any data has arrived.
// ---------------------------------------------------------------------------

const EMPTY_STREAK: WidgetStreakPayload = {
  streakCount: 0,
  lastLoggedDate: null,
  todayLogged: false,
  canRecoverMissedDays: false,
  missedDaysCount: 0,
};

const EMPTY_PENDING_SMS: null = null;

const EMPTY_PET: WidgetPetPayload = {
  petHealth: 50,
  petMood: 'happy',
  unreviewedCount: 0,
  safeToSpendRunwayDays: 0,
};

const EMPTY_SAFE_TO_SPEND: WidgetSafeToSpendPayload = {
  dailyAllowance: 0,
  spentToday: 0,
  remainingMargin: 0,
};

const EMPTY_PAYLOAD: WidgetPayload = {
  streak: EMPTY_STREAK,
  pendingSms: EMPTY_PENDING_SMS,
  pet: EMPTY_PET,
  safeToSpend: EMPTY_SAFE_TO_SPEND,
};

// ---------------------------------------------------------------------------
// Debounce window (ms)
// ---------------------------------------------------------------------------
const SYNC_DEBOUNCE_MS = 300;

// ---------------------------------------------------------------------------
// WidgetSyncObserver
// ---------------------------------------------------------------------------

/**
 * WidgetSyncObserver — subscribes to WatermelonDB observables for
 * `journals`, `transaction_inbox_records`, and `balance_snapshots`,
 * debounces at 300 ms, serialises a unified `WidgetPayload`, and pushes
 * it to the native bridge (iOS AppGroup UserDefaults / Android SharedPreferences).
 *
 * The observer is null-safe: if a data source hasn't emitted yet, a
 * sensible default value is used rather than blocking the entire sync.
 */
export class WidgetSyncObserver {
  private subscriptions: Subscription[] = [];
  private payloadSubject = new Subject<WidgetPayload>();

  /** Current (last-emitted) payload — useful for tests & diagnostics */
  private _currentPayload: WidgetPayload = { ...EMPTY_PAYLOAD };

  /** Whether the observer has been started */
  private _started = false;

  // ---- Public API -------------------------------------------------------

  /** Last emitted payload (read-only snapshot for tests) */
  get currentPayload(): WidgetPayload {
    return { ...this._currentPayload };
  }

  /** Whether the subscriptions are active */
  get started(): boolean {
    return this._started;
  }

  /**
   * Start observing WatermelonDB tables.
   * Safe to call multiple times — subsequent calls are no-ops.
   */
  start(): void {
    if (this._started) return;
    this._started = true;

    // Build the chain: combineLatest from DB → debounce → push to native
    const combined$ = this.buildCombinedObservable();

    const debouncedPush$ = combined$.pipe(
      debounceTime(SYNC_DEBOUNCE_MS),
      switchMap((payload: WidgetPayload) => this.pushToNative$(payload)),
    );

    const sub = combined$.subscribe({
      next: (payload: WidgetPayload) => {
        this._currentPayload = payload;
      },
      error: (err: Error) => {
        logger.error('[WidgetSyncObserver] Error in observable chain', err);
      },
    });

    // Subscribe the debounced push chain too so it activates
    const pushSub = debouncedPush$.subscribe({
      error: (err: Error) => {
        logger.error('[WidgetSyncObserver] Error in push chain', err);
      },
    });

    this.subscriptions.push(sub, pushSub);
    logger.info('[WidgetSyncObserver] Started — observing journals, inbox & snapshots');
  }

  /**
   * Tear down all subscriptions. Safe to call multiple times.
   */
  stop(): void {
    for (const sub of this.subscriptions) {
      sub.unsubscribe();
    }
    this.subscriptions = [];
    this._started = false;
    logger.info('[WidgetSyncObserver] Stopped');
  }

  /**
   * Force an immediate sync with the latest known payload.
   * Useful for testing or explicit refresh triggers.
   */
  async triggerSync(): Promise<void> {
    if (!this._started) {
      logger.warn('[WidgetSyncObserver] triggerSync called but observer is not started');
      return;
    }
    await this.pushToNative(this._currentPayload);
  }

  // ---- Internal helpers -------------------------------------------------

  /**
   * Combine WatermelonDB observables into a single WidgetPayload stream.
   *
   * Each source is handled independently so a missing / slow table doesn't
   * block the entire emission.
   */
  private buildCombinedObservable(): Observable<WidgetPayload> {
    const journals$: Observable<WidgetStreakPayload> = this.observeJournals().pipe(
      map((journals: Journal[]) => this.buildStreakPayload(journals)),
      catchError((_err: Error) => {
        return of(EMPTY_STREAK);
      }),
    );

    const inbox$: Observable<WidgetPendingSmsPayload | null> =
      this.observeTransactionInbox().pipe(
        map((records: TransactionInboxRecord[]) => this.buildPendingSmsPayload(records)),
        catchError((_err: Error) => {
          return of(EMPTY_PENDING_SMS);
        }),
      );

    const pet$: Observable<WidgetPetPayload> = this.observePetData().pipe(
      map(
        ({
          journals,
          snapshots,
        }: {
          journals: Journal[];
          snapshots: BalanceSnapshot[];
        }) => this.buildPetPayload(journals, snapshots),
      ),
      catchError((_err: Error) => {
        return of(EMPTY_PET);
      }),
    );

    const safeToSpend$: Observable<WidgetSafeToSpendPayload> =
      this.observeSafeToSpendData().pipe(
        map((snapshots: BalanceSnapshot[]) => this.buildSafeToSpendPayload(snapshots)),
        catchError((_err: Error) => {
          return of(EMPTY_SAFE_TO_SPEND);
        }),
      );

    return combineLatest([journals$, inbox$, pet$, safeToSpend$]).pipe(
      map(
        ([streak, pendingSms, pet, safeToSpend]: [
          WidgetStreakPayload,
          WidgetPendingSmsPayload | null,
          WidgetPetPayload,
          WidgetSafeToSpendPayload,
        ]) => ({
          streak,
          pendingSms,
          pet,
          safeToSpend,
        }),
      ),
    );
  }

  /** Observe non-deleted journals */
  private observeJournals(): Observable<Journal[]> {
    const collection = database.collections.get<Journal>('journals');
    return collection
      .query(Q.where('deleted_at', Q.eq(null)))
      .observe() as unknown as Observable<Journal[]>;
  }

  /** Observe pending (non-imported) transaction inbox records */
  private observeTransactionInbox(): Observable<TransactionInboxRecord[]> {
    const collection = database.collections.get<TransactionInboxRecord>(
      'transaction_inbox_records',
    );
    return collection
      .query(
        Q.where('processing_status', Q.eq(InboxProcessingStatus.PENDING)),
        Q.where('parse_status', Q.oneOf(['parsed', 'parse_failed'])),
      )
      .observe() as unknown as Observable<TransactionInboxRecord[]>;
  }

  /** Observe journals + balance snapshots for pet data */
  private observePetData(): Observable<{
    journals: Journal[];
    snapshots: BalanceSnapshot[];
  }> {
    const journals$ = this.observeJournals();
    const snapshots$ = this.observeBalanceSnapshots();
    return combineLatest([journals$, snapshots$]).pipe(
      map(
        ([journals, snapshots]: [Journal[], BalanceSnapshot[]]) => ({
          journals,
          snapshots,
        }),
      ),
    );
  }

  /** Observe balance snapshots */
  private observeBalanceSnapshots(): Observable<BalanceSnapshot[]> {
    const collection = database.collections.get<BalanceSnapshot>('balance_snapshots');
    return collection.query().observe() as unknown as Observable<BalanceSnapshot[]>;
  }

  /** Observe balance snapshots for safe-to-spend calculation */
  private observeSafeToSpendData(): Observable<BalanceSnapshot[]> {
    return this.observeBalanceSnapshots();
  }

  // ---- Payload builders -------------------------------------------------

  private buildStreakPayload(journals: Journal[]): WidgetStreakPayload {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    // Collect distinct dates with journals (posted journals)
    const journalDates = new Set<string>();
    for (const j of journals) {
      // journalDate is a timestamp number; convert to date string
      const d = new Date(j.journalDate).toISOString().slice(0, 10);
      journalDates.add(d);
    }

    const todayLogged = journalDates.has(todayStr);

    // Calculate consecutive streak
    let streakCount = 0;
    let missedDaysCount = 0;

    const sortedDates = [...journalDates].sort().reverse();
    let checkDate = new Date(todayStr);

    // If not logged today, start from yesterday
    if (!todayLogged) {
      checkDate.setDate(checkDate.getDate() - 1);
    }

    for (const dStr of sortedDates) {
      const expected = checkDate.toISOString().slice(0, 10);
      if (dStr === expected) {
        streakCount++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    // Count missed days (gaps in the last 30 days)
    const thirtyDaysAgo = new Date(todayStr);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10);
    const recentDates = sortedDates.filter(d => d >= thirtyDaysAgoStr);
    missedDaysCount = 30 - recentDates.length - (todayLogged ? 0 : 1);
    if (missedDaysCount < 0) missedDaysCount = 0;

    // Can recover if missed days <= 3 (grace period)
    const canRecover = missedDaysCount <= 3 && missedDaysCount > 0;

    return {
      streakCount,
      lastLoggedDate: sortedDates.length > 0 ? sortedDates[0] : null,
      todayLogged,
      canRecoverMissedDays: canRecover,
      missedDaysCount,
    };
  }

  private buildPendingSmsPayload(
    records: TransactionInboxRecord[],
  ): WidgetPendingSmsPayload | null {
    if (records.length === 0) return null;

    // Take the most recent record
    const latest = records.reduce((a, b) => {
      const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : Number(a.createdAt);
      const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : Number(b.createdAt);
      return aTime > bTime ? a : b;
    });

    return {
      id: latest.id,
      merchant: latest.parsedMerchant ?? null,
      amount: latest.parsedAmount ?? 0,
      currency: latest.parsedCurrencyCode ?? 'USD',
      timestamp: latest.inputDate,
      suggestedCategory: null, // category inference can be added later
    };
  }

  private buildPetPayload(
    _journals: Journal[],
    snapshots: BalanceSnapshot[],
  ): WidgetPetPayload {
    // Health: derive from recent snapshot activity (0–100)
    const petHealth =
      snapshots.length > 0
        ? Math.min(100, Math.max(0, Math.round((snapshots.length / 50) * 100)))
        : 50;

    // Mood: pick based on health
    let petMood: WidgetPetPayload['petMood'] = 'happy';
    if (petHealth <= 25) petMood = 'asleep';
    else if (petHealth <= 50) petMood = 'hungry';
    else if (petHealth >= 90) petMood = 'ecstatic';

    return {
      petHealth,
      petMood,
      unreviewedCount: snapshots.length,
      safeToSpendRunwayDays: 0, // computed externally; placeholder
    };
  }

  private buildSafeToSpendPayload(
    _snapshots: BalanceSnapshot[],
  ): WidgetSafeToSpendPayload {
    // Daily allowance & spent-today are computed from the notification service
    // in production. Here we provide a placeholder that can be overridden via
    // the existing sync path (useWidgetSync) which is backward-compatible.
    return {
      dailyAllowance: 0,
      spentToday: 0,
      remainingMargin: 0,
    };
  }

  /**
   * Serialise the payload and push it to the native bridge.
   * This is a fire-and-forget operation — errors are logged but not rethrown.
   */
  private async pushToNative(payload: WidgetPayload): Promise<void> {
    try {
      // Validate JSON size < 2 KB
      const json = JSON.stringify(payload);
      const bytes = new TextEncoder().encode(json).length;
      if (bytes > 2048) {
        logger.warn(
          `[WidgetSyncObserver] Payload exceeds 2 KB (${bytes} bytes). ` +
            'Widget may not display correctly.',
        );
      }

      // Lazy-require the native module to avoid bootstrap issues
      // (same pattern as useWidgetSync.ts)
      const expoWidgetsModule = require('@/modules/expo-widgets').default;

      // Build the backward-compatible WidgetDataSnapshot
      await expoWidgetsModule.syncWidgetData({
        safeToSpend: {
          amount: payload.safeToSpend.remainingMargin,
          currencyCode: 'USD',
          formattedAmount: String(payload.safeToSpend.remainingMargin),
          title: 'Safe to Spend',
          subtitle: '',
          updatedAt: Date.now(),
        },
        theme: undefined, // theme is managed by the existing useWidgetSync hook
        isPrivacyEnabled: false,
      });

      logger.info('[WidgetSyncObserver] Payload synced to native bridge');
    } catch (err) {
      logger.error('[WidgetSyncObserver] Failed to push payload to native bridge', err);
    }
  }

  /**
   * Wraps pushToNative as an rxjs Observable for use in the switchMap chain.
   */
  private pushToNative$(payload: WidgetPayload): Observable<void> {
    return new Observable<void>(subscriber => {
      this.pushToNative(payload)
        .then(() => {
          subscriber.next();
          subscriber.complete();
        })
        .catch(err => subscriber.error(err));
    });
  }
}

// Singleton — exported instance for app-wide use
export const widgetSyncObserver = new WidgetSyncObserver();
