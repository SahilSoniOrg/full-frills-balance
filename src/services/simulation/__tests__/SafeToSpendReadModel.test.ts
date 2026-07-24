import { AccountSubtype, AccountType } from '@/src/data/models/Account';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { balanceService } from '@/src/services/BalanceService';
import { budgetReadService } from '@/src/services/budget/budgetReadService';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { cashFlowSimulationService } from '@/src/services/simulation/CashFlowSimulationService';
import { safeToSpendReadModel } from '@/src/services/simulation/SafeToSpendReadModel';
import { reactiveDataService } from '@/src/services/ReactiveDataService';
import { WorkplaceId } from '@/src/types/domain';
import { of } from 'rxjs';

jest.mock('@/src/data/repositories/AccountRepository');
jest.mock('@/src/data/repositories/BudgetRepository');
jest.mock('@/src/data/repositories/TransactionRepository');
jest.mock('@/src/data/repositories/TransactionRawRepository');
jest.mock('@/src/data/repositories/PlannedPaymentRepository');
jest.mock('@/src/data/repositories/JournalRepository');
jest.mock('@/src/data/repositories/WorkplaceRepository');
jest.mock('@/src/services/exchange-rate-service');
jest.mock('@/src/services/budget/budgetReadService');
jest.mock('@/src/services/BalanceService');
jest.mock('@/src/services/simulation/CashFlowSimulationService');
jest.mock('@/src/utils/preferences', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { of } = require('rxjs');
  return {
    preferences: {
      defaultCurrencyCode: 'USD',
      dismissedPatternIds: [],
      dismissPattern: jest.fn(),
      undismissPattern: jest.fn(),
      observe: jest.fn(() => of(60)),
      safeToSpendDays: 60,
    },
  };
});

describe('SafeToSpendReadModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    reactiveDataService.clearCache();
    safeToSpendReadModel.clearCache();

    (accountRepository.observeByType as jest.Mock).mockReturnValue(of([]));
    (accountRepository.observeAll as jest.Mock).mockReturnValue(of([]));
    (budgetRepository.observeAllActive as jest.Mock).mockReturnValue(of([]));
    (plannedPaymentRepository.observeAll as jest.Mock).mockReturnValue(of([]));
    (plannedPaymentRepository.observeActive as jest.Mock).mockReturnValue(of([]));
    (journalRepository.observeStatusMeta as jest.Mock).mockReturnValue(of([]));
    (journalRepository.observePlannedInRange as jest.Mock).mockReturnValue(of([]));
    (transactionRepository.observeByDateRange as jest.Mock).mockImplementation(() => of([]));
    (transactionRepository.observeActiveCount as jest.Mock).mockReturnValue(of(0));
    (transactionRepository.findByAccountsAndDateRange as jest.Mock).mockResolvedValue([]);
    (transactionRepository.findByJournals as jest.Mock).mockResolvedValue([]);
    (transactionRawRepository.getRecurringPatternsRaw as jest.Mock).mockResolvedValue([]);
    (transactionRawRepository.getDailyDeltasGroupedRaw as jest.Mock).mockResolvedValue([]);
    (transactionRawRepository.getLatestBalancesRaw as jest.Mock).mockResolvedValue(new Map());
    (exchangeRateService.fetchRatesForBase as jest.Mock).mockResolvedValue({});
    (exchangeRateService.getRateSafe as jest.Mock).mockReturnValue(1);
    (budgetReadService.observeBudgetUsage as jest.Mock).mockReturnValue(
      of({ remaining: 0, spent: 0 }),
    );
    (balanceService.getAccountBalances as jest.Mock).mockResolvedValue([]);
    (workplaceRepository.observeById as jest.Mock).mockReturnValue(
      of({ defaultCurrencyCode: 'USD' }),
    );
    (cashFlowSimulationService.simulate as jest.Mock).mockResolvedValue({
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
    });
  });

  describe('observeSafeToSpend', () => {
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

      (accountRepository.observeByType as jest.Mock).mockImplementation((_workplaceId, type) => {
        if (type === AccountType.ASSET) return of(mockAssets);
        if (type === AccountType.LIABILITY) return of(mockLiabilities);
        return of([]);
      });
      (accountRepository.observeAll as jest.Mock).mockReturnValue(
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

      safeToSpendReadModel.observeSafeToSpend('test-wp' as WorkplaceId, 'USD').subscribe(result => {
        expect(result.totalLiquidAssets).toBe(5000);
        expect(result.summary.safeToSpend).toBe(4000);
        done();
      });
    });

    it('should generate a new observable when currency changes', done => {
      const mockAssets = [
        { id: 'a1', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.CASH },
      ];
      (accountRepository.observeByType as jest.Mock).mockReturnValue(of(mockAssets));
      (accountRepository.observeAll as jest.Mock).mockReturnValue(of(mockAssets));
      (balanceService.getAccountBalances as jest.Mock).mockResolvedValue([
        { accountId: 'a1', balance: 5000 },
      ]);

      (cashFlowSimulationService.simulate as jest.Mock).mockImplementation(() =>
        Promise.resolve({
          simulationResult: {
            summary: { safeToSpend: 5000, shortfall: 0, trajectoryMinBalance: 5000 },
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
        }),
      );

      const usdObs = safeToSpendReadModel.observeSafeToSpend('test-wp' as WorkplaceId, 'USD');
      const eurObs = safeToSpendReadModel.observeSafeToSpend('test-wp' as WorkplaceId, 'EUR');

      expect(usdObs).not.toBe(eurObs);

      eurObs.subscribe(result => {
        expect(result.currencyCode).toBe('EUR');
        done();
      });
    });
  });

  describe('forWorkplace', () => {
    it('watchHeadline projects summary fields from the workplace watch', done => {
      const mockAssets = [
        { id: 'a1', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.CASH },
      ];
      (accountRepository.observeAll as jest.Mock).mockReturnValue(of(mockAssets));
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
});
