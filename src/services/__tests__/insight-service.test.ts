import { AccountSubcategory, AccountType } from '@/src/data/models/Account';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { balanceService } from '@/src/services/BalanceService';
import { insightService } from '@/src/services/insight-service';
import { of } from 'rxjs';

// Mock dependencies
jest.mock('@/src/data/repositories/AccountRepository');
jest.mock('@/src/data/repositories/BudgetRepository');
jest.mock('@/src/data/repositories/TransactionRepository');
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
        // C-2: insightService now uses observeByDateRange instead of observeActive.
        (transactionRepository.observeByDateRange as jest.Mock).mockImplementation(() => of([]));
        (balanceService.getAccountBalances as jest.Mock).mockResolvedValue([]);
    });

    describe('observeSafeToSpend', () => {
        it('should calculate safe to spend using only liquid assets and liquid liabilities', (done) => {
            const mockAssets = [
                { id: 'a1', accountType: AccountType.ASSET, accountSubcategory: AccountSubcategory.CASH }, // Liquid
                { id: 'a2', accountType: AccountType.ASSET, accountSubcategory: AccountSubcategory.RETIREMENT }, // Not liquid
            ];

            const mockLiabilities = [
                { id: 'l1', accountType: AccountType.LIABILITY, accountSubcategory: AccountSubcategory.CREDIT_CARD }, // Liquid liability
                { id: 'l2', accountType: AccountType.LIABILITY, accountSubcategory: AccountSubcategory.MORTGAGE }, // Not liquid liability
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

    describe('observePatterns', () => {
        it('should group slow leak expenses by subcategory instead of account id', (done) => {
            const mockAccounts = [
                { id: 'acc1', name: 'Groceries 1', accountType: AccountType.EXPENSE, accountSubcategory: AccountSubcategory.FOOD },
                { id: 'acc2', name: 'Groceries 2', accountType: AccountType.EXPENSE, accountSubcategory: AccountSubcategory.FOOD },
            ];

            const now = Date.now();
            const threeDaysAgo = now - (3 * 24 * 60 * 60 * 1000);
            // M-2 guard requires at least 4 weeks of history — put past transactions 5 weeks back
            const fiveWeeksAgo = now - (35 * 24 * 60 * 60 * 1000);

            // History: both accounts spent 60 total, 5 weeks ago (avg ~12/week over 5 weeks)
            // Current week: 50 total (~4x the average) — well above the 1.5x spike multiplier
            const mockTransactions = [
                // Past transactions (Sum = 120, ~5 weeks ago)
                { id: 't1', accountId: 'acc1', amount: 60, transactionDate: fiveWeeksAgo, transactionType: 'DEBIT', currencyCode: 'USD', journalId: 'j1' },
                { id: 't2', accountId: 'acc2', amount: 60, transactionDate: fiveWeeksAgo, transactionType: 'DEBIT', currencyCode: 'USD', journalId: 'j2' },

                // Current week transactions (Sum = 50)
                { id: 't3', accountId: 'acc1', amount: 20, transactionDate: threeDaysAgo, transactionType: 'DEBIT', currencyCode: 'USD', journalId: 'j3' },
                { id: 't4', accountId: 'acc2', amount: 30, transactionDate: threeDaysAgo, transactionType: 'DEBIT', currencyCode: 'USD', journalId: 'j4' },
            ];

            (accountRepository.observeAll as jest.Mock).mockReturnValue(of(mockAccounts));
            // Use mockImplementation to ignore startDate/endDate args from observeByDateRange
            (transactionRepository.observeByDateRange as jest.Mock).mockImplementation(() => of(mockTransactions));

            insightService.observePatterns().subscribe(patterns => {
                expect(patterns).toContainEqual(
                    expect.objectContaining({
                        id: 'leak_FOOD',
                        type: 'slow-leak',
                    })
                );

                const leakPattern = patterns.find(p => p.id === 'leak_FOOD');
                expect(leakPattern?.journalIds).toContain('j3');
                expect(leakPattern?.journalIds).toContain('j4');
                done();
            });
        });

        it('should detect No Emergency Fund pattern', (done) => {
            const mockAccounts = [
                { id: 'a1', accountType: AccountType.ASSET, accountSubcategory: AccountSubcategory.BANK_CHECKING },
                { id: 'a2', accountType: AccountType.ASSET, accountSubcategory: AccountSubcategory.RETIREMENT },
                { id: 'a3', accountType: AccountType.ASSET, accountSubcategory: AccountSubcategory.INVESTMENT },
                { id: 'a4', accountType: AccountType.ASSET, accountSubcategory: AccountSubcategory.INVESTMENT },
            ];

            (accountRepository.observeAll as jest.Mock).mockReturnValue(of(mockAccounts));

            insightService.observePatterns().subscribe(patterns => {
                expect(patterns).toContainEqual(
                    expect.objectContaining({
                        id: 'no_emergency_fund',
                        type: 'lifestyle-drift', // Current mapping
                    })
                );
                done();
            });
        });

        it('should NOT detect No Emergency Fund pattern if they have one', (done) => {
            const mockAccounts = [
                { id: 'a1', accountType: AccountType.ASSET, accountSubcategory: AccountSubcategory.BANK_CHECKING },
                { id: 'a2', accountType: AccountType.ASSET, accountSubcategory: AccountSubcategory.RETIREMENT },
                { id: 'a3', accountType: AccountType.ASSET, accountSubcategory: AccountSubcategory.INVESTMENT },
                { id: 'a4', accountType: AccountType.ASSET, accountSubcategory: AccountSubcategory.EMERGENCY_FUND },
            ];

            (accountRepository.observeAll as jest.Mock).mockReturnValue(of(mockAccounts));

            insightService.observePatterns().subscribe(patterns => {
                const emergencyPattern = patterns.find(p => p.id === 'no_emergency_fund');
                expect(emergencyPattern).toBeUndefined();
                done();
            });
        });
    });
});
