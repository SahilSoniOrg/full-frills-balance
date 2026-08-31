import Account from '@/src/data/models/Account';
import { AccountType } from '@/src/types/enums';
import { AccountBalance } from '@/src/types/domainReadModels';
import { AccountId } from '@/src/types/ids';
import { balanceHierarchyAggregator } from '../balanceHierarchyAggregator';
import { convertAmount } from '@/src/services/currencyConversion';
import { exchangeRateService } from '@/src/services/exchange-rate-service';

jest.mock('@/src/services/currencyConversion');
jest.mock('@/src/services/exchange-rate-service', () => ({
  exchangeRateService: { fetchRatesForBase: jest.fn() },
}));
jest.mock('@/src/services/WorkplaceService', () => ({
  workplaceService: { getCurrency: jest.fn().mockResolvedValue('INR') },
}));

describe('BalanceHierarchyAggregator category currency', () => {
  it('publishes category balances in the Workplace currency', async () => {
    (exchangeRateService.fetchRatesForBase as jest.Mock).mockResolvedValue({ INR: 0.07 });
    (convertAmount as jest.Mock).mockImplementation(async ({ amount }) => ({
      ok: true,
      amount: amount * 0.07,
    }));

    const account = {
      id: 'category-1',
      accountType: AccountType.EXPENSE,
      parentAccountId: undefined,
      workplaceId: 'workplace-1',
      currencyCode: 'KRW',
      updatedAt: new Date(),
    } as Account;
    const balance: AccountBalance = {
      accountId: 'category-1' as AccountId,
      balance: 100_000,
      directBalance: 100_000,
      currencyCode: 'KRW',
      transactionCount: 1,
      directTransactionCount: 1,
      asOfDate: Date.now(),
      accountType: AccountType.EXPENSE,
      monthlyIncome: 0,
      monthlyExpenses: 100_000,
    };
    const balances = new Map([[account.id, balance]]);

    await balanceHierarchyAggregator.aggregateBalances(
      [account],
      balances,
      new Map([
        ['KRW', 0],
        ['INR', 0],
      ]),
      'INR',
    );

    expect(balance?.currencyCode).toBe('INR');
    expect(balance?.balance).toBeCloseTo(7_000, 8);
    expect(balance?.monthlyExpenses).toBeCloseTo(7_000, 8);
  });
});
