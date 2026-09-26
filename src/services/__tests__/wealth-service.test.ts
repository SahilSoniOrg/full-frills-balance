import { AccountType, TransactionType } from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';

import { accountQueryRepository } from '@/src/data/repositories/account';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { balanceReadService } from '@/src/services/balance/balanceReadService';
import { convertAmount } from '@/src/services/currencyConversion';
import { selectBalancesForWealthSummary, wealthService } from '@/src/services/wealth-service';
import dayjs from 'dayjs';

// Mock dependencies
jest.mock('@/src/services/currencyConversion');
jest.mock('@/src/data/repositories/account');
jest.mock('@/src/data/repositories/TransactionRawRepository');
jest.mock('@/src/data/repositories/transaction');
jest.mock('@/src/services/balance/balanceReadService');
jest.mock('@/src/services/WorkplaceService', () => ({
  workplaceService: {
    getDefaultCurrency: jest.fn().mockResolvedValue('USD'),
    getCurrency: jest.fn().mockResolvedValue('USD'),
  },
}));
jest.mock('@/src/services/preferences', () => ({
  preferences: { defaultCurrencyCode: 'USD' },
}));

describe('WealthService', () => {
  const START_DATE = dayjs('2024-01-01').valueOf();
  const END_DATE = dayjs('2024-01-31').valueOf();

  beforeEach(() => {
    jest.clearAllMocks();
    (convertAmount as jest.Mock).mockImplementation(async ({ amount }) => ({
      ok: true,
      amount,
    }));
    (transactionRawRepository.getDailyDeltasGroupedRaw as jest.Mock).mockResolvedValue([]);
    (accountQueryRepository.findAll as jest.Mock).mockResolvedValue([]);
  });

  describe('calculateSummary', () => {
    it('should calculate net worth and category totals', async () => {
      const balances = [
        {
          accountId: '1',
          accountType: AccountType.ASSET,
          balance: 1000,
          currencyCode: 'USD',
          name: 'A',
        },
        {
          accountId: '2',
          accountType: AccountType.LIABILITY,
          balance: 500,
          currencyCode: 'USD',
          name: 'L',
        },
        {
          accountId: '3',
          accountType: AccountType.EQUITY,
          balance: 200,
          currencyCode: 'USD',
          name: 'E',
        },
        {
          accountId: '4',
          accountType: AccountType.INCOME,
          balance: 300,
          currencyCode: 'USD',
          name: 'I',
        },
        {
          accountId: '5',
          accountType: AccountType.EXPENSE,
          balance: 100,
          currencyCode: 'USD',
          name: 'Exp',
        },
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
      (convertAmount as jest.Mock).mockImplementation(
        async ({ amount, fromCurrency, toCurrency }) => {
          if (fromCurrency === 'EUR' && toCurrency === 'USD') {
            return { ok: true, amount: amount * 1.1 };
          }
          return { ok: true, amount };
        },
      );

      const balances = [
        {
          accountId: '1',
          accountType: AccountType.ASSET,
          balance: 100,
          currencyCode: 'EUR',
          name: 'Euro Asset',
        },
      ];

      const summary = await wealthService.calculateSummary(balances as any, 'USD');
      expect(summary.totalAssets).toBeCloseTo(110, 2); // 100 * 1.1
    });

    it('converts each account direct balance from that account currency', async () => {
      (convertAmount as jest.Mock).mockImplementation(
        async ({ amount, fromCurrency, toCurrency }) => {
          if (fromCurrency === 'HKD' && toCurrency === 'INR') {
            return { ok: true, amount: amount * 11.5348 };
          }
          if (fromCurrency === 'EUR' && toCurrency === 'INR') {
            return { ok: true, amount: amount * 90 };
          }
          return { ok: true, amount };
        },
      );

      const selected = selectBalancesForWealthSummary(
        [
          {
            accountId: 'parent',
            accountType: AccountType.ASSET,
            balance: 500.76,
            directBalance: 500.76,
            currencyCode: 'INR',
          },
          {
            accountId: 'child',
            accountType: AccountType.ASSET,
            balance: 40,
            directBalance: 40,
            currencyCode: 'EUR',
          },
        ] as any,
        new Map([
          ['parent', 'HKD'],
          ['child', 'EUR'],
        ]),
        new Set(['parent']),
      );

      const summary = await wealthService.calculateSummary(selected, 'INR');
      expect(summary.netWorth).toBeCloseTo(500.76 * 11.5348 + 40 * 90, 2);
    });
  });

  describe('getNetWorthHistory', () => {
    it('omits history values whose currency conversion is unavailable', async () => {
      const mockBalances = [
        { accountId: 'acc1', accountType: AccountType.ASSET, balance: 1000, currencyCode: 'EUR' },
      ];
      (balanceReadService.getAccountBalances as jest.Mock).mockResolvedValue(mockBalances);
      (transactionQueryRepository.findByAccountsAndDateRange as jest.Mock).mockResolvedValue([]);
      (convertAmount as jest.Mock).mockResolvedValue({ ok: false, reason: 'missing_rate' });

      const history = await wealthService.getNetWorthHistory(
        'workplace-1' as WorkplaceId,
        START_DATE,
        END_DATE,
      );

      expect(history.at(-1)).toMatchObject({
        totalAssets: 0,
        totalLiabilities: 0,
        netWorth: 0,
      });
    });

    it('should return empty array if no assets/liabilities', async () => {
      (balanceReadService.getAccountBalances as jest.Mock).mockResolvedValue([]);
      const result = await wealthService.getNetWorthHistory(
        'workplace-1' as WorkplaceId,
        START_DATE,
        END_DATE,
      );
      expect(result).toEqual([]);
    });

    it('should correctly calculating history by rewinding transactions', async () => {
      const mockBalances = [
        { accountId: 'acc1', accountType: AccountType.ASSET, balance: 1000, currencyCode: 'USD' },
      ];
      (balanceReadService.getAccountBalances as jest.Mock).mockResolvedValue(mockBalances);

      const mockTransactions = [
        {
          accountId: 'acc1',
          transactionDate: dayjs('2024-01-15').valueOf(),
          amount: 1000,
          transactionType: TransactionType.DEBIT, // Increased asset
          currencyCode: 'USD',
        },
      ];
      (transactionQueryRepository.findByAccountsAndDateRange as jest.Mock).mockResolvedValue(
        mockTransactions,
      );

      const MOCK_NOW = dayjs('2024-01-31').valueOf();
      jest.useFakeTimers();
      jest.setSystemTime(MOCK_NOW);

      const history = await wealthService.getNetWorthHistory(
        'workplace-1' as WorkplaceId,
        START_DATE,
        END_DATE,
      );

      // Expect Jan 31 to equal current balance (1000)
      const lastEntry = history.find(h => dayjs(h.date).isSame('2024-01-31', 'day'));
      expect(lastEntry?.totalAssets).toBe(1000);

      // Expect Jan 1 to be 0 (before the 1000 income)
      const firstEntry = history.find(h => dayjs(h.date).isSame('2024-01-01', 'day'));
      expect(firstEntry?.totalAssets).toBe(0);

      jest.useRealTimers();
    });

    it('counts a parent direct balance once and does not add the rolled-up total again', async () => {
      const mockAccounts = [
        {
          id: 'parent1',
          name: 'Parent',
          accountType: AccountType.ASSET,
          parentAccountId: undefined,
          currencyCode: 'USD',
        },
        {
          id: 'child1',
          name: 'Child',
          accountType: AccountType.ASSET,
          parentAccountId: 'parent1',
          currencyCode: 'USD',
        },
      ];
      (accountQueryRepository.findAll as jest.Mock).mockResolvedValue(mockAccounts);

      const mockBalances = [
        {
          accountId: 'parent1',
          accountType: AccountType.ASSET,
          balance: 1500,
          directBalance: 0,
          currencyCode: 'USD',
        },
        {
          accountId: 'child1',
          accountType: AccountType.ASSET,
          balance: 1500,
          directBalance: 1500,
          currencyCode: 'USD',
        },
      ];
      (balanceReadService.getAccountBalances as jest.Mock).mockResolvedValue(mockBalances);
      (transactionQueryRepository.findByAccountsAndDateRange as jest.Mock).mockResolvedValue([]);

      const history = await wealthService.getNetWorthHistory(
        'workplace-1' as WorkplaceId,
        START_DATE,
        END_DATE,
      );

      const lastEntry = history[history.length - 1];
      // Parent direct balance is 0; the 1500 rollup must not be added to the child.
      expect(lastEntry.totalAssets).toBe(1500);
      expect(lastEntry.netWorth).toBe(1500);
    });
  });
});
