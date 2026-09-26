import Account from '@/src/data/models/Account';
import { convertAmount } from '@/src/services/currencyConversion';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { AccountBalance } from '@/src/types/domainReadModels';
import { AccountType } from '@/src/types/enums';
import { AccountId } from '@/src/types/ids';
import { balanceHierarchyAggregator } from '../balanceHierarchyAggregator';

jest.mock('@/src/services/currencyConversion');
jest.mock('@/src/services/exchange-rate-service', () => ({
  exchangeRateService: { fetchRatesForBase: jest.fn() },
}));
jest.mock('@/src/services/WorkplaceService', () => ({
  workplaceService: { getCurrency: jest.fn().mockResolvedValue('INR') },
}));

function account(id: string, currencyCode: string, parentAccountId?: string): Account {
  return {
    id,
    accountType: AccountType.ASSET,
    parentAccountId,
    workplaceId: 'workplace-1',
    currencyCode,
    updatedAt: new Date('2026-01-01'),
  } as Account;
}

function balance(id: string, amount: number, currencyCode: string): AccountBalance {
  return {
    accountId: id as AccountId,
    balance: amount,
    directBalance: amount,
    currencyCode,
    transactionCount: 1,
    directTransactionCount: 1,
    asOfDate: Date.now(),
    accountType: AccountType.ASSET,
    monthlyIncome: 0,
    monthlyExpenses: 0,
  };
}

describe('BalanceHierarchyAggregator account currency', () => {
  it('keeps a parent total in the account currency by converting children into it', async () => {
    (exchangeRateService.fetchRatesForBase as jest.Mock).mockResolvedValue({});
    (convertAmount as jest.Mock).mockImplementation(
      async ({ amount, fromCurrency, toCurrency }) => {
        if (fromCurrency === 'EUR' && toCurrency === 'USD') {
          return { ok: true, amount: amount * 1.1 };
        }
        if (fromCurrency === toCurrency) return { ok: true, amount };
        return { ok: false, reason: 'missing_rate' };
      },
    );

    const parent = account('parent', 'USD');
    const child = account('child', 'EUR', 'parent');
    const balances = new Map<string, AccountBalance>([
      ['parent', balance('parent', 100, 'USD')],
      ['child', balance('child', 40, 'EUR')],
    ]);

    await balanceHierarchyAggregator.aggregateBalances(
      [parent, child],
      balances,
      new Map([
        ['USD', 2],
        ['EUR', 2],
        ['INR', 2],
      ]),
      'INR',
    );

    expect(balances.get('parent')?.currencyCode).toBe('USD');
    expect(balances.get('parent')?.balance).toBeCloseTo(144, 8);
    expect(balances.get('child')?.currencyCode).toBe('EUR');
    expect(balances.get('child')?.balance).toBeCloseTo(40, 8);
  });
});
