import { AccountSubtype, AccountType } from '@/src/types/enums';
import {
  ACCOUNT_KINDS,
  CATEGORY_KINDS,
  DEFAULT_ACCOUNT_KIND,
  getAccountCarouselKinds,
  resolveAccountKindPresentation,
  suggestAccountKind,
} from '../accountKinds';

describe('account kind definitions', () => {
  it('lists the six kinds in carousel order with the bank default', () => {
    expect(ACCOUNT_KINDS.map(({ key }) => key)).toEqual([
      'cash',
      'wallet',
      'bank',
      'savings',
      'credit_card',
      'loan',
    ]);
    expect(DEFAULT_ACCOUNT_KIND.key).toBe('bank');
    expect(
      ACCOUNT_KINDS.filter(kind => kind.type === AccountType.ASSET).every(
        kind => kind.caption === 'Money you have',
      ),
    ).toBe(true);
    expect(
      ACCOUNT_KINDS.filter(kind => kind.type === AccountType.LIABILITY).every(
        kind => kind.caption === 'Money you owe',
      ),
    ).toBe(true);
  });
});

describe('suggestAccountKind', () => {
  it.each([
    ['Card', AccountType.LIABILITY, AccountSubtype.CREDIT_CARD],
    ['credit account', AccountType.LIABILITY, AccountSubtype.CREDIT_CARD],
    ['Loan', AccountType.LIABILITY, AccountSubtype.LOAN],
    ['EMI', AccountType.LIABILITY, AccountSubtype.LOAN],
    ['Mortgage', AccountType.LIABILITY, AccountSubtype.MORTGAGE],
    ['Savings', AccountType.ASSET, AccountSubtype.BANK_SAVINGS],
    ['FD', AccountType.ASSET, AccountSubtype.FIXED_DEPOSIT],
    ['deposit', AccountType.ASSET, AccountSubtype.FIXED_DEPOSIT],
    ['Cash', AccountType.ASSET, AccountSubtype.CASH],
    ['Wallet', AccountType.ASSET, AccountSubtype.WALLET],
    ['Paytm', AccountType.ASSET, AccountSubtype.WALLET],
    ['UPI', AccountType.ASSET, AccountSubtype.WALLET],
    ['PhonePe', AccountType.ASSET, AccountSubtype.WALLET],
    ['GPay', AccountType.ASSET, AccountSubtype.WALLET],
  ])('maps %s', (name, type, subtype) => {
    expect(suggestAccountKind(name)).toEqual({ type, subtype });
  });

  it('matches whole words without case sensitivity', () => {
    expect(suggestAccountKind('My CREDIT card')).toEqual({
      type: AccountType.LIABILITY,
      subtype: AccountSubtype.CREDIT_CARD,
    });
    expect(suggestAccountKind('scarduino')).toBeNull();
    expect(suggestAccountKind('walletable')).toBeNull();
    expect(suggestAccountKind('ordinary account')).toBeNull();
  });

  it('returns null when suggestion matches the current kind', () => {
    expect(
      suggestAccountKind('Savings', {
        type: AccountType.ASSET,
        subtype: AccountSubtype.BANK_SAVINGS,
      }),
    ).toBeNull();
    expect(
      suggestAccountKind('Savings', { type: AccountType.ASSET, subtype: AccountSubtype.CASH }),
    ).toEqual({ type: AccountType.ASSET, subtype: AccountSubtype.BANK_SAVINGS });
  });
});

describe('account kind presentation', () => {
  it.each([
    [AccountType.ASSET, AccountSubtype.BANK_CHECKING, 'Add bank account'],
    [AccountType.LIABILITY, AccountSubtype.CREDIT_CARD, 'Add credit card'],
    [AccountType.LIABILITY, AccountSubtype.LOAN, 'Add loan'],
  ])('labels the %s/%s action', (type, subtype, expected) => {
    expect(resolveAccountKindPresentation(type, subtype, false).submitLabel).toBe(expected);
  });
  it('uses the edit label in edit mode', () =>
    expect(
      resolveAccountKindPresentation(AccountType.ASSET, AccountSubtype.CASH, true).submitLabel,
    ).toBe('Save Changes'));
});

describe('nonstandard carousel kinds', () => {
  it('places a selected asset after the asset group', () => {
    expect(
      getAccountCarouselKinds(AccountType.ASSET, AccountSubtype.FIXED_DEPOSIT).map(
        kind => kind.key,
      ),
    ).toEqual(['cash', 'wallet', 'bank', 'savings', 'asset_fixed_deposit', 'credit_card', 'loan']);
  });
  it('places a selected liability after the liability group without duplicates', () => {
    const kinds = getAccountCarouselKinds(AccountType.LIABILITY, AccountSubtype.MORTGAGE);
    expect(kinds.map(kind => kind.key)).toEqual([
      'cash',
      'wallet',
      'bank',
      'savings',
      'credit_card',
      'loan',
      'liability_mortgage',
    ]);
    expect(getAccountCarouselKinds(AccountType.LIABILITY, AccountSubtype.CREDIT_CARD)).toHaveLength(
      6,
    );
  });
  it('keeps the category carousel separate from financial accounts and equity', () => {
    expect(getAccountCarouselKinds(AccountType.EXPENSE, AccountSubtype.FOOD)).toEqual(
      CATEGORY_KINDS,
    );
    expect(getAccountCarouselKinds(AccountType.INCOME, AccountSubtype.SALARY)).toEqual(
      CATEGORY_KINDS,
    );
    expect(
      CATEGORY_KINDS.every(
        kind => kind.type === AccountType.EXPENSE || kind.type === AccountType.INCOME,
      ),
    ).toBe(true);
    expect(new Set(CATEGORY_KINDS.map(kind => kind.key)).size).toBe(CATEGORY_KINDS.length);
    expect(
      CATEGORY_KINDS.filter(kind => kind.subtype === AccountSubtype.TAX).map(kind => kind.key),
    ).toEqual(['expense_tax', 'income_tax']);
    expect(getAccountCarouselKinds(AccountType.EQUITY, AccountSubtype.OPENING_BALANCE)).toEqual([]);
  });
  it('uses type-specific keys for the subtype shared by assets and liabilities', () => {
    expect(getAccountCarouselKinds(AccountType.ASSET, AccountSubtype.OTHER)[4].key).toBe(
      'asset_other',
    );
    expect(getAccountCarouselKinds(AccountType.LIABILITY, AccountSubtype.OTHER)[6].key).toBe(
      'liability_other',
    );
  });
});
