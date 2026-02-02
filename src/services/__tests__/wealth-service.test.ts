import { AccountType } from '@/src/data/models/Account';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { wealthService } from '@/src/services/wealth-service';

// Mock dependencies
jest.mock('@/src/services/exchange-rate-service');

describe('WealthService', () => {
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

            // Net Worth Formula in Service: (Assets + Income + Equity) - (Liabilities + Expenses)
            // (1000 + 300 + 200) - (500 + 100) = 1500 - 600 = 900
            expect(summary.netWorth).toBe(900);
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
});
