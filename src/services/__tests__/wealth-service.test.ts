import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { balanceService } from '@/src/services/BalanceService';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { wealthService } from '@/src/services/wealth-service';
import dayjs from 'dayjs';

// Mock dependencies
jest.mock('@/src/services/exchange-rate-service');
jest.mock('@/src/data/repositories/AccountRepository');
jest.mock('@/src/data/repositories/TransactionRepository');
jest.mock('@/src/services/BalanceService');
jest.mock('@/src/utils/preferences', () => ({
    preferences: { defaultCurrencyCode: 'USD' }
}));

describe('WealthService', () => {
    const START_DATE = dayjs('2024-01-01').valueOf();
    const END_DATE = dayjs('2024-01-31').valueOf();

    beforeEach(() => {
        jest.clearAllMocks();
        // Default behavior: return amount as is (1:1 rate)
        (exchangeRateService.convert as jest.Mock).mockImplementation((amount, from, to) =>
            Promise.resolve({ convertedAmount: amount, rate: 1 })
        );
    });

    describe('calculateSummary', () => {
        it('should calculate net worth and category totals', async () => {
            const balances = [
                { accountId: '1', accountType: AccountType.ASSET, balance: 1000, currencyCode: 'USD', name: 'A' },
                { accountId: '2', accountType: AccountType.LIABILITY, balance: 500, currencyCode: 'USD', name: 'L' },
                { accountId: '3', accountType: AccountType.EQUITY, balance: 200, currencyCode: 'USD', name: 'E' },
                { accountId: '4', accountType: AccountType.INCOME, balance: 300, currencyCode: 'USD', name: 'I' },
                { accountId: '5', accountType: AccountType.EXPENSE, balance: 100, currencyCode: 'USD', name: 'Exp' },
            ];

            const summary = await wealthService.calculateSummary(balances as any, 'USD');

            expect(summary.totalAssets).toBe(1000);
            expect(summary.totalLiabilities).toBe(500);
            expect(summary.totalEquity).toBe(200);
            expect(summary.totalIncome).toBe(300);
            expect(summary.totalExpense).toBe(100);

            // Net Worth Formula in Service: Assets - Liabilities
            // 1000 - 500 = 500
            expect(summary.netWorth).toBe(500);
        });

        it('should handle currency conversion', async () => {
            // Mock conversion: EUR -> USD (x1.1)
            (exchangeRateService.convert as jest.Mock).mockImplementation((amount, from, to) => {
                if (from === 'EUR' && to === 'USD') {
                    return Promise.resolve({ convertedAmount: amount * 1.1, rate: 1.1 });
                }
                return Promise.resolve({ convertedAmount: amount, rate: 1 });
            });

            const balances = [
                { accountId: '1', accountType: AccountType.ASSET, balance: 100, currencyCode: 'EUR', name: 'Euro Asset' }
            ];

            const summary = await wealthService.calculateSummary(balances as any, 'USD');
            expect(summary.totalAssets).toBeCloseTo(110, 2); // 100 * 1.1
        });
    });

    describe('getNetWorthHistory', () => {
        it('should return empty array if no assets/liabilities', async () => {
            (balanceService.getAccountBalances as jest.Mock).mockResolvedValue([]);
            const result = await wealthService.getNetWorthHistory(START_DATE, END_DATE);
            expect(result).toEqual([]);
        });

        it('should correctly calculating history by rewinding transactions', async () => {
            const mockBalances = [
                { accountId: 'acc1', accountType: AccountType.ASSET, balance: 1000, currencyCode: 'USD' }
            ];
            (balanceService.getAccountBalances as jest.Mock).mockResolvedValue(mockBalances);

            const mockTransactions = [
                {
                    accountId: 'acc1',
                    transactionDate: dayjs('2024-01-15').valueOf(),
                    amount: 1000,
                    transactionType: TransactionType.DEBIT, // Increased asset
                    currencyCode: 'USD'
                }
            ];
            (transactionRepository.findByAccountsAndDateRange as jest.Mock).mockResolvedValue(mockTransactions);

            const MOCK_NOW = dayjs('2024-01-31').valueOf();
            jest.useFakeTimers();
            jest.setSystemTime(MOCK_NOW);

            const history = await wealthService.getNetWorthHistory(START_DATE, END_DATE);

            // Expect Jan 31 to equal current balance (1000)
            const lastEntry = history.find(h => dayjs(h.date).isSame('2024-01-31', 'day'));
            expect(lastEntry?.totalAssets).toBe(1000);

            // Expect Jan 1 to be 0 (before the 1000 income)
            const firstEntry = history.find(h => dayjs(h.date).isSame('2024-01-01', 'day'));
            expect(firstEntry?.totalAssets).toBe(0);

            jest.useRealTimers();
        });
    });
});
