import { database } from '@/src/data/database/Database';
import TransactionInboxRecord, {
  InboxProcessingStatus,
} from '@/src/data/models/TransactionInboxRecord';
import Journal from '@/src/data/models/Journal';
import { logger } from '@/src/utils/logger';
import { Q } from '@nozbe/watermelondb';
import {
  combineLatest,
  Observable,
  of,
  Subscription,
  debounceTime,
  shareReplay,
} from 'rxjs';
import { catchError, map } from 'rxjs/operators';
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
  pendingSms: null,
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
 * WidgetSyncObserver — a PURE DATA PIPELINE that subscribes to WatermelonDB
 * observables for `journals` and `transaction_inbox_records`, debounces at
 * 300 ms, and exposes a single `payload$` Observable<WidgetPayload>.
 *
 * The observer does NOT write to the native bridge. It is the sole
 * responsibility of `useWidgetSync` (the React hook) to subscribe to
 * `payload$` and push data to the bridge.
 *
 * Safe-to-spend data comes from the BalanceService / NotificationService layer
 * and is merged in the hook. The observer emits a zero-placeholder for that
 * section so the payload shape is always complete.
 */
export class WidgetSyncObserver {
  private subscriptions: Subscription[] = [];

  /** Whether the observer has been started */
  private _started = false;

  /**
   * Shared, multicasted payload stream. Late subscribers receive the last
   * emitted value immediately (shareReplay(1)).
   *
   * Initialised in `start()`. Before `start()` is called this is `undefined`;
   * access via the `payload$` getter which guards against that.
   */
  private _payload$: Observable<WidgetPayload> | undefined;

  // ---- Public API -------------------------------------------------------

  /**
   * The observable payload stream. Subscribe here to receive widget data.
   * Emits an empty-state payload immediately on subscription if `start()`
   * has not been called yet.
   */
  get payload$(): Observable<WidgetPayload> {
    if (!this._payload$) {
      return of(EMPTY_PAYLOAD);
    }
    return this._payload$;
  }

  /** Whether the subscriptions are active */
  get started(): boolean {
    return this._started;
  }

  /**
   * Start observing WatermelonDB tables and wire up `payload$`.
   * Safe to call multiple times — subsequent calls are no-ops.
   */
  start(): void {
    if (this._started) return;
    this._started = true;

    this._payload$ = this.buildCombinedObservable().pipe(
      debounceTime(SYNC_DEBOUNCE_MS),
      shareReplay(1),
    );

    // Keep the stream hot so it eagerly fetches even before the hook subscribes
    const keepAliveSub = this._payload$.subscribe({
      error: (err: Error) => {
        logger.error('[WidgetSyncObserver] Error in payload$ stream', err);
      },
    });

    this.subscriptions.push(keepAliveSub);
    logger.info('[WidgetSyncObserver] Started — observing journals & inbox');
  }

  /**
   * Tear down all subscriptions. `payload$` reverts to emitting EMPTY_PAYLOAD.
   * Safe to call multiple times.
   */
  stop(): void {
    for (const sub of this.subscriptions) {
      sub.unsubscribe();
    }
    this.subscriptions = [];
    this._payload$ = undefined;
    this._started = false;
    logger.info('[WidgetSyncObserver] Stopped');
  }

  /**
   * Full cleanup — identical to `stop()` but signals permanent teardown
   * (e.g. on logout). Should be called when the observer will not be reused.
   */
  dispose(): void {
    this.stop();
    logger.info('[WidgetSyncObserver] Disposed');
  }

  // ---- Internal helpers -------------------------------------------------

  /**
   * Combine WatermelonDB observables into a single WidgetPayload stream.
   *
   * Each source is handled independently so a missing / slow table doesn't
   * block the entire emission. Safe-to-spend is a zero-placeholder here;
   * the real values come from BalanceService via the hook layer.
   */
  private buildCombinedObservable(): Observable<WidgetPayload> {
    const journals$: Observable<WidgetStreakPayload> = this.observeJournals().pipe(
      map((journals: Journal[]) => this.buildStreakPayload(journals)),
      catchError((_err: Error) => of(EMPTY_STREAK)),
    );

    const inbox$: Observable<WidgetPendingSmsPayload | null> =
      this.observeTransactionInbox().pipe(
        map((records: TransactionInboxRecord[]) => this.buildPendingSmsPayload(records)),
        catchError((_err: Error) => of(null)),
      );

    const pet$: Observable<WidgetPetPayload> = this.observeJournals().pipe(
      map((journals: Journal[]) => this.buildPetPayload(journals)),
      catchError((_err: Error) => of(EMPTY_PET)),
    );

    // safeToSpend is provided as zeros here; the hook merges real values from
    // BalanceService / NotificationService before writing to the native bridge.
    const safeToSpend$: Observable<WidgetSafeToSpendPayload> = of(EMPTY_SAFE_TO_SPEND);

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

  // ---- Payload builders -------------------------------------------------

  private buildStreakPayload(journals: Journal[]): WidgetStreakPayload {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    // Collect distinct dates with journals
    const journalDates = new Set<string>();
    for (const j of journals) {
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
      suggestedCategory: null,
    };
  }

  private buildPetPayload(journals: Journal[]): WidgetPetPayload {
    // Health: derive from recent journal activity (0–100)
    const petHealth =
      journals.length > 0
        ? Math.min(100, Math.max(0, Math.round((journals.length / 50) * 100)))
        : 50;

    // Mood: pick based on health
    let petMood: WidgetPetPayload['petMood'] = 'happy';
    if (petHealth <= 25) petMood = 'asleep';
    else if (petHealth <= 50) petMood = 'hungry';
    else if (petHealth >= 90) petMood = 'ecstatic';

    return {
      petHealth,
      petMood,
      unreviewedCount: journals.length,
      safeToSpendRunwayDays: 0, // computed externally via hook + BalanceService
    };
  }
}

// Singleton — exported for app-wide use (replaces WidgetSyncService)
export const widgetSyncObserver = new WidgetSyncObserver();
