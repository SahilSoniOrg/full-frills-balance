import { getCurrencyPrecision } from '@/src/domain/money/currencyPrecision';
import { evaluateJournalBalance } from '@/src/domain/accounting/journalBalanceEvaluator';
import { isJournalBalanced } from '@/src/services/accounting/JournalCalculator';
import { TransactionType } from '@/src/types/enums';
import { asAccountId } from '@/src/types/ids';

const evaluate = (
  journalCurrency: string,
  lines: Array<{
    id: string;
    amount: string | number;
    transactionType: TransactionType;
    accountCurrency?: string;
    exchangeRate?: string | number;
  }>,
) => {
  const currencies = new Set([
    journalCurrency,
    ...lines.map(line => line.accountCurrency ?? journalCurrency),
  ]);
  return evaluateJournalBalance({
    journalCurrency,
    precisionByCurrency: new Map(
      [...currencies].map(currency => [currency, getCurrencyPrecision(currency)]),
    ),
    lines: lines.map(line => ({
      ...line,
      accountId: asAccountId(line.id),
      accountCurrency: line.accountCurrency ?? journalCurrency,
    })),
  });
};

const debit = (id: string, amount: string | number, extra = {}) => ({
  id,
  amount,
  transactionType: TransactionType.DEBIT,
  ...extra,
});
const credit = (id: string, amount: string | number, extra = {}) => ({
  id,
  amount,
  transactionType: TransactionType.CREDIT,
  ...extra,
});

describe('journal balance authority', () => {
  it.each([
    {
      name: 'accepts an exact same-currency balance',
      currency: 'USD',
      lines: [debit('cash', 100), credit('revenue', 100)],
      balanced: true,
    },
    {
      name: 'rejects a one-minor-unit FX drift',
      currency: 'USD',
      lines: [
        debit('eur', 10, { accountCurrency: 'EUR', exchangeRate: 1.2 }),
        credit('cash', 12.01),
      ],
      balanced: false,
    },
    {
      name: 'rejects missing foreign exchange rates',
      currency: 'USD',
      lines: [debit('eur', 10, { accountCurrency: 'EUR' }), credit('cash', 10)],
      balanced: false,
    },
    {
      name: 'rejects zero amount postings',
      currency: 'USD',
      lines: [debit('cash', 0), credit('revenue', 0)],
      balanced: false,
    },
  ])('$name', ({ currency, lines, balanced }) => {
    expect(evaluate(currency, lines).isBalanced).toBe(balanced);
  });

  it('keeps JournalCalculator as a thin view of evaluator balance', () => {
    const lines = [debit('cash', 100), credit('revenue', 100)];
    expect(isJournalBalanced(lines, 'USD')).toBe(
      evaluate('USD', lines).isBalanced,
    );
  });
});
