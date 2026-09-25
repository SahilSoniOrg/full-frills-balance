import { buildSplitDraftProjection, selectSplitDraftLines } from '../splitDraftProjection';
import { AccountType, TransactionType } from '@/src/types/enums';
import { asAccountId, asTransactionId } from '@/src/types/ids';
import type { JournalEntryLine } from '@/src/types/domainJournal';
import type { AccountFields } from '@/src/types/plainDtos';

function line(overrides: Partial<JournalEntryLine>): JournalEntryLine {
  return {
    id: asTransactionId('line'),
    accountId: asAccountId(''),
    accountName: '',
    accountType: AccountType.ASSET,
    amount: '',
    transactionType: TransactionType.DEBIT,
    notes: '',
    exchangeRate: '',
    ...overrides,
  };
}

function account(id: string, currencyCode: string, accountType = AccountType.ASSET): AccountFields {
  return {
    id: asAccountId(id),
    name: id,
    accountType,
    currencyCode,
  };
}

describe('splitDraftProjection', () => {
  it('keeps source fallback, account metadata, totals, and validation in one projection', () => {
    const lines = [
      line({
        id: asTransactionId('source'),
        amount: '50',
        transactionType: TransactionType.CREDIT,
      }),
      line({
        id: asTransactionId('allocation'),
        accountId: asAccountId('groceries'),
        amount: '50',
      }),
    ];
    const accounts = [account('cash', 'USD'), account('groceries', 'USD', AccountType.EXPENSE)];

    const projection = buildSplitDraftProjection({
      lines,
      accounts,
      workplaceCurrency: 'USD',
      sourceAccountId: asAccountId('cash'),
      precision: 2,
    });

    expect(projection.sourceAccountId).toBe(asAccountId('cash'));
    expect(projection.sourceCurrency).toBe('USD');
    expect(projection.splits[0]).toMatchObject({
      accountId: asAccountId('groceries'),
      accountCurrency: 'USD',
      precision: 2,
    });
    expect(projection.totals).toEqual({ total: 50, allocated: 50, remaining: 0 });
    expect(projection.validation).toEqual({ valid: true });
  });

  it('uses selected account currency metadata and preserves cross-currency validation', () => {
    const projection = buildSplitDraftProjection({
      lines: [
        line({
          id: asTransactionId('source'),
          accountId: asAccountId('inr-wallet'),
          accountCurrency: 'INR',
          amount: '1000',
          exchangeRate: '0.012',
          transactionType: TransactionType.CREDIT,
        }),
        line({
          id: asTransactionId('allocation'),
          accountId: asAccountId('usd-wallet'),
          accountCurrency: 'USD',
          amount: '12',
        }),
      ],
      accounts: [account('inr-wallet', 'INR'), account('usd-wallet', 'USD')],
      workplaceCurrency: 'USD',
      precision: 2,
    });

    expect(projection.sourceCurrency).toBe('INR');
    expect(projection.currencyContext).toMatchObject({
      baseCurrency: 'USD',
      sourceCurrency: 'INR',
      sourceExchangeRate: '0.012',
    });
    expect(projection.validation).toEqual({ valid: true });
    expect(projection.totals.remaining).toBe(0);
  });

  it('uses selected account currencies when stale line metadata makes a same-currency split look balanced', () => {
    const projection = buildSplitDraftProjection({
      lines: [
        line({
          id: asTransactionId('source'),
          accountId: asAccountId('inr-wallet'),
          accountCurrency: 'USD',
          amount: '80',
          exchangeRate: '0.012',
          transactionType: TransactionType.CREDIT,
        }),
        line({
          id: asTransactionId('allocation'),
          accountId: asAccountId('inr-expense'),
          accountCurrency: 'INR',
          amount: '80.46',
          exchangeRate: String(80 / 80.46),
        }),
      ],
      accounts: [account('inr-wallet', 'INR'), account('inr-expense', 'INR', AccountType.EXPENSE)],
      workplaceCurrency: 'USD',
      precision: 2,
    });

    expect(projection.sourceCurrency).toBe('INR');
    expect(projection.splits[0].accountCurrency).toBe('INR');
    expect(projection.totals).toEqual({ total: 80, allocated: 80.83, remaining: -0.83 });
  });

  it('uses registered precision for a custom workplace currency in cross-currency totals', () => {
    const projection = buildSplitDraftProjection({
      lines: [
        line({
          id: asTransactionId('source'),
          accountId: asAccountId('usd-wallet'),
          amount: '0.01',
          exchangeRate: '0.4444',
          transactionType: TransactionType.CREDIT,
        }),
        line({
          id: asTransactionId('allocation'),
          accountId: asAccountId('custom-category'),
          amount: '0.004',
        }),
      ],
      accounts: [
        account('usd-wallet', 'USD'),
        account('custom-category', 'XCU', AccountType.EXPENSE),
      ],
      workplaceCurrency: 'XCU',
      precision: 2,
      precisionByCurrency: new Map([
        ['USD', 2],
        ['XCU', 3],
      ]),
    });

    expect(projection.currencyContext.basePrecision).toBe(3);
    expect(projection.splits[0].precision).toBe(3);
    expect(projection.totals).toEqual({ total: 0.01, allocated: 0.01, remaining: 0 });
    expect(projection.validation).toEqual({ valid: true });
  });

  it('selects exactly one source line and all allocation lines', () => {
    const source = line({ id: asTransactionId('source'), transactionType: TransactionType.CREDIT });
    const allocation = line({
      id: asTransactionId('allocation'),
      transactionType: TransactionType.DEBIT,
    });

    expect(selectSplitDraftLines([allocation, source])).toEqual({
      sourceLine: source,
      destinationLines: [allocation],
    });
  });
});
