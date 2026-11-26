import type { AccountBalance } from '@/src/types/domainReadModels';
import { AccountType } from '@/src/types/enums';
import { asAccountId } from '@/src/types/ids';
import { computeSelectedAccountsTotal } from '../selectedAccountsTotal';

function balance(
  id: string,
  directBalance: number,
  currencyCode: string,
  accountType: AccountType = AccountType.ASSET,
  rollup = directBalance,
): AccountBalance {
  return {
    accountId: asAccountId(id),
    directBalance,
    balance: rollup,
    currencyCode,
    transactionCount: 0,
    directTransactionCount: 0,
    asOfDate: 0,
    accountType,
    monthlyIncome: 0,
    monthlyExpenses: 0,
  };
}

function sum(
  balances: AccountBalance[],
  selected: string[],
  types?: Partial<Record<string, AccountType>>,
) {
  return computeSelectedAccountsTotal(
    balances.map(({ accountId, currencyCode, accountType }) => ({
      id: accountId,
      currencyCode,
      accountType: types?.[accountId] ?? accountType,
    })),
    new Map(balances.map(item => [item.accountId, item])),
    new Set(selected.map(asAccountId)),
  );
}

describe('computeSelectedAccountsTotal', () => {
  it('returns no totals for an empty selection', () => {
    expect(sum([balance('parent', 50, 'USD')], [])).toEqual({
      amounts: [],
      sections: [],
      incomplete: false,
    });
  });

  it('counts the direct balance of every selected ID without repeating the child rollup', () => {
    const balances = [
      balance('parent', 50, 'USD', AccountType.ASSET, 150),
      balance('child', 100, 'USD'),
    ];

    expect(sum(balances, ['parent']).amounts).toEqual([{ amount: 50, currencyCode: 'USD' }]);
    expect(sum(balances, ['parent', 'child']).amounts).toEqual([
      { amount: 150, currencyCode: 'USD' },
    ]);
  });

  it('marks a total partial when a selected balance is unavailable', () => {
    const account = balance('account', 50, 'USD');
    expect(sum([account], ['account', 'missing'])).toEqual({
      amounts: [{ amount: 50, currencyCode: 'USD' }],
      sections: [
        { accountType: AccountType.ASSET, amounts: [{ amount: 50, currencyCode: 'USD' }] },
      ],
      incomplete: true,
    });
  });

  it('pairs the raw direct balance with the account currency after category normalization', () => {
    const category = balance('category', 100_000, 'INR', AccountType.EXPENSE, 7_000);

    expect(
      computeSelectedAccountsTotal(
        [{ id: category.accountId, currencyCode: 'KRW', accountType: AccountType.EXPENSE }],
        new Map([[category.accountId, category]]),
        new Set([category.accountId]),
      ).amounts,
    ).toEqual([{ amount: 100_000, currencyCode: 'KRW' }]);
  });

  it('keeps the same native currency when another currency is added to the selection', () => {
    const balances = [
      { ...balance('euro', 100, 'EUR'), workplaceBalance: 110 },
      balance('dollar', 50, 'USD'),
    ];

    expect(sum(balances, ['euro']).amounts).toEqual([{ amount: 100, currencyCode: 'EUR' }]);
    expect(sum(balances, ['euro', 'dollar']).amounts).toEqual([
      { amount: 100, currencyCode: 'EUR' },
      { amount: 50, currencyCode: 'USD' },
    ]);
  });

  it('marks incomplete and skips amounts when an account type is unknown', () => {
    const item = balance('mystery', 50, 'USD', AccountType.ASSET);

    expect(
      computeSelectedAccountsTotal(
        [{ id: item.accountId, currencyCode: 'USD', accountType: '' }],
        new Map([[item.accountId, { directBalance: item.directBalance, accountType: '' }]]),
        new Set([item.accountId]),
      ),
    ).toEqual({
      amounts: [],
      sections: [],
      incomplete: true,
    });
  });

  it('splits selected balances into account-type sections', () => {
    const balances = [
      balance('cash', 200, 'USD', AccountType.ASSET),
      balance('card', 80, 'USD', AccountType.LIABILITY),
      balance('loan', 40, 'EUR', AccountType.LIABILITY),
      balance('salary', 10, 'USD', AccountType.INCOME),
    ];

    expect(sum(balances, ['cash', 'card', 'loan', 'salary'])).toEqual({
      amounts: [],
      sections: [
        {
          accountType: AccountType.ASSET,
          amounts: [{ amount: 200, currencyCode: 'USD' }],
        },
        {
          accountType: AccountType.LIABILITY,
          amounts: [
            { amount: 80, currencyCode: 'USD' },
            { amount: 40, currencyCode: 'EUR' },
          ],
        },
        {
          accountType: AccountType.INCOME,
          amounts: [{ amount: 10, currencyCode: 'USD' }],
        },
      ],
      incomplete: false,
    });
  });

  it('deduplicates repeated account rows before summing', () => {
    const cash = balance('cash', 200, 'USD', AccountType.ASSET);
    expect(
      computeSelectedAccountsTotal(
        [
          { id: cash.accountId, currencyCode: 'USD', accountType: AccountType.ASSET },
          { id: cash.accountId, currencyCode: 'USD', accountType: AccountType.ASSET },
        ],
        new Map([[cash.accountId, cash]]),
        new Set([cash.accountId]),
      ),
    ).toEqual({
      amounts: [{ amount: 200, currencyCode: 'USD' }],
      sections: [
        { accountType: AccountType.ASSET, amounts: [{ amount: 200, currencyCode: 'USD' }] },
      ],
      incomplete: false,
    });
  });
});
