import { Money } from '@/src/domain/money/money';
import { TransactionType } from '@/src/types/enums';
import { asAccountId } from '@/src/types/ids';
import {
  evaluateJournalBalance,
  proposeUniqueJournalFxRate,
  toJournalBalanceLineInput,
} from '@/src/domain/accounting/journalBalanceEvaluator';

describe('evaluateJournalBalance', () => {
  it('values each line in journal currency and accepts an exact mixed-currency balance', () => {
    const result = evaluateJournalBalance({
      journalCurrency: 'USD',
      precisionByCurrency: new Map([
        ['EUR', 2],
        ['USD', 2],
      ]),
      lines: [
        {
          id: 'eur-expense',
          accountId: asAccountId('expense'),
          accountCurrency: 'EUR',
          amount: '10.00',
          exchangeRate: '1.2',
          transactionType: TransactionType.DEBIT,
        },
        {
          id: 'usd-bank',
          accountId: asAccountId('bank'),
          accountCurrency: 'USD',
          amount: '12.00',
          exchangeRate: '',
          transactionType: TransactionType.CREDIT,
        },
      ],
    });

    expect(result).toMatchObject({
      isBalanced: true,
      debitTotalMinorUnits: 1200,
      creditTotalMinorUnits: 1200,
      differenceMinorUnits: 0,
      journalTotalAmount: 12,
      lineValues: [
        { id: 'eur-expense', nativeAmount: 10, journalAmount: 12 },
        { id: 'usd-bank', nativeAmount: 12, journalAmount: 12 },
      ],
      issues: [],
    });
  });

  it('accepts a genuine cross-currency rate of one', () => {
    const result = evaluateJournalBalance({
      journalCurrency: 'USD',
      precisionByCurrency: new Map([
        ['EUR', 2],
        ['USD', 2],
      ]),
      lines: [
        {
          id: 'eur-line',
          accountId: asAccountId('eur-account'),
          accountCurrency: 'EUR',
          amount: '25.00',
          exchangeRate: '1',
          transactionType: TransactionType.DEBIT,
        },
        {
          id: 'usd-line',
          accountId: asAccountId('usd-account'),
          accountCurrency: 'USD',
          amount: '25.00',
          exchangeRate: '',
          transactionType: TransactionType.CREDIT,
        },
      ],
    });

    expect(result.isBalanced).toBe(true);
    expect(result.lineValues[0]).toMatchObject({ exchangeRate: 1, journalAmount: 25 });
    expect(result.issues).toEqual([]);
  });

  it('quantizes native and journal values at their own currency precisions', () => {
    const result = evaluateJournalBalance({
      journalCurrency: 'JOD',
      precisionByCurrency: new Map([
        ['JOD', 3],
        ['JPY', 0],
      ]),
      lines: [
        {
          id: 'jpy-line',
          accountId: asAccountId('yen-account'),
          accountCurrency: 'JPY',
          amount: '123.4',
          exchangeRate: '0.005',
          transactionType: TransactionType.DEBIT,
        },
        {
          id: 'jod-line',
          accountId: asAccountId('dinar-account'),
          accountCurrency: 'JOD',
          amount: '0.615',
          exchangeRate: '',
          transactionType: TransactionType.CREDIT,
        },
      ],
    });

    expect(result).toMatchObject({
      isBalanced: true,
      lineValues: [
        { nativeAmount: 123, journalAmount: 0.615 },
        { nativeAmount: 0.615, journalAmount: 0.615 },
      ],
      journalTotalAmount: 0.615,
    });
  });

  it('reports an exact minor-unit difference and treats a missing foreign rate as an issue', () => {
    const result = evaluateJournalBalance({
      journalCurrency: 'USD',
      precisionByCurrency: new Map([
        ['EUR', 2],
        ['USD', 2],
      ]),
      lines: [
        {
          id: 'eur-line',
          accountId: asAccountId('eur-account'),
          accountCurrency: 'EUR',
          amount: '10.00',
          exchangeRate: '1.2',
          transactionType: TransactionType.DEBIT,
        },
        {
          id: 'usd-line',
          accountId: asAccountId('usd-account'),
          accountCurrency: 'USD',
          amount: '12.01',
          exchangeRate: '',
          transactionType: TransactionType.CREDIT,
        },
      ],
    });

    expect(result).toMatchObject({
      isBalanced: false,
      differenceMinorUnits: -1,
      journalTotalAmount: undefined,
      issues: [
        expect.objectContaining({
          code: 'unbalanced',
          message: expect.stringContaining('0.01 USD'),
        }),
      ],
    });

    const missingRate = evaluateJournalBalance({
      journalCurrency: 'USD',
      precisionByCurrency: new Map([
        ['EUR', 2],
        ['USD', 2],
      ]),
      lines: [
        {
          id: 'eur-line',
          accountId: asAccountId('eur-account'),
          accountCurrency: 'EUR',
          amount: '10.00',
          transactionType: TransactionType.DEBIT,
        },
      ],
    });

    expect(missingRate.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'invalid_structure' }),
        expect.objectContaining({ code: 'missing_exchange_rate', lineId: 'eur-line' }),
      ]),
    );
  });
});

describe('proposeUniqueJournalFxRate', () => {
  const precisionByCurrency = new Map([
    ['HKD', 2],
    ['INR', 2],
    ['USD', 2],
  ]);

  it('derives the unique rate from account amounts and balances a debit-side FX line', () => {
    const proposal = proposeUniqueJournalFxRate({
      journalCurrency: 'INR',
      precisionByCurrency,
      lines: [
        {
          id: 'hkd-cash',
          accountId: asAccountId('hkd-account'),
          accountCurrency: 'HKD',
          amount: 500.76,
          exchangeRate: 11.5348,
          transactionType: TransactionType.DEBIT,
        },
        {
          id: 'inr-bank',
          accountId: asAccountId('inr-account'),
          accountCurrency: 'INR',
          amount: 5791.12,
          transactionType: TransactionType.CREDIT,
        },
      ],
    });

    expect(proposal?.transactionId).toBe('hkd-cash');
    expect(proposal?.exchangeRate).toBeCloseTo(5791.12 / 500.76, 12);
    expect(proposal?.evaluation).toMatchObject({
      isBalanced: true,
      debitTotalMinorUnits: 579112,
      creditTotalMinorUnits: 579112,
    });
    expect(proposal?.evaluation.lineValues.find(line => line.id === 'hkd-cash')).toMatchObject({
      nativeAmount: 500.76,
      journalAmount: 5791.12,
    });
  });

  it('derives the unique rate when the foreign line is on the credit side', () => {
    const proposal = proposeUniqueJournalFxRate({
      journalCurrency: 'INR',
      precisionByCurrency,
      lines: [
        {
          id: 'inr-bank',
          accountId: asAccountId('inr-account'),
          accountCurrency: 'INR',
          amount: 5791.12,
          transactionType: TransactionType.DEBIT,
        },
        {
          id: 'hkd-cash',
          accountId: asAccountId('hkd-account'),
          accountCurrency: 'HKD',
          amount: 500.76,
          exchangeRate: 11.5348,
          transactionType: TransactionType.CREDIT,
        },
      ],
    });

    expect(proposal?.transactionId).toBe('hkd-cash');
    expect(proposal?.evaluation.isBalanced).toBe(true);
  });

  it('does not guess when more than one foreign rate can be adjusted', () => {
    const proposal = proposeUniqueJournalFxRate({
      journalCurrency: 'INR',
      precisionByCurrency,
      lines: [
        {
          id: 'hkd-cash',
          accountId: asAccountId('hkd-account'),
          accountCurrency: 'HKD',
          amount: 500.76,
          exchangeRate: 11.5348,
          transactionType: TransactionType.DEBIT,
        },
        {
          id: 'usd-cash',
          accountId: asAccountId('usd-account'),
          accountCurrency: 'USD',
          amount: 2,
          exchangeRate: 90,
          transactionType: TransactionType.DEBIT,
        },
        {
          id: 'inr-bank',
          accountId: asAccountId('inr-account'),
          accountCurrency: 'INR',
          amount: 5971.12,
          transactionType: TransactionType.CREDIT,
        },
      ],
    });

    expect(proposal).toBeUndefined();
  });

  it('does not use FX to repair a same-currency imbalance', () => {
    const proposal = proposeUniqueJournalFxRate({
      journalCurrency: 'USD',
      precisionByCurrency,
      lines: [
        {
          id: 'usd-debit',
          accountId: asAccountId('debit-account'),
          accountCurrency: 'USD',
          amount: 10,
          transactionType: TransactionType.DEBIT,
        },
        {
          id: 'usd-credit',
          accountId: asAccountId('credit-account'),
          accountCurrency: 'USD',
          amount: 9.99,
          transactionType: TransactionType.CREDIT,
        },
      ],
    });

    expect(proposal).toBeUndefined();
  });
});

describe('toJournalBalanceLineInput', () => {
  it('brands account ids and unwraps domain Money amount+currency', () => {
    expect(
      toJournalBalanceLineInput({
        id: 'line-1',
        accountId: 'cash',
        amount: new Money(42.5, 'EUR'),
        transactionType: TransactionType.DEBIT,
      }),
    ).toEqual({
      id: 'line-1',
      accountId: asAccountId('cash'),
      accountCurrency: 'EUR',
      amount: 42.5,
      exchangeRate: undefined,
      transactionType: TransactionType.DEBIT,
    });
  });

  it('rejects Money whose currency disagrees with accountCurrency', () => {
    expect(() =>
      toJournalBalanceLineInput({
        id: 'line-2',
        accountId: 'wallet',
        accountCurrency: 'USD',
        amount: new Money(10, 'EUR'),
        exchangeRate: '1.1',
        transactionType: TransactionType.CREDIT,
      }),
    ).toThrow(/does not match account currency/);
  });

  it('accepts Money when accountCurrency matches', () => {
    expect(
      toJournalBalanceLineInput({
        id: 'line-3',
        accountId: 'wallet',
        accountCurrency: 'EUR',
        amount: new Money(10, 'EUR'),
        transactionType: TransactionType.CREDIT,
      }).accountCurrency,
    ).toBe('EUR');
  });
});

describe('evaluateJournalBalance Money boundary', () => {
  it('rejects mismatched Money currency on the live evaluation path', () => {
    expect(() =>
      evaluateJournalBalance({
        journalCurrency: 'USD',
        precisionByCurrency: new Map([
          ['USD', 2],
          ['EUR', 2],
        ]),
        lines: [
          {
            id: 'bad',
            accountId: 'cash',
            accountCurrency: 'USD',
            amount: new Money(10, 'EUR'),
            transactionType: TransactionType.DEBIT,
          },
          {
            id: 'ok',
            accountId: 'expense',
            accountCurrency: 'USD',
            amount: '10',
            transactionType: TransactionType.CREDIT,
          },
        ],
      }),
    ).toThrow(/does not match account currency/);
  });
});
