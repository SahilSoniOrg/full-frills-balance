import { AccountSubtype, AccountType } from '@/src/data/models/Account';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { balanceService } from '@/src/services/BalanceService';
import { insightService } from '@/src/services/insight-service';
import { of } from 'rxjs';

// Mock dependencies
jest.mock('@/src/data/repositories/AccountRepository');
jest.mock('@/src/data/repositories/BudgetRepository');
jest.mock('@/src/data/repositories/TransactionRepository');
jest.mock('@/src/data/repositories/TransactionRawRepository');
jest.mock('@/src/data/repositories/PlannedPaymentRepository');
jest.mock('@/src/data/repositories/JournalRepository');
jest.mock('@/src/services/BalanceService');
jest.mock('@/src/services/budget/budgetReadService');
jest.mock('@/src/utils/preferences', () => ({
    preferences: {
        defaultCurrencyCode: 'USD',
        dismissedPatternIds: [],
        dismissPattern: jest.fn(),
        undismissPattern: jest.fn(),
    }
}));

describe('InsightService', () => {
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
        (balanceService.getAccountBalances as jest.Mock).mockResolvedValue([]);
    });

    describe('observeSafeToSpend', () => {
        it('should calculate safe to spend using only liquid assets and liquid liabilities', (done) => {
            const mockAssets = [
                { id: 'a1', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.CASH }, // Liquid
                { id: 'a2', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.RETIREMENT }, // Not liquid
            ];

            const mockLiabilities = [
                { id: 'l1', accountType: AccountType.LIABILITY, accountSubtype: AccountSubtype.CREDIT_CARD }, // Liquid liability
                { id: 'l2', accountType: AccountType.LIABILITY, accountSubtype: AccountSubtype.MORTGAGE }, // Not liquid liability
            ];

            const mockBalances = [
                { accountId: 'a1', balance: 5000, accountType: AccountType.ASSET, currencyCode: 'USD' },
                { accountId: 'a2', balance: 100000, accountType: AccountType.ASSET, currencyCode: 'USD' },
                { accountId: 'l1', balance: -1000, accountType: AccountType.LIABILITY, currencyCode: 'USD' },
                { accountId: 'l2', balance: -200000, accountType: AccountType.LIABILITY, currencyCode: 'USD' },
            ];

            (accountRepository.observeByType as jest.Mock).mockImplementation((type) => {
                if (type === AccountType.ASSET) return of(mockAssets);
                if (type === AccountType.LIABILITY) return of(mockLiabilities);
                return of([]);
            });
            (balanceService.getAccountBalances as jest.Mock).mockResolvedValue(mockBalances);

            insightService.observeSafeToSpend().subscribe(result => {
                // Expected: 
                // Liquid Assets = a1 (5000)
                // Liquid Liabilities = l1 (1000) 
                // Net Cash = 5000 - 1000 = 4000
                expect(result.totalLiquidAssets).toBe(5000);
                expect(result.totalLiabilities).toBe(1000); // Only counts liquid liabilities
                expect(result.safeToSpend).toBe(4000);
                done();
            });
        });
    });
});
