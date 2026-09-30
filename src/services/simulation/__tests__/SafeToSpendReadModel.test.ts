import { AccountSubtype, AccountType } from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';

import { accountObserveQueries } from '@/src/data/repositories/account';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalQueryRepository';
import { journalObserveQueries } from '@/src/data/repositories/journal/JournalObserveQueries';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { transactionRawMetricsQueries } from '@/src/data/repositories/raw/TransactionRawMetricsQueries';
import { transactionRawPatternQueries } from '@/src/data/repositories/raw/TransactionRawPatternQueries';
import {
  transactionObserveQueries,
  transactionQueryRepository,
} from '@/src/data/repositories/transaction';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { balanceReadService } from '@/src/services/balance/balanceReadService';
import { budgetReadService } from '@/src/services/budget/budgetReadService';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { convertAmount } from '@/src/services/currencyConversion';
import { cashFlowSimulationService } from '@/src/services/simulation/CashFlowSimulationService';
import {
  reactiveCacheCoordinator,
  REACTIVE_CACHE_NAMESPACES,
} from '@/src/services/reactive/ReactiveCacheCoordinator';
import { safeToSpendReadModel } from '@/src/services/simulation/SafeToSpendReadModel';
import { snapshotService } from '@/src/utils/SnapshotService';
import { observeSafeToSpendInputSnapshot } from '@/src/services/simulation/safeToSpendInputAcquisition';
import * as forecastDateBasis from '@/src/services/simulation/forecastDateBasis';
import type {
  ForecastDateBasis,
  ForecastDateBasisDependencies,
} from '@/src/services/simulation/forecastDateBasis';
import { BehaviorSubject, defer, firstValueFrom, of, Subject, throwError } from 'rxjs';
import { filter, timeout } from 'rxjs/operators';
import { afterEach } from '@jest/globals';
import dayjs from 'dayjs';
jest.mock('@/src/data/repositories/raw/TransactionRawMetricsQueries', () => ({
  transactionRawMetricsQueries: {
    getDailyDeltasGroupedRaw: jest.fn(),
    getLatestBalancesRaw: jest.fn(),
  },
}));
jest.mock('@/src/data/repositories/raw/TransactionRawPatternQueries', () => ({
  transactionRawPatternQueries: { getRecurringPatternsRaw: jest.fn() },
}));

jest.mock('@/src/data/repositories/account');
jest.mock('@/src/data/repositories/BudgetRepository');
jest.mock('@/src/data/repositories/transaction');
jest.mock('@/src/data/repositories/PlannedPaymentRepository');
jest.mock('@/src/data/repositories/journal/JournalObserveQueries');
jest.mock('@/src/data/repositories/journal/journalQueryRepository');
jest.mock('@/src/data/repositories/WorkplaceRepository');
jest.mock('@/src/services/exchange-rate-service');
jest.mock('@/src/services/currencyConversion', () => ({
  convertAmount: jest.fn(async ({ amount }: { amount: number }) => ({ ok: true, amount })),
  convertJournalLineAmount: jest.fn(async ({ amount }: { amount: number }) => ({
    ok: true,
    amount,
  })),
}));
jest.mock('@/src/services/budget/budgetReadService');
jest.mock('@/src/services/balance/balanceReadService', () => ({
  balanceReadService: {
    getAccountBalances: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock('@/src/services/simulation/CashFlowSimulationService');
jest.mock('@/src/utils/SnapshotService', () => ({
  snapshotService: {
    saveCustomSnapshot: jest.fn(),
  },
}));
jest.mock('@/src/services/preferences', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { of } = require('rxjs');
  return {
    preferences: {
      defaultCurrencyCode: 'USD',
      sts: {
        observeForWorkplace: jest.fn(() => of(60)),
        observeSafeToSpendDays: jest.fn(() => of(60)),
        safeToSpendDays: 60,
      },
      insights: {
        dismissedPatternIds: jest.fn(() => []),
        dismissPattern: jest.fn(),
        undismissPattern: jest.fn(),
      },
    },
  };
});

const emptySimResult = {
  simulationResult: {
    summary: { safeToSpend: 0, shortfall: 0, trajectoryMinBalance: 0 },
    projections: [],
  },
  report: {
    summary: {
      totalFutureInflow: 0,
      totalPlannedInflow: 0,
      totalPlannedOutflow: 0,
      totalCommittedPlanned: 0,
    },
    budget: { currentMonthRemaining: 0, nextMonthProjected: 0, nextMonthDays: 30 },
  },
  accountSummaries: [],
  accountMap: new Map(),
  normalizedStartingBalances: new Map<string, number>(),
};

describe('SafeToSpendReadModel', () => {
  afterEach(() => {
    safeToSpendReadModel.clearCache();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    reactiveCacheCoordinator.clearNamespaces([
      REACTIVE_CACHE_NAMESPACES.workplaceAccounts,
      REACTIVE_CACHE_NAMESPACES.workplaceJournalMeta,
      REACTIVE_CACHE_NAMESPACES.workplaceActiveCount,
    ]);
    safeToSpendReadModel.clearCache();

    (accountObserveQueries.observeByType as jest.Mock).mockReturnValue(of([]));
    (accountObserveQueries.observeAll as jest.Mock).mockReturnValue(of([]));
    (budgetRepository.observeAllActive as jest.Mock).mockReturnValue(of([]));
    (plannedPaymentRepository.observeAll as jest.Mock).mockReturnValue(of([]));
    (plannedPaymentRepository.observeActive as jest.Mock).mockReturnValue(of([]));
    (journalObserveQueries.observeStatusMeta as jest.Mock).mockReturnValue(of([]));
    (journalObserveQueries.observePlannedInRange as jest.Mock).mockReturnValue(of([]));
    (journalQueryRepository.findByIds as jest.Mock).mockResolvedValue([]);
    (transactionObserveQueries.observeByDateRange as jest.Mock).mockImplementation(() => of([]));
    (transactionObserveQueries.observeActiveCount as jest.Mock).mockReturnValue(of(0));
    (transactionQueryRepository.findByAccountsAndDateRange as jest.Mock).mockResolvedValue([]);
    (transactionQueryRepository.findByJournals as jest.Mock).mockResolvedValue([]);
    (transactionRawPatternQueries.getRecurringPatternsRaw as jest.Mock).mockResolvedValue([]);
    (transactionRawMetricsQueries.getDailyDeltasGroupedRaw as jest.Mock).mockResolvedValue([]);
    (transactionRawMetricsQueries.getLatestBalancesRaw as jest.Mock).mockResolvedValue(new Map());
    (exchangeRateService.fetchRatesForBase as jest.Mock).mockResolvedValue({});
    (exchangeRateService.observeSpotRateUpdates as jest.Mock).mockReturnValue(of(''));
    (budgetReadService.observeBudgetUsage as jest.Mock).mockReturnValue(
      of({ remaining: 0, spent: 0 }),
    );
    (balanceReadService.getAccountBalances as jest.Mock).mockResolvedValue([]);
    (workplaceRepository.observeById as jest.Mock).mockReturnValue(
      of({ defaultCurrencyCode: 'USD' }),
    );
    (cashFlowSimulationService.simulate as jest.Mock).mockResolvedValue(emptySimResult);
  });

  describe('forWorkplace().watch()', () => {
    it('recovers a failed balance acquisition on a same-day foreground resume without ledger edits', async () => {
      let clock = new Date(2026, 8, 30, 9).getTime();
      jest.spyOn(Date, 'now').mockImplementation(() => clock);
      let foreground: (() => void) | undefined;
      let nextTimer = 0;
      const timers = new Map<number, () => void>();
      const dependencies: ForecastDateBasisDependencies = {
        now: () => clock,
        setTimer: callback => {
          const id = ++nextTimer;
          timers.set(id, callback);
          return id as unknown as ReturnType<typeof setTimeout>;
        },
        clearTimer: timer => {
          timers.delete(timer as unknown as number);
        },
        observeForeground: listener => {
          foreground = listener;
          return () => {
            foreground = undefined;
          };
        },
      };
      const realObserveDateBasis = forecastDateBasis.observeForecastDateBasis;
      jest
        .spyOn(forecastDateBasis, 'observeForecastDateBasis')
        .mockImplementation(() => realObserveDateBasis(dependencies));
      const cash = {
        id: 'cash',
        accountType: AccountType.ASSET,
        accountSubtype: AccountSubtype.CASH,
        currencyCode: 'USD',
      };
      (accountObserveQueries.observeAll as jest.Mock).mockReturnValue(of([cash]));
      (balanceReadService.getAccountBalances as jest.Mock)
        .mockRejectedValueOnce(new Error('temporary balance read failure'))
        .mockResolvedValue([{ accountId: 'cash', balance: 1000 }]);
      (cashFlowSimulationService.simulate as jest.Mock).mockImplementation(
        async ({ startingBalances }) => {
          const balance = startingBalances.get('cash');
          return {
            ...emptySimResult,
            simulationResult: {
              summary: { safeToSpend: balance, shortfall: 0, trajectoryMinBalance: balance },
              projections: [],
            },
          };
        },
      );
      const stream = safeToSpendReadModel.forWorkplace('test-wp' as WorkplaceId).watch();
      try {
        const failed = await firstValueFrom(
          stream.pipe(
            filter(result => result.quality === 'unavailable'),
            timeout({ first: 1000 }),
          ),
        );
        expect(failed.projectionError).toBe('Input unavailable');
        expect(balanceReadService.getAccountBalances).toHaveBeenCalledTimes(1);
        expect(timers.size).toBe(1);

        clock += 60 * 60 * 1000;
        const recovered = firstValueFrom(
          stream.pipe(
            filter(result => result.quality === 'ready'),
            timeout({ first: 1000 }),
          ),
        );
        foreground?.();
        const ready = await recovered;
        expect(ready.summary.safeToSpend).toBe(1000);
        expect(ready.totalLiquidAssets).toBe(1000);
        expect(ready.asOf).toBe(clock);
        expect(balanceReadService.getAccountBalances).toHaveBeenCalledTimes(2);
        expect(timers.size).toBe(1);
      } finally {
        safeToSpendReadModel.clearCache();
      }
      expect(timers.size).toBe(0);
      expect(foreground).toBeUndefined();
    });

    it('invalidates the previous currency before a deferred replacement acquisition completes', done => {
      const workplaces$ = new BehaviorSubject({ defaultCurrencyCode: 'USD' });
      (workplaceRepository.observeById as jest.Mock).mockReturnValue(workplaces$.asObservable());
      const cash = {
        id: 'cash',
        accountType: AccountType.ASSET,
        accountSubtype: AccountSubtype.CASH,
      };
      (accountObserveQueries.observeAll as jest.Mock).mockReturnValue(of([cash]));
      (accountObserveQueries.observeByType as jest.Mock).mockImplementation((_wp, type) =>
        type === AccountType.ASSET ? of([cash]) : of([]),
      );
      (balanceReadService.getAccountBalances as jest.Mock).mockResolvedValue([
        { accountId: 'cash', balance: 1000 },
      ]);
      let releaseEur: ((value: unknown) => void) | undefined;
      let currencyInvalidated = false;
      const eurResult = {
        ...emptySimResult,
        simulationResult: {
          summary: { safeToSpend: 900, shortfall: 0, trajectoryMinBalance: 900 },
          projections: [],
        },
      };
      (cashFlowSimulationService.simulate as jest.Mock)
        .mockResolvedValueOnce({
          ...emptySimResult,
          simulationResult: {
            summary: { safeToSpend: 1000, shortfall: 0, trajectoryMinBalance: 1000 },
            projections: [],
          },
        })
        .mockImplementationOnce(
          () =>
            new Promise(resolve => {
              releaseEur = resolve;
              if (currencyInvalidated) resolve(eurResult);
            }),
        );

      let readySeen = false;
      const sub = safeToSpendReadModel
        .forWorkplace('test-wp' as WorkplaceId)
        .watch()
        .subscribe(result => {
          if (result.quality === 'ready' && result.currencyCode === 'USD') {
            readySeen = true;
            workplaces$.next({ defaultCurrencyCode: 'EUR' });
          } else if (
            readySeen &&
            result.currencyCode === 'EUR' &&
            result.quality === 'unavailable'
          ) {
            expect(result.projectionError).toBe('Refreshing forecast');
            currencyInvalidated = true;
            releaseEur?.(eurResult);
          } else if (result.currencyCode === 'EUR' && result.quality === 'ready') {
            expect(result.summary.safeToSpend).toBe(900);
            sub.unsubscribe();
            done();
          }
        });
    });

    it('rebuilds acquisition date windows and budget usage from a controlled new-day basis', done => {
      const dayOne = new Date(2026, 8, 30, 9).getTime();
      const dayTwo = new Date(2026, 9, 1, 9).getTime();
      const dateNow = jest.spyOn(Date, 'now').mockReturnValue(dayOne);
      const cash = {
        id: 'cash',
        accountType: AccountType.ASSET,
        accountSubtype: AccountSubtype.CASH,
      };
      (accountObserveQueries.observeAll as jest.Mock).mockReturnValue(of([cash]));
      (accountObserveQueries.observeByType as jest.Mock).mockImplementation((_wp, type) =>
        type === AccountType.ASSET ? of([cash]) : of([]),
      );
      (budgetRepository.observeAllActive as jest.Mock).mockReturnValue(
        of([{ id: 'budget-1', currencyCode: 'USD' }]),
      );
      (balanceReadService.getAccountBalances as jest.Mock).mockImplementation(
        async (_wp: WorkplaceId, asOf: number) => [
          { accountId: 'cash', balance: asOf === dayTwo ? 1200 : 1000 },
        ],
      );
      const basis$ = new Subject<ForecastDateBasis>();
      let readyCount = 0;
      const subscription = observeSafeToSpendInputSnapshot(
        'test-wp' as WorkplaceId,
        'USD',
        basis$,
      ).subscribe(outcome => {
        if (outcome.kind !== 'ready') return;
        readyCount += 1;
        if (readyCount === 1) {
          expect(outcome.snapshot.asOf).toBe(dayOne);
          dateNow.mockReturnValue(dayTwo);
          basis$.next({ asOf: dayTwo, startOfToday: new Date(2026, 9, 1).getTime() });
        } else {
          expect(outcome.snapshot.asOf).toBe(dayTwo);
          expect(outcome.snapshot.startOfToday.valueOf()).toBe(new Date(2026, 9, 1).getTime());
          expect(journalObserveQueries.observePlannedInRange).toHaveBeenLastCalledWith(
            'test-wp',
            new Date(2026, 7, 2).getTime(),
            new Date(2026, 10, 30, 23, 59, 59, 999).getTime(),
          );
          expect(budgetReadService.observeBudgetUsage).toHaveBeenLastCalledWith(
            'test-wp',
            'budget-1',
            dayTwo,
          );
          subscription.unsubscribe();
          dateNow.mockRestore();
          done();
        }
      });
      basis$.next({ asOf: dayOne, startOfToday: new Date(2026, 8, 30).getTime() });
    });

    it('keeps observing when ledger source errors are separated by successful emissions', done => {
      const cash = {
        id: 'cash',
        accountType: AccountType.ASSET,
        accountSubtype: AccountSubtype.CASH,
      };
      (accountObserveQueries.observeAll as jest.Mock).mockReturnValue(of([cash]));
      (balanceReadService.getAccountBalances as jest.Mock).mockResolvedValue([
        { accountId: 'cash', balance: 1000 },
      ]);
      const sources: BehaviorSubject<unknown[]>[] = [];
      (journalObserveQueries.observePlannedInRange as jest.Mock).mockImplementation(() =>
        defer(() => {
          const source = new BehaviorSubject<unknown[]>([]);
          sources.push(source);
          return source;
        }),
      );
      const basis$ = new BehaviorSubject<ForecastDateBasis>({
        asOf: Date.now(),
        startOfToday: dayjs().startOf('day').valueOf(),
      });
      let readyCount = 0;
      const subscription = observeSafeToSpendInputSnapshot(
        'test-wp' as WorkplaceId,
        'USD',
        basis$,
      ).subscribe(outcome => {
        expect(outcome.kind).not.toBe('failed');
        if (outcome.kind !== 'ready') return;
        readyCount += 1;
        if (readyCount <= 3) {
          sources[sources.length - 1].error(new Error('planned journal source failed'));
          return;
        }
        subscription.unsubscribe();
        done();
      });
    });

    it('settles on a failed outcome when a ledger source keeps erroring', done => {
      const cash = {
        id: 'cash',
        accountType: AccountType.ASSET,
        accountSubtype: AccountSubtype.CASH,
      };
      (accountObserveQueries.observeAll as jest.Mock).mockReturnValue(of([cash]));
      (journalObserveQueries.observePlannedInRange as jest.Mock).mockImplementation(() =>
        throwError(() => new Error('planned journal source failed')),
      );
      const basis$ = new BehaviorSubject<ForecastDateBasis>({
        asOf: Date.now(),
        startOfToday: dayjs().startOf('day').valueOf(),
      });
      const subscription = observeSafeToSpendInputSnapshot(
        'test-wp' as WorkplaceId,
        'USD',
        basis$,
      ).subscribe({
        next: outcome => {
          if (outcome.kind !== 'failed') return;
          expect(journalObserveQueries.observePlannedInRange).toHaveBeenCalledTimes(1);
          subscription.unsubscribe();
          done();
        },
        error: done,
      });
    });

    it('uses a fresh noon acquisition cutoff after its morning date-basis emission', done => {
      const morning = new Date(2026, 8, 30, 9).getTime();
      const noon = new Date(2026, 8, 30, 12).getTime();
      jest.useFakeTimers().setSystemTime(morning);
      const cash = {
        id: 'cash',
        accountType: AccountType.ASSET,
        accountSubtype: AccountSubtype.CASH,
      };
      const accounts$ = new BehaviorSubject([cash]);
      (accountObserveQueries.observeAll as jest.Mock).mockReturnValue(accounts$.asObservable());
      (accountObserveQueries.observeByType as jest.Mock).mockImplementation((_wp, type) =>
        type === AccountType.ASSET ? accounts$.asObservable() : of([]),
      );
      (balanceReadService.getAccountBalances as jest.Mock).mockImplementation(
        async (_wp: WorkplaceId, asOf: number) => [
          { accountId: 'cash', balance: asOf >= noon ? 1200 : 1000 },
        ],
      );
      (cashFlowSimulationService.simulate as jest.Mock).mockImplementation(
        async (input: { startingBalances: Map<string, number> }) => ({
          ...emptySimResult,
          simulationResult: {
            summary: {
              safeToSpend: input.startingBalances.get('cash'),
              shortfall: 0,
              trajectoryMinBalance: input.startingBalances.get('cash'),
            },
            projections: [],
          },
        }),
      );

      let readyCount = 0;
      const sub = safeToSpendReadModel
        .forWorkplace('test-wp' as WorkplaceId)
        .watch()
        .subscribe(result => {
          if (result.quality !== 'ready') return;
          readyCount += 1;
          if (readyCount === 1) {
            expect(result.asOf).toBe(morning);
            expect(result.summary.safeToSpend).toBe(1000);
            jest.setSystemTime(noon);
            accounts$.next([{ ...cash }]);
            void jest.advanceTimersByTimeAsync(1000);
          } else {
            expect(result.asOf).toBeGreaterThanOrEqual(noon);
            expect(result.summary.safeToSpend).toBe(1200);
            expect(
              (balanceReadService.getAccountBalances as jest.Mock).mock.calls.at(-1)?.[1],
            ).toBe(result.asOf);
            expect(
              (cashFlowSimulationService.simulate as jest.Mock).mock.calls.at(-1)?.[0].asOf,
            ).toBe(result.asOf);
            sub.unsubscribe();
            done();
          }
        });
    });

    it('values foreign liquid asset balances at the current spot rate', done => {
      const euroWallet = {
        id: 'euro-wallet',
        accountType: AccountType.ASSET,
        accountSubtype: AccountSubtype.CASH,
        currencyCode: 'EUR',
      };
      (accountObserveQueries.observeByType as jest.Mock).mockImplementation((_workplaceId, type) =>
        type === AccountType.ASSET ? of([euroWallet]) : of([]),
      );
      (accountObserveQueries.observeAll as jest.Mock).mockReturnValue(of([euroWallet]));
      (balanceReadService.getAccountBalances as jest.Mock).mockResolvedValue([
        { accountId: euroWallet.id, balance: 10, currencyCode: 'EUR' },
      ]);
      (convertAmount as jest.Mock).mockImplementation(
        async ({ amount, fromCurrency, toCurrency, mode }) =>
          fromCurrency === 'EUR' && toCurrency === 'USD' && mode === 'spot'
            ? { ok: true, amount: amount * 1.137 }
            : { ok: true, amount },
      );
      (cashFlowSimulationService.simulate as jest.Mock).mockResolvedValue({
        ...emptySimResult,
        report: {
          ...emptySimResult.report,
          allFlows: [],
          liabilities: {
            total: 0,
            totalCreditCard: 0,
            totalOther: 0,
            committed: 0,
            committedCreditCard: 0,
            committedOther: 0,
          },
        },
      });

      safeToSpendReadModel
        .forWorkplace('test-wp' as WorkplaceId)
        .watch()
        .subscribe(result => {
          expect(convertAmount).toHaveBeenCalledWith(
            expect.objectContaining({
              amount: 10,
              fromCurrency: 'EUR',
              toCurrency: 'USD',
              mode: 'spot',
            }),
          );
          expect(result.totalLiquidAssets).toBe(11.37);
          done();
        });
    });

    it('does not label an unvalued foreign balance as workplace currency', done => {
      const usdWallet = {
        id: 'usd-wallet',
        accountType: AccountType.ASSET,
        accountSubtype: AccountSubtype.CASH,
        currencyCode: 'USD',
      };
      const euroWallet = {
        id: 'euro-wallet',
        accountType: AccountType.ASSET,
        accountSubtype: AccountSubtype.CASH,
        currencyCode: 'EUR',
      };
      const assets = [usdWallet, euroWallet];
      (accountObserveQueries.observeByType as jest.Mock).mockImplementation((_workplaceId, type) =>
        type === AccountType.ASSET ? of(assets) : of([]),
      );
      (accountObserveQueries.observeAll as jest.Mock).mockReturnValue(of(assets));
      (balanceReadService.getAccountBalances as jest.Mock).mockResolvedValue([
        { accountId: usdWallet.id, balance: 5, currencyCode: 'USD' },
        { accountId: euroWallet.id, balance: 10, currencyCode: 'EUR' },
      ]);
      (convertAmount as jest.Mock).mockResolvedValue({ ok: false, reason: 'missing_rate' });
      (cashFlowSimulationService.simulate as jest.Mock).mockResolvedValue({
        ...emptySimResult,
        report: {
          ...emptySimResult.report,
          allFlows: [],
          liabilities: {
            total: 0,
            totalCreditCard: 0,
            totalOther: 0,
            committed: 0,
            committedCreditCard: 0,
            committedOther: 0,
          },
        },
      });

      safeToSpendReadModel
        .forWorkplace('test-wp' as WorkplaceId)
        .watch()
        .subscribe(result => {
          expect(result.totalLiquidAssets).toBe(5);
          expect(result.hasUnvaluedEntries).toBe(true);
          done();
        });
    });

    it('should calculate safe to spend using only liquid assets and liquid liabilities', done => {
      const mockAssets = [
        { id: 'a1', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.CASH },
        { id: 'a2', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.RETIREMENT },
      ];

      const mockLiabilities = [
        {
          id: 'l1',
          accountType: AccountType.LIABILITY,
          accountSubtype: AccountSubtype.CREDIT_CARD,
        },
        { id: 'l2', accountType: AccountType.LIABILITY, accountSubtype: AccountSubtype.MORTGAGE },
      ];

      (accountObserveQueries.observeByType as jest.Mock).mockImplementation(
        (_workplaceId, type) => {
          if (type === AccountType.ASSET) return of(mockAssets);
          if (type === AccountType.LIABILITY) return of(mockLiabilities);
          return of([]);
        },
      );
      (accountObserveQueries.observeAll as jest.Mock).mockReturnValue(
        of([...mockAssets, ...mockLiabilities]),
      );
      (balanceReadService.getAccountBalances as jest.Mock).mockResolvedValue([
        { accountId: 'a1', balance: 5000 },
        { accountId: 'l1', balance: -1000 },
      ]);

      (cashFlowSimulationService.simulate as jest.Mock).mockResolvedValue({
        simulationResult: {
          summary: { safeToSpend: 4000, shortfall: 0, trajectoryMinBalance: 4000 },
          projections: [],
        },
        report: {
          summary: {
            totalFutureInflow: 0,
            totalPlannedInflow: 0,
            totalPlannedOutflow: 0,
            totalCommittedPlanned: 0,
          },
          budget: { currentMonthRemaining: 0, nextMonthProjected: 0, nextMonthDays: 30 },
          allFlows: [],
          liabilities: {
            total: 0,
            totalCreditCard: 0,
            totalOther: 0,
            committed: 0,
            committedCreditCard: 0,
            committedOther: 0,
          },
        },
        accountSummaries: [],
        accountMap: new Map(),
        normalizedStartingBalances: new Map<string, number>(),
      });

      safeToSpendReadModel
        .forWorkplace('test-wp' as WorkplaceId)
        .watch()
        .subscribe(result => {
          expect(result.totalLiquidAssets).toBe(5000);
          expect(result.summary.safeToSpend).toBe(4000);
          done();
        });
    });
  });

  describe('forWorkplace cache policy', () => {
    it('reuses one workplace-keyed observable for watch and watchHeadline', () => {
      const handle = safeToSpendReadModel.forWorkplace('test-wp' as WorkplaceId);
      const watchA = handle.watch();
      const watchB = handle.watch();
      const watchFromSecondHandle = safeToSpendReadModel
        .forWorkplace('test-wp' as WorkplaceId)
        .watch();

      expect(watchA).toBe(watchB);
      expect(watchA).toBe(watchFromSecondHandle);
    });

    it('evicts prior workplace cache when switching workplaces', () => {
      const first = safeToSpendReadModel.forWorkplace('wp-a' as WorkplaceId).watch();
      const second = safeToSpendReadModel.forWorkplace('wp-b' as WorkplaceId).watch();
      const firstAgain = safeToSpendReadModel.forWorkplace('wp-a' as WorkplaceId).watch();

      expect(first).not.toBe(second);
      // After switching to wp-b, wp-a was evicted — a new pipeline is created.
      expect(firstAgain).not.toBe(first);
      expect(firstAgain).not.toBe(second);
    });

    it('does not persist a pre-warm result after its workplace cache is disposed', async () => {
      const mockAssets = [
        { id: 'a1', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.CASH },
      ];
      (accountObserveQueries.observeAll as jest.Mock).mockReturnValue(of(mockAssets));
      (balanceReadService.getAccountBalances as jest.Mock).mockResolvedValue([
        { accountId: 'a1', balance: 5000 },
      ]);

      let resolveSimulation: ((result: typeof emptySimResult) => void) | undefined;
      const simulationPromise = new Promise<typeof emptySimResult>(resolve => {
        resolveSimulation = resolve;
      });
      (cashFlowSimulationService.simulate as jest.Mock).mockReturnValue(simulationPromise);
      const simulate = cashFlowSimulationService.simulate as jest.Mock;

      const preWarmPromise = safeToSpendReadModel.forWorkplace('test-wp' as WorkplaceId).preWarm();
      for (let i = 0; i < 20 && !simulate.mock.calls.length; i += 1) {
        await Promise.resolve();
      }

      expect(cashFlowSimulationService.simulate).toHaveBeenCalled();
      safeToSpendReadModel.clearCache();
      resolveSimulation?.(emptySimResult);
      await preWarmPromise;
      await Promise.resolve();

      expect(snapshotService.saveCustomSnapshot).not.toHaveBeenCalled();
    });

    it('switchMaps currency on the same workplace stream', done => {
      const mockAssets = [
        { id: 'a1', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.CASH },
      ];
      (accountObserveQueries.observeAll as jest.Mock).mockReturnValue(of(mockAssets));
      (balanceReadService.getAccountBalances as jest.Mock).mockResolvedValue([
        { accountId: 'a1', balance: 5000 },
      ]);
      (cashFlowSimulationService.simulate as jest.Mock).mockImplementation(
        async (input: { resultCurrency: string }) => ({
          ...emptySimResult,
          simulationResult: {
            summary: { safeToSpend: 5000, shortfall: 0, trajectoryMinBalance: 5000 },
            projections: [],
          },
          report: {
            ...emptySimResult.report,
            summary: {
              totalFutureInflow: 0,
              totalPlannedInflow: 0,
              totalPlannedOutflow: 0,
              totalCommittedPlanned: 0,
            },
            budget: { currentMonthRemaining: 0, nextMonthProjected: 0, nextMonthDays: 30 },
            allFlows: [],
            liabilities: {
              total: 0,
              totalCreditCard: 0,
              totalOther: 0,
              committed: 0,
              committedCreditCard: 0,
              committedOther: 0,
            },
          },
          // Currency comes from assemble using defaultCurrencyCode passed into pipeline
          currencyEcho: input.resultCurrency,
        }),
      );

      const currency$ = new BehaviorSubject({ defaultCurrencyCode: 'USD' });
      (workplaceRepository.observeById as jest.Mock).mockReturnValue(currency$.asObservable());

      const currencies: string[] = [];
      const sub = safeToSpendReadModel
        .forWorkplace('test-wp' as WorkplaceId)
        .watch()
        .subscribe(result => {
          currencies.push(result.currencyCode);
          if (currencies.length === 1) {
            expect(result.currencyCode).toBe('USD');
            currency$.next({ defaultCurrencyCode: 'EUR' });
          } else if (currencies.length === 2) {
            expect(result.currencyCode).toBe('EUR');
            sub.unsubscribe();
            done();
          }
        });
    });

    it('watchHeadline projects summary fields from the workplace watch', done => {
      const mockAssets = [
        { id: 'a1', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.CASH },
      ];
      (accountObserveQueries.observeAll as jest.Mock).mockReturnValue(of(mockAssets));
      (balanceReadService.getAccountBalances as jest.Mock).mockResolvedValue([
        { accountId: 'a1', balance: 5000 },
      ]);
      (cashFlowSimulationService.simulate as jest.Mock).mockResolvedValue({
        simulationResult: {
          summary: {
            safeToSpend: 4200,
            shortfall: 0,
            trajectoryMinBalance: 4100,
            firstMajorInflowDay: 3,
          },
          projections: [],
        },
        report: {
          summary: {
            totalFutureInflow: 0,
            totalPlannedInflow: 0,
            totalPlannedOutflow: 0,
            totalCommittedPlanned: 0,
            firstMajorInflowDay: 3,
          },
          budget: { currentMonthRemaining: 0, nextMonthProjected: 0, nextMonthDays: 30 },
          allFlows: [],
          liabilities: {
            total: 0,
            totalCreditCard: 0,
            totalOther: 0,
            committed: 0,
            committedCreditCard: 0,
            committedOther: 0,
          },
        },
        accountSummaries: [],
        accountMap: new Map(),
        normalizedStartingBalances: new Map<string, number>(),
      });

      safeToSpendReadModel
        .forWorkplace('test-wp' as WorkplaceId)
        .watchHeadline()
        .subscribe(headline => {
          expect(headline.currencyCode).toBe('USD');
          expect(headline.safeToSpend).toBe(4200);
          expect(headline.trajectoryMinBalance).toBe(4100);
          done();
        });
    });
  });

  describe('forWorkplace characterization', () => {
    it('returns empty dashboard when no liquid assets exist', done => {
      const nonLiquidAssets = [
        { id: 'a1', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.RETIREMENT },
      ];
      (accountObserveQueries.observeAll as jest.Mock).mockReturnValue(of(nonLiquidAssets));

      safeToSpendReadModel
        .forWorkplace('test-wp' as WorkplaceId)
        .watch()
        .subscribe(result => {
          expect(result.summary.safeToSpend).toBe(0);
          expect(cashFlowSimulationService.simulate).not.toHaveBeenCalled();
          done();
        });
    });

    it('marks projection failure unavailable instead of a valid zero', done => {
      const mockAssets = [
        { id: 'a1', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.CASH },
      ];
      (accountObserveQueries.observeAll as jest.Mock).mockReturnValue(of(mockAssets));
      (balanceReadService.getAccountBalances as jest.Mock).mockResolvedValue([
        { accountId: 'a1', balance: 100 },
      ]);
      (cashFlowSimulationService.simulate as jest.Mock).mockRejectedValue(
        new Error('[SimulationInputInvariant] starting balance for a must be finite'),
      );

      safeToSpendReadModel
        .forWorkplace('test-wp' as WorkplaceId)
        .watch()
        .subscribe(result => {
          expect(result.summary.safeToSpend).toBe(0);
          expect(result.quality).toBe('unavailable');
          expect(result.projectionError).toBeTruthy();
          expect(snapshotService.saveCustomSnapshot).not.toHaveBeenCalled();
          done();
        });
    });

    it('keeps observing inputs after projection failure and recovers on a new input', done => {
      const assets = [
        { id: 'a1', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.CASH },
      ];
      (accountObserveQueries.observeAll as jest.Mock).mockReturnValue(of(assets));
      (balanceReadService.getAccountBalances as jest.Mock).mockResolvedValue([
        { accountId: 'a1', balance: 500 },
      ]);
      const days$ = new BehaviorSubject(60);
      jest.requireMock('@/src/services/preferences').preferences.sts.observeForWorkplace = jest.fn(
        () => days$.asObservable(),
      );
      (cashFlowSimulationService.simulate as jest.Mock)
        .mockRejectedValueOnce(new Error('projection failed'))
        .mockResolvedValue({
          ...emptySimResult,
          simulationResult: {
            summary: { safeToSpend: 75, shortfall: 0, trajectoryMinBalance: 75 },
            projections: [],
          },
        });
      const seen: string[] = [];
      const sub = safeToSpendReadModel
        .forWorkplace('test-wp' as WorkplaceId)
        .watch()
        .subscribe(result => {
          seen.push(result.quality ?? 'ready');
          if (seen.length === 1) {
            expect(result.quality).toBe('unavailable');
            days$.next(61);
          } else if (result.quality === 'ready' && seen.length >= 2) {
            expect(result.quality).toBe('ready');
            expect(result.summary.safeToSpend).toBe(75);
            sub.unsubscribe();
            done();
          }
        });
    });

    it('marks stale values, clears them for empty books, and does not restore them after cache reset', done => {
      const liquid = [
        { id: 'a1', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.CASH },
      ];
      const nonLiquid = [
        {
          id: 'retirement',
          accountType: AccountType.ASSET,
          accountSubtype: AccountSubtype.RETIREMENT,
        },
      ];
      const accounts$ = new BehaviorSubject(liquid);
      (accountObserveQueries.observeAll as jest.Mock).mockReturnValue(accounts$.asObservable());
      (balanceReadService.getAccountBalances as jest.Mock).mockResolvedValue([
        { accountId: 'a1', balance: 500 },
      ]);
      const days$ = new BehaviorSubject(60);
      jest.requireMock('@/src/services/preferences').preferences.sts.observeForWorkplace = jest.fn(
        () => days$.asObservable(),
      );
      (cashFlowSimulationService.simulate as jest.Mock)
        .mockResolvedValueOnce({
          ...emptySimResult,
          simulationResult: {
            summary: { safeToSpend: 88, shortfall: 0, trajectoryMinBalance: 88 },
            projections: [],
          },
        })
        .mockRejectedValueOnce(new Error('refresh failed'))
        .mockRejectedValueOnce(new Error('recovery failed'));
      const sub = safeToSpendReadModel
        .forWorkplace('test-wp' as WorkplaceId)
        .watch()
        .subscribe(result => {
          if (result.quality === 'ready' && result.summary.safeToSpend === 88) {
            days$.next(61);
          } else if (result.quality === 'stale') {
            expect(result.summary.safeToSpend).toBe(88);
            accounts$.next(nonLiquid);
          } else if (result.quality === 'ready' && result.summary.safeToSpend === 0) {
            safeToSpendReadModel.clearCache();
            sub.unsubscribe();
            accounts$.next(liquid);
            safeToSpendReadModel
              .forWorkplace('test-wp' as WorkplaceId)
              .watch()
              .subscribe(next => {
                expect(next.quality).toBe('unavailable');
                expect(next.projectionError).toBeTruthy();
                done();
              });
          }
        });
    });

    it('surfaces a balance-acquisition failure and recovers when the observed accounts change', done => {
      const liquid = [
        { id: 'a1', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.CASH },
      ];
      const accounts$ = new BehaviorSubject(liquid);
      (accountObserveQueries.observeAll as jest.Mock).mockReturnValue(accounts$.asObservable());
      (balanceReadService.getAccountBalances as jest.Mock)
        .mockRejectedValueOnce(new Error('balance read failed'))
        .mockResolvedValue([{ accountId: 'a1', balance: 500 }]);
      (cashFlowSimulationService.simulate as jest.Mock).mockResolvedValue({
        ...emptySimResult,
        simulationResult: {
          summary: { safeToSpend: 45, shortfall: 0, trajectoryMinBalance: 45 },
          projections: [],
        },
      });
      const sub = safeToSpendReadModel
        .forWorkplace('test-wp' as WorkplaceId)
        .watch()
        .subscribe(result => {
          if (result.quality === 'unavailable') {
            expect(result.projectionError).toBeTruthy();
            accounts$.next([
              ...liquid,
              { id: 'a2', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.CASH },
            ]);
          } else if (result.quality === 'ready') {
            expect(result.summary.safeToSpend).toBe(45);
            sub.unsubscribe();
            done();
          }
        });
    });

    it('still emits dashboard when snapshot persistence fails', done => {
      const mockAssets = [
        { id: 'a1', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.CASH },
      ];
      (accountObserveQueries.observeAll as jest.Mock).mockReturnValue(of(mockAssets));
      (balanceReadService.getAccountBalances as jest.Mock).mockResolvedValue([
        { accountId: 'a1', balance: 5000 },
      ]);
      (cashFlowSimulationService.simulate as jest.Mock).mockResolvedValue({
        ...emptySimResult,
        simulationResult: {
          summary: { safeToSpend: 1234, shortfall: 0, trajectoryMinBalance: 1234 },
          projections: [],
        },
      });
      (snapshotService.saveCustomSnapshot as jest.Mock).mockImplementation(() => {
        throw new Error('disk full');
      });

      safeToSpendReadModel
        .forWorkplace('test-wp' as WorkplaceId)
        .watch()
        .subscribe(result => {
          expect(result.summary.safeToSpend).toBe(1234);
          expect(snapshotService.saveCustomSnapshot).toHaveBeenCalled();
          done();
        });
    });

    it('re-runs pipeline when safe-to-spend window preference changes', done => {
      const mockAssets = [
        { id: 'a1', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.CASH },
      ];
      (accountObserveQueries.observeAll as jest.Mock).mockReturnValue(of(mockAssets));
      (balanceReadService.getAccountBalances as jest.Mock).mockResolvedValue([
        { accountId: 'a1', balance: 5000 },
      ]);

      const days$ = new BehaviorSubject(60);
      const preferencesModule = jest.requireMock('@/src/services/preferences');
      preferencesModule.preferences.sts.observeForWorkplace = jest.fn(() => days$.asObservable());

      let simulateCalls = 0;
      (cashFlowSimulationService.simulate as jest.Mock).mockImplementation(
        async (input: { simulationDays: number }) => {
          simulateCalls += 1;
          return {
            ...emptySimResult,
            simulationResult: {
              summary: {
                safeToSpend: input.simulationDays,
                shortfall: 0,
                trajectoryMinBalance: input.simulationDays,
              },
              projections: [],
            },
          };
        },
      );

      const seen: number[] = [];
      const sub = safeToSpendReadModel
        .forWorkplace('test-wp' as WorkplaceId)
        .watch()
        .subscribe(result => {
          if (result.quality !== 'ready') return;
          seen.push(result.summary.safeToSpend);
          if (seen.length === 1) {
            expect(result.summary.safeToSpend).toBe(60);
            days$.next(90);
          } else if (seen.length === 2) {
            expect(result.summary.safeToSpend).toBe(90);
            expect(simulateCalls).toBeGreaterThanOrEqual(2);
            sub.unsubscribe();
            done();
          }
        });
    });
  });
});
