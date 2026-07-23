import { database } from '@/src/data/database/Database';
import TransactionInboxRecord, {
  InboxProcessingStatus,
} from '@/src/data/models/TransactionInboxRecord';
import DailyCheckIn from '@/src/data/models/DailyCheckIn';
import Journal from '@/src/data/models/Journal';
import { logger } from '@/src/utils/logger';
import { Q } from '@nozbe/watermelondb';
import { combineLatest, Observable, of, Subscription, debounceTime, shareReplay } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { FinancialPetService } from '@/src/services/FinancialPetService';
import { StreakService } from '@/src/services/StreakService';
import type { WorkplaceId } from '@/src/types/domain';
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
  private _started = false;
  private _payload$: Observable<WidgetPayload> | undefined;
  private _currentWorkplaceId?: WorkplaceId;

  // ---- Public API -------------------------------------------------------

  /**
   * The observable payload stream. Subscribe here to receive widget data.
   * Emits an empty-state payload immediately on subscription if `start()`
   * has not been called yet.
   */
  get payload$(): Observable<WidgetPayload> {
    if (!this._started) {
      this.start();
    }
    return this._payload$ ?? of(EMPTY_PAYLOAD);
  }

  /** Whether the subscriptions are active */
  get started(): boolean {
    return this._started;
  }

  /**
   * Start observing WatermelonDB tables and wire up `payload$`.
   * Safe to call multiple times — subsequent calls are no-ops unless workplaceId changes.
   */
  start(workplaceId?: WorkplaceId): void {
    if (this._started && this._currentWorkplaceId === workplaceId) return;
    if (this._started) {
      this.stop();
    }

    this._started = true;
    this._currentWorkplaceId = workplaceId;

    this._payload$ = this.buildCombinedObservable(workplaceId).pipe(
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
    logger.info('[WidgetSyncObserver] Started — observing journals & inbox', { workplaceId });
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
    this._currentWorkplaceId = undefined;
    logger.info('[WidgetSyncObserver] Stopped');
  }

  /**
   * Consolidate dispose into stop.
   */
  dispose(): void {
    this.stop();
  }

  // ---- Internal helpers -------------------------------------------------

  /**
   * Combine WatermelonDB observables into a single WidgetPayload stream.
   *
   * Domain math for streak and pet is delegated to StreakService and PetService.
   */
  private buildCombinedObservable(workplaceId?: WorkplaceId): Observable<WidgetPayload> {
    const journals$ = this.observeJournals(workplaceId);
    const checkIns$ = this.observeDailyCheckIns(workplaceId);

    const streak$: Observable<WidgetStreakPayload> = combineLatest([journals$, checkIns$]).pipe(
      map(([journals, checkIns]) => StreakService.calculateStreakFromRecords(journals, checkIns)),
      catchError((_err: Error) => of(EMPTY_STREAK)),
    );

    const inboxRecords$ = this.observeTransactionInbox(workplaceId).pipe(shareReplay(1));

    const inbox$: Observable<WidgetPendingSmsPayload | null> = inboxRecords$.pipe(
      map((records: TransactionInboxRecord[]) => this.buildPendingSmsPayload(records)),
      catchError((_err: Error) => of(null)),
    );

    const pet$: Observable<WidgetPetPayload> = inboxRecords$.pipe(
      map((records: TransactionInboxRecord[]) =>
        FinancialPetService.calculatePetPayload(records.length),
      ),
      catchError((_err: Error) => of(EMPTY_PET)),
    );

    // safeToSpend is provided as zeros here; the hook merges real values from
    // BalanceService / NotificationService before writing to the native bridge.
    const safeToSpend$: Observable<WidgetSafeToSpendPayload> = of(EMPTY_SAFE_TO_SPEND);

    return combineLatest([streak$, inbox$, pet$, safeToSpend$]).pipe(
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

  /** Observe non-deleted journals scoped by workplace */
  private observeJournals(workplaceId?: WorkplaceId): Observable<Journal[]> {
    const collection = database.collections.get<Journal>('journals');
    const clauses: Q.Clause[] = [Q.where('deleted_at', Q.eq(null))];
    if (workplaceId) {
      clauses.push(Q.where('workplace_id', workplaceId));
    }
    return collection.query(...clauses).observe() as Observable<Journal[]>;
  }

  /** Observe zero-spend daily check-ins scoped by workplace */
  private observeDailyCheckIns(workplaceId?: WorkplaceId): Observable<DailyCheckIn[]> {
    const collection = database.collections.get<DailyCheckIn>('daily_check_ins');
    const clauses: Q.Clause[] = [Q.where('is_zero_spend', Q.eq(true))];
    if (workplaceId) {
      clauses.push(Q.where('workplace_id', workplaceId));
    }
    return collection.query(...clauses).observe() as Observable<DailyCheckIn[]>;
  }

  /** Observe pending (non-imported) transaction inbox records scoped by workplace */
  private observeTransactionInbox(workplaceId?: WorkplaceId): Observable<TransactionInboxRecord[]> {
    const collection = database.collections.get<TransactionInboxRecord>(
      'transaction_inbox_records',
    );
    const clauses: Q.Clause[] = [
      Q.where('processing_status', Q.eq(InboxProcessingStatus.PENDING)),
      Q.where('parse_status', Q.oneOf(['parsed', 'parse_failed'])),
    ];
    if (workplaceId) {
      clauses.push(Q.where('workplace_id', workplaceId));
    }
    return collection.query(...clauses).observe() as Observable<TransactionInboxRecord[]>;
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
}

// Singleton — exported for app-wide use
export const widgetSyncObserver = new WidgetSyncObserver();
