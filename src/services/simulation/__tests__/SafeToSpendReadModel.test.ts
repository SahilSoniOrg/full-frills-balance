import { AccountSubtype, AccountType } from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';

import { accountObserveQueries } from '@/src/data/repositories/account';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { journalObserveQueries } from '@/src/data/repositories/journal/journalTimelineModule';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import {
  transactionObserveQueries,
  transactionQueryRepository,
} from '@/src/data/repositories/transaction';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { balanceService } from '@/src/services/balance';
import { budgetReadService } from '@/src/services/budget/budgetReadService';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { cashFlowSimulationService } from '@/src/services/simulation/CashFlowSimulationService';
import { clearReactiveWorkplaceObservesCache } from '@/src/services/reactive/reactiveWorkplaceObserves';
import { safeToSpendReadModel } from '@/src/services/simulation/SafeToSpendReadModel';
import { snapshotService } from '@/src/utils/SnapshotService';
import { BehaviorSubject, of } from 'rxjs';

jest.mock('@/src/data/repositories/account');
jest.mock('@/src/data/repositories/BudgetRepository');
jest.mock('@/src/data/repositories/transaction');
jest.mock('@/src/data/repositories/TransactionRawRepository');
jest.mock('@/src/data/repositories/PlannedPaymentRepository');
jest.mock('@/src/data/repositories/journal/journalTimelineModule');
jest.mock('@/src/data/repositories/WorkplaceRepository');
jest.mock('@/src/services/exchange-rate-service');
jest.mock('@/src/services/currencyConversion', () => ({
  convertAmount: jest.fn(async ({ amount }: { amount: number }) => ({ ok: true, amount })),
}));
jest.mock('@/src/services/budget/budgetReadService');
jest.mock('@/src/services/balance', () => ({
  balanceService: {
    getAccountBalances: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock('@/src/services/simulation/CashFlowSimulationService');
jest.mock('@/src/utils/SnapshotService', () => ({
  snapshotService: {
    saveCustomSnapshot: jest.fn(),
  },
}));
jest.mock('@/src/utils/preferences', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { of } = require('rxjs');
  return {
    preferences: {
      defaultCurrencyCode: 'USD',
      sts: {
        observeSafeToSpendDays: jest.fn(() => of(60)),
        safeToSpendDays: 60,
      },
      insights: {
        dismissedPatternIds: [],
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
};

describe('SafeToSpendReadModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearReactiveWorkplaceObservesCache();
    safeToSpendReadModel.clearCache();

    (accountObserveQueries.observeByType as jest.Mock).mockReturnValue(of([]));
    (accountObserveQueries.observeAll as jest.Mock).mockReturnValue(of([]));
    (budgetRepository.observeAllActive as jest.Mock).mockReturnValue(of([]));
    (plannedPaymentRepository.observeAll as jest.Mock).mockReturnValue(of([]));
    (plannedPaymentRepository.observeActive as jest.Mock).mockReturnValue(of([]));
    (journalObserveQueries.observeStatusMeta as jest.Mock).mockReturnValue(of([]));
    (journalObserveQueries.observePlannedInRange as jest.Mock).mockReturnValue(of([]));
    (transactionObserveQueries.observeByDateRange as jest.Mock).mockImplementation(() => of([]));
    (transactionObserveQueries.observeActiveCount as jest.Mock).mockReturnValue(of(0));
    (transactionQueryRepository.findByAccountsAndDateRange as jest.Mock).mockResolvedValue([]);
    (transactionQueryRepository.findByJournals as jest.Mock).mockResolvedValue([]);
    (transactionRawRepository.getRecurringPatternsRaw as jest.Mock).mockResolvedValue([]);
    (transactionRawRepository.getDailyDeltasGroupedRaw as jest.Mock).mockResolvedValue([]);
    (transactionRawRepository.getLatestBalancesRaw as jest.Mock).mockResolvedValue(new Map());
    (exchangeRateService.fetchRatesForBase as jest.Mock).mockResolvedValue({});
    (budgetReadService.observeBudgetUsage as jest.Mock).mockReturnValue(
      of({ remaining: 0, spent: 0 }),
    );
    (balanceService.getAccountBalances as jest.Mock).mockResolvedValue([]);
    (workplaceRepository.observeById as jest.Mock).mockReturnValue(
      of({ defaultCurrencyCode: 'USD' }),
    );
    (cashFlowSimulationService.simulate as jest.Mock).mockResolvedValue(emptySimResult);
  });

  describe('forWorkplace().watch()', () => {
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
      (balanceService.getAccountBalances as jest.Mock).mockResolvedValue([
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
      (balanceService.getAccountBalances as jest.Mock).mockResolvedValue([
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
      (balanceService.getAccountBalances as jest.Mock).mockResolvedValue([
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
      (balanceService.getAccountBalances as jest.Mock).mockResolvedValue([
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

    it('falls back to empty dashboard when simulation throws', done => {
      const mockAssets = [
        { id: 'a1', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.CASH },
      ];
      (accountObserveQueries.observeAll as jest.Mock).mockReturnValue(of(mockAssets));
      (balanceService.getAccountBalances as jest.Mock).mockResolvedValue([
        { accountId: 'a1', balance: 100 },
      ]);
      (cashFlowSimulationService.simulate as jest.Mock).mockRejectedValue(new Error('sim fail'));

      safeToSpendReadModel
        .forWorkplace('test-wp' as WorkplaceId)
        .watch()
        .subscribe(result => {
          expect(result.summary.safeToSpend).toBe(0);
          done();
        });
    });

    it('still emits dashboard when snapshot persistence fails', done => {
      const mockAssets = [
        { id: 'a1', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.CASH },
      ];
      (accountObserveQueries.observeAll as jest.Mock).mockReturnValue(of(mockAssets));
      (balanceService.getAccountBalances as jest.Mock).mockResolvedValue([
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
      (balanceService.getAccountBalances as jest.Mock).mockResolvedValue([
        { accountId: 'a1', balance: 5000 },
      ]);

      const days$ = new BehaviorSubject(60);
      const preferencesModule = jest.requireMock('@/src/utils/preferences');
      preferencesModule.preferences.sts.observeSafeToSpendDays = jest.fn(() =>
        days$.asObservable(),
      );

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
