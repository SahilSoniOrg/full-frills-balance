import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { balanceService } from '@/src/services/BalanceService';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { ReportService } from '@/src/services/report-service';
import dayjs from 'dayjs';

// Mock dependencies
jest.mock('@/src/data/repositories/AccountRepository');
jest.mock('@/src/data/repositories/TransactionRepository');
jest.mock('@/src/services/BalanceService');
jest.mock('@/src/services/exchange-rate-service');
jest.mock('@/src/utils/preferences', () => ({
    preferences: { defaultCurrencyCode: 'USD' }
}));

describe('ReportService', () => {
    let service: ReportService;
    const START_DATE = dayjs('2024-01-01').valueOf();
    const END_DATE = dayjs('2024-01-31').valueOf();

    beforeEach(() => {
        service = new ReportService();
        jest.clearAllMocks();

        // Default exchange rate behavior: 1:1
        (exchangeRateService.convert as jest.Mock).mockImplementation((amount, from, to) =>
            Promise.resolve({ convertedAmount: amount, rate: 1 })
        );
    });

    describe('getNetWorthHistory', () => {
        it('should return empty array if no assets/liabilities', async () => {
            (balanceService.getAccountBalances as jest.Mock).mockResolvedValue([]);
            const result = await service.getNetWorthHistory(START_DATE, END_DATE);
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

            const history = await service.getNetWorthHistory(START_DATE, END_DATE);

            // Expect Jan 31 to equal current balance (1000)
            const lastEntry = history.find(h => dayjs(h.date).isSame('2024-01-31', 'day'));
            expect(lastEntry?.totalAssets).toBe(1000);

            // Expect Jan 1 to be 0 (before the 1000 income)
            const firstEntry = history.find(h => dayjs(h.date).isSame('2024-01-01', 'day'));
            expect(firstEntry?.totalAssets).toBe(0);

            jest.useRealTimers();
        });
    });

    describe('getExpenseBreakdown', () => {
        it('should aggregate expenses by account', async () => {
            const mockAccounts = [
                { id: 'food', name: 'Food', currencyCode: 'USD' },
                { id: 'rent', name: 'Rent', currencyCode: 'USD' }
            ];
            (accountRepository.findByType as jest.Mock).mockResolvedValue(mockAccounts);

            const mockTransactions = [
                { accountId: 'food', amount: 50, transactionType: TransactionType.DEBIT, currencyCode: 'USD' },
                { accountId: 'food', amount: 25, transactionType: TransactionType.DEBIT, currencyCode: 'USD' },
                { accountId: 'rent', amount: 500, transactionType: TransactionType.DEBIT, currencyCode: 'USD' },
            ];
            (transactionRepository.findByAccountsAndDateRange as jest.Mock).mockResolvedValue(mockTransactions);

            const result = await service.getExpenseBreakdown(START_DATE, END_DATE);

            expect(result).toHaveLength(2);
            expect(result[0].accountName).toBe('Rent');
            expect(result[0].amount).toBe(500);
            expect(result[1].accountName).toBe('Food');
            expect(result[1].amount).toBe(75);
        });
    });

    describe('getIncomeVsExpense', () => {
        it('should calculate totals correctly', async () => {
            (accountRepository.findByType as jest.Mock).mockImplementation((type) => {
                if (type === AccountType.INCOME) return Promise.resolve([{ id: 'salary', accountType: AccountType.INCOME }]);
                if (type === AccountType.EXPENSE) return Promise.resolve([{ id: 'food', accountType: AccountType.EXPENSE }]);
                return Promise.resolve([]);
            });

            const mockTransactions = [
                { accountId: 'salary', amount: 2000, transactionType: TransactionType.CREDIT, currencyCode: 'USD' }, // Income
                { accountId: 'food', amount: 100, transactionType: TransactionType.DEBIT, currencyCode: 'USD' }, // Expense
            ];
            (transactionRepository.findByAccountsAndDateRange as jest.Mock).mockResolvedValue(mockTransactions);

            const result = await service.getIncomeVsExpense(START_DATE, END_DATE);

            expect(result.income).toBe(2000);
            expect(result.expense).toBe(100);
        });
    });
});
