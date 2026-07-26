import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { ReportService } from '@/src/services/report-service';
import dayjs from 'dayjs';
import { WorkplaceId } from '@/src/types/domain';

jest.mock('@/src/data/repositories/AccountRepository');
jest.mock('@/src/data/repositories/TransactionRepository');
jest.mock('@/src/data/repositories/TransactionRawRepository', () => ({
  transactionRawRepository: {
    getAccountDeltasGroupedRaw: jest.fn().mockResolvedValue([]),
    getDailyDeltasGroupedRaw: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock('@/src/services/BalanceService');
jest.mock('@/src/services/exchange-rate-service');
jest.mock('@/src/services/WorkplaceService', () => ({
  workplaceService: {
    getCurrency: jest.fn().mockResolvedValue('USD'),
  },
}));
jest.mock('@/src/utils/preferences', () => ({
  preferences: { defaultCurrencyCode: 'USD' },
}));

function mockIncomeExpenseAccounts() {
  (accountRepository.findByType as jest.Mock).mockImplementation((_wpId: string, type: string) => {
    if (type === AccountType.INCOME)
      return Promise.resolve([
        {
          id: 'salary',
          name: 'Salary',
          accountType: AccountType.INCOME,
          currencyCode: 'USD',
        },
      ]);
    if (type === AccountType.EXPENSE)
      return Promise.resolve([
        {
          id: 'food',
          name: 'Food',
          accountType: AccountType.EXPENSE,
          currencyCode: 'USD',
        },
      ]);
    return Promise.resolve([]);
  });
}

describe('ReportService', () => {
  let service: ReportService;
  const START_DATE = new Date('2024-01-01T00:00:00.000Z').getTime();
  const END_DATE = new Date('2024-01-31T23:59:59.999Z').getTime();

  beforeEach(() => {
    service = new ReportService();
    jest.clearAllMocks();
    (exchangeRateService.getRate as jest.Mock).mockResolvedValue(1);
    (exchangeRateService.fetchRatesForBase as jest.Mock).mockResolvedValue({});
    (transactionRawRepository.getAccountDeltasGroupedRaw as jest.Mock).mockResolvedValue([]);
    (transactionRawRepository.getDailyDeltasGroupedRaw as jest.Mock).mockResolvedValue([]);
  });

  describe('getIncomeVsExpense', () => {
    it('should calculate totals correctly from transaction fallback', async () => {
      mockIncomeExpenseAccounts();

      const mockTransactions = [
        {
          accountId: 'salary',
          amount: 2000,
          transactionType: TransactionType.CREDIT,
          currencyCode: 'USD',
          transactionDate: dayjs(START_DATE).add(1, 'day').valueOf(),
        },
        {
          accountId: 'food',
          amount: 100,
          transactionType: TransactionType.DEBIT,
          currencyCode: 'USD',
          transactionDate: dayjs(START_DATE).add(1, 'day').valueOf(),
        },
      ];
      (transactionRepository.findByAccountsAndDateRange as jest.Mock).mockResolvedValue(
        mockTransactions,
      );

      const result = await service.getIncomeVsExpense('wp-1' as WorkplaceId, START_DATE, END_DATE);

      expect(result.income).toBe(2000);
      expect(result.expense).toBe(100);
    });
  });

  describe('getReportSnapshot', () => {
    it('should return all report projections from one transaction fetch', async () => {
      mockIncomeExpenseAccounts();

      const mockTransactions = [
        {
          accountId: 'salary',
          amount: 2000,
          transactionType: TransactionType.CREDIT,
          currencyCode: 'USD',
          transactionDate: dayjs(START_DATE).add(1, 'day').valueOf(),
        },
        {
          accountId: 'food',
          amount: 100,
          transactionType: TransactionType.DEBIT,
          currencyCode: 'USD',
          transactionDate: dayjs(START_DATE).add(1, 'day').valueOf(),
        },
      ];
      (transactionRepository.findByAccountsAndDateRange as jest.Mock).mockResolvedValue(
        mockTransactions,
      );

      const result = await service.getReportSnapshot('wp-1' as WorkplaceId, START_DATE, END_DATE);

      expect(result.incomeVsExpense).toEqual({ income: 2000, expense: 100 });
      expect(result.expenseBreakdown[0].accountName).toBe('Food');
      expect(result.incomeBreakdown[0].accountName).toBe('Salary');
      expect(result.incomeVsExpenseHistory.length).toBeGreaterThan(0);
      expect(result.dailyIncomeVsExpense.length).toBeGreaterThan(0);

      expect(transactionRepository.findByAccountsAndDateRange).toHaveBeenCalledTimes(1);
    });

    it('excludes negative net expense accounts from breakdown percentages', async () => {
      (accountRepository.findByType as jest.Mock).mockImplementation((_wpId, type) => {
        if (type === AccountType.EXPENSE) {
          return Promise.resolve([
            { id: 'food', name: 'Food', currencyCode: 'USD', accountSubtype: 'food' },
            { id: 'refunds', name: 'Refunds', currencyCode: 'USD', accountSubtype: 'other' },
          ]);
        }
        return Promise.resolve([]);
      });

      const mockTransactions = [
        {
          accountId: 'food',
          amount: 100,
          transactionType: TransactionType.DEBIT,
          currencyCode: 'USD',
          transactionDate: START_DATE,
        },
        {
          accountId: 'refunds',
          amount: 50,
          transactionType: TransactionType.CREDIT,
          currencyCode: 'USD',
          transactionDate: START_DATE,
        },
      ];
      (transactionRepository.findByAccountsAndDateRange as jest.Mock).mockResolvedValue(
        mockTransactions,
      );

      const result = await service.getReportSnapshot('wp-1' as WorkplaceId, START_DATE, END_DATE);

      expect(result.expenseBreakdown).toHaveLength(1);
      expect(result.expenseBreakdown[0].accountName).toBe('Food');
      expect(result.expenseBreakdown[0].percentage).toBe(100);
    });

    it('matches getIncomeVsExpense when SQL account aggregates are present', async () => {
      mockIncomeExpenseAccounts();
      (transactionRawRepository.getAccountDeltasGroupedRaw as jest.Mock).mockResolvedValue([
        { accountId: 'salary', currencyCode: 'USD', delta: 2000 },
        { accountId: 'food', currencyCode: 'USD', delta: 100 },
      ]);
      (transactionRawRepository.getDailyDeltasGroupedRaw as jest.Mock).mockResolvedValue([
        {
          dayStart: dayjs(START_DATE).add(1, 'day').startOf('day').valueOf(),
          currencyCode: 'USD',
          accountType: AccountType.INCOME,
          delta: 2000,
        },
        {
          dayStart: dayjs(START_DATE).add(1, 'day').startOf('day').valueOf(),
          currencyCode: 'USD',
          accountType: AccountType.EXPENSE,
          delta: 100,
        },
      ]);
      (transactionRepository.findByAccountsAndDateRange as jest.Mock).mockResolvedValue([]);

      const [totals, snapshot] = await Promise.all([
        service.getIncomeVsExpense('wp-1' as WorkplaceId, START_DATE, END_DATE),
        service.getReportSnapshot('wp-1' as WorkplaceId, START_DATE, END_DATE),
      ]);

      expect(snapshot.incomeVsExpense).toEqual(totals);
      expect(totals).toEqual({ income: 2000, expense: 100 });
    });

    it('bucketed history reflects daily SQL aggregates', async () => {
      mockIncomeExpenseAccounts();
      (transactionRawRepository.getDailyDeltasGroupedRaw as jest.Mock).mockResolvedValue([
        {
          dayStart: dayjs(START_DATE).add(1, 'day').startOf('day').valueOf(),
          currencyCode: 'USD',
          accountType: AccountType.INCOME,
          delta: 2000,
        },
        {
          dayStart: dayjs(START_DATE).add(1, 'day').startOf('day').valueOf(),
          currencyCode: 'USD',
          accountType: AccountType.EXPENSE,
          delta: 50,
        },
        {
          dayStart: dayjs(START_DATE).add(2, 'day').startOf('day').valueOf(),
          currencyCode: 'USD',
          accountType: AccountType.EXPENSE,
          delta: 100,
        },
      ]);
      (transactionRepository.findByAccountsAndDateRange as jest.Mock).mockResolvedValue([]);

      const result = await service.getReportSnapshot('wp-1' as WorkplaceId, START_DATE, END_DATE);

      const day1 = result.incomeVsExpenseHistory.find(
        r => r.period === dayjs(START_DATE).add(1, 'day').format('DD MMM'),
      );
      expect(day1?.income).toBe(2000);
      expect(day1?.expense).toBe(50);

      const day2 = result.incomeVsExpenseHistory.find(
        r => r.period === dayjs(START_DATE).add(2, 'day').format('DD MMM'),
      );
      expect(day2?.expense).toBe(100);
    });
  });
});
