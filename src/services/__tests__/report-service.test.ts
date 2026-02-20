import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
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
        (exchangeRateService.convert as jest.Mock).mockImplementation((amount, _from, _to) =>
            Promise.resolve({ convertedAmount: amount, rate: 1 })
        );
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
            expect(result[1].accountName).toBe('Food');
            expect(result[1].amount).toBe(75);
        });

        it('should exclude negative balances from percentage calculation total', async () => {
            const mockAccounts = [
                { id: 'food', name: 'Food', currencyCode: 'USD' },
                { id: 'refunds', name: 'Refunds', currencyCode: 'USD' }
            ];
            (accountRepository.findByType as jest.Mock).mockResolvedValue(mockAccounts);

            const mockTransactions = [
                { accountId: 'food', amount: 100, transactionType: TransactionType.DEBIT, currencyCode: 'USD' },
                { accountId: 'refunds', amount: 50, transactionType: TransactionType.CREDIT, currencyCode: 'USD' }, // Net -50 expense (refund)
            ];
            (transactionRepository.findByAccountsAndDateRange as jest.Mock).mockResolvedValue(mockTransactions);

            const result = await service.getExpenseBreakdown(START_DATE, END_DATE);

            // "Refunds" account has net -50, so it should be excluded from the list entirely
            expect(result).toHaveLength(1);
            expect(result[0].accountName).toBe('Food');
            expect(result[0].amount).toBe(100);

            // Total positive expense is 100. Food is 100. Percentage should be 100%.
            // If we included the -50 in the total, total would be 50, and percentage would be 200%.
            expect(result[0].percentage).toBe(100);
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

    describe('getIncomeBreakdown', () => {
        it('should aggregate income by account', async () => {
            const mockAccounts = [
                { id: 'salary', name: 'Salary', currencyCode: 'USD' },
                { id: 'bonus', name: 'Bonus', currencyCode: 'USD' }
            ];
            (accountRepository.findByType as jest.Mock).mockResolvedValue(mockAccounts);

            const mockTransactions = [
                { accountId: 'salary', amount: 5000, transactionType: TransactionType.CREDIT, currencyCode: 'USD' },
                { accountId: 'bonus', amount: 1000, transactionType: TransactionType.CREDIT, currencyCode: 'USD' },
            ];
            (transactionRepository.findByAccountsAndDateRange as jest.Mock).mockResolvedValue(mockTransactions);

            const result = await service.getIncomeBreakdown(START_DATE, END_DATE);

            expect(result).toHaveLength(2);
            expect(result[0].accountName).toBe('Salary');
            expect(result[0].amount).toBe(5000);
            expect(result[1].accountName).toBe('Bonus');
            expect(result[1].amount).toBe(1000);
        });
    });

    describe('getIncomeVsExpenseHistory', () => {
        it('should return bucketed history', async () => {
            (accountRepository.findByType as jest.Mock).mockImplementation((type) => {
                if (type === AccountType.INCOME) return Promise.resolve([{ id: 'salary', accountType: AccountType.INCOME }]);
                if (type === AccountType.EXPENSE) return Promise.resolve([{ id: 'food', accountType: AccountType.EXPENSE }]);
                return Promise.resolve([]);
            });

            // Transactions across different days
            const mockTransactions = [
                {
                    accountId: 'salary',
                    amount: 2000,
                    transactionType: TransactionType.CREDIT,
                    currencyCode: 'USD',
                    transactionDate: dayjs(START_DATE).add(1, 'day').valueOf()
                },
                {
                    accountId: 'food',
                    amount: 50,
                    transactionType: TransactionType.DEBIT,
                    currencyCode: 'USD',
                    transactionDate: dayjs(START_DATE).add(1, 'day').valueOf()
                },
                {
                    accountId: 'food',
                    amount: 100,
                    transactionType: TransactionType.DEBIT,
                    currencyCode: 'USD',
                    transactionDate: dayjs(START_DATE).add(2, 'day').valueOf()
                },
            ];
            (transactionRepository.findByAccountsAndDateRange as jest.Mock).mockResolvedValue(mockTransactions);

            const result = await service.getIncomeVsExpenseHistory(START_DATE, END_DATE);

            expect(result.length).toBeGreaterThan(0);

            // Check first day with data
            const day1 = result.find(r => r.period === dayjs(START_DATE).add(1, 'day').format('DD MMM'));
            expect(day1).toBeDefined();
            expect(day1?.income).toBe(2000);
            expect(day1?.expense).toBe(50);
            expect(day1?.startDate).toBe(dayjs(START_DATE).add(1, 'day').startOf('day').valueOf());
            expect(day1?.endDate).toBe(dayjs(START_DATE).add(1, 'day').endOf('day').valueOf());

            // Check second day with data
            const day2 = result.find(r => r.period === dayjs(START_DATE).add(2, 'day').format('DD MMM'));
            expect(day2).toBeDefined();
            expect(day2?.income).toBe(0);
            expect(day2?.expense).toBe(100);
            expect(day2?.startDate).toBe(dayjs(START_DATE).add(2, 'day').startOf('day').valueOf());
            expect(day2?.endDate).toBe(dayjs(START_DATE).add(2, 'day').endOf('day').valueOf());
        });

        it('should clamp first and last monthly buckets to the selected range', async () => {
            const customStart = dayjs('2024-01-15').startOf('day').valueOf();
            const customEnd = dayjs('2024-04-10').endOf('day').valueOf();

            (accountRepository.findByType as jest.Mock).mockImplementation((type) => {
                if (type === AccountType.INCOME) return Promise.resolve([{ id: 'salary', accountType: AccountType.INCOME }]);
                if (type === AccountType.EXPENSE) return Promise.resolve([{ id: 'food', accountType: AccountType.EXPENSE }]);
                return Promise.resolve([]);
            });
            (transactionRepository.findByAccountsAndDateRange as jest.Mock).mockResolvedValue([]);

            const result = await service.getIncomeVsExpenseHistory(customStart, customEnd);

            expect(result.length).toBeGreaterThan(0);
            expect(result[0].startDate).toBe(customStart);
            expect(result[result.length - 1].endDate).toBe(customEnd);
        });
    });

    describe('getReportSnapshot', () => {
        it('should return all report projections from one transaction fetch', async () => {
            (accountRepository.findByType as jest.Mock).mockImplementation((type) => {
                if (type === AccountType.INCOME) return Promise.resolve([{ id: 'salary', name: 'Salary', accountType: AccountType.INCOME, currencyCode: 'USD' }]);
                if (type === AccountType.EXPENSE) return Promise.resolve([{ id: 'food', name: 'Food', accountType: AccountType.EXPENSE, currencyCode: 'USD' }]);
                return Promise.resolve([]);
            });

            const mockTransactions = [
                {
                    accountId: 'salary',
                    amount: 2000,
                    transactionType: TransactionType.CREDIT,
                    currencyCode: 'USD',
                    transactionDate: dayjs(START_DATE).add(1, 'day').valueOf()
                },
                {
                    accountId: 'food',
                    amount: 100,
                    transactionType: TransactionType.DEBIT,
                    currencyCode: 'USD',
                    transactionDate: dayjs(START_DATE).add(1, 'day').valueOf()
                },
            ];
            (transactionRepository.findByAccountsAndDateRange as jest.Mock).mockResolvedValue(mockTransactions);

            const result = await service.getReportSnapshot(START_DATE, END_DATE);

            expect(result.incomeVsExpense).toEqual({ income: 2000, expense: 100 });
            expect(result.expenseBreakdown[0].accountName).toBe('Food');
            expect(result.incomeBreakdown[0].accountName).toBe('Salary');
            expect(result.incomeVsExpenseHistory.length).toBeGreaterThan(0);
            expect(result.dailyIncomeVsExpense.length).toBeGreaterThan(0);

            expect(transactionRepository.findByAccountsAndDateRange).toHaveBeenCalledTimes(1);
        });
    });
});
