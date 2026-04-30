import { AccountSubtype, AccountType } from '@/src/data/models/Account';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { balanceService } from '@/src/services/BalanceService';
import { budgetReadService } from '@/src/services/budget/budgetReadService';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { notificationService } from '@/src/services/notification/NotificationService';
import { cashFlowSimulationService } from '@/src/services/simulation/CashFlowSimulationService';
import { of } from 'rxjs';

// Mock dependencies
jest.mock('@/src/data/repositories/AccountRepository');
jest.mock('@/src/data/repositories/BudgetRepository');
jest.mock('@/src/data/repositories/TransactionRepository');
jest.mock('@/src/data/repositories/TransactionRawRepository');
jest.mock('@/src/data/repositories/PlannedPaymentRepository');
jest.mock('@/src/data/repositories/JournalRepository');
jest.mock('@/src/services/exchange-rate-service');
jest.mock('@/src/services/budget/budgetReadService');
jest.mock('@/src/services/BalanceService');
jest.mock('@/src/services/simulation/CashFlowSimulationService');
jest.mock('@/src/utils/preferences', () => ({
  preferences: {
    defaultCurrencyCode: 'USD',
    dismissedPatternIds: [],
    dismissPattern: jest.fn(),
    undismissPattern: jest.fn(),
    observe: jest.fn(() => of(60)),
    safeToSpendDays: 60,
  },
}));

describe('NotificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default simple mocks
    (accountRepository.observeByType as jest.Mock).mockReturnValue(of([]));
    (accountRepository.observeAll as jest.Mock).mockReturnValue(of([]));
    (budgetRepository.observeAllActive as jest.Mock).mockReturnValue(of([]));
    (plannedPaymentRepository.observeAll as jest.Mock).mockReturnValue(of([]));
    (plannedPaymentRepository.observeActive as jest.Mock).mockReturnValue(of([]));
    (journalRepository.observePlannedForMonth as jest.Mock).mockReturnValue(of([]));
    (journalRepository.observeStatusMeta as jest.Mock).mockReturnValue(of([]));
    (journalRepository.observePlannedInRange as jest.Mock).mockReturnValue(of([]));
    (transactionRepository.observeByDateRange as jest.Mock).mockImplementation(() => of([]));
    (transactionRepository.observeActiveWithColumns as jest.Mock).mockReturnValue(of([]));
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
        { id: 'a1', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.CASH }, // Liquid
        { id: 'a2', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.RETIREMENT }, // Not liquid
      ];

      const mockLiabilities = [
        {
          id: 'l1',
          accountType: AccountType.LIABILITY,
          accountSubtype: AccountSubtype.CREDIT_CARD,
        }, // Liquid liability
        { id: 'l2', accountType: AccountType.LIABILITY, accountSubtype: AccountSubtype.MORTGAGE }, // Not liquid liability
      ];

      (accountRepository.observeByType as jest.Mock).mockImplementation(type => {
        if (type === AccountType.ASSET) return of(mockAssets);
        if (type === AccountType.LIABILITY) return of(mockLiabilities);
        return of([]);
      });
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

      notificationService.observeSafeToSpend().subscribe(result => {
        // Expected:
        // Liquid Assets = a1 (5000)
        // Liquid Liabilities = l1 (1000)
        // Net Cash = 5000 - 1000 = 4000
        expect(result.totalLiquidAssets).toBe(5000);
        expect(result.summary.safeToSpend).toBe(4000);
        done();
      });
    });
  });
});
