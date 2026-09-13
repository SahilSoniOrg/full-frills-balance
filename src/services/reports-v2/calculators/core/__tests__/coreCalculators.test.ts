import {
  AccountSubtype,
  AccountType,
  JournalDisplayType,
  SemanticType,
  TransactionType,
} from '@/src/types/enums';
import {
  calculateCashFlow,
  calculateIncome,
  calculateNetWorth,
  calculateOverview,
  calculateSpending,
} from '../coreCalculators';
import { makeBuckets } from '../coreUtils';
import type { CalculatorInput, ReportingFact } from '../coreTypes';

const PERIOD = {
  startDate: Date.UTC(2026, 0, 1),
  endDate: Date.UTC(2026, 0, 31, 23, 59, 59),
  timeZone: 'UTC',
};

function fact(
  input: Partial<ReportingFact> &
    Pick<ReportingFact, 'accountId' | 'accountType' | 'transactionType' | 'amount'>,
): ReportingFact {
  return {
    journalId: `${input.accountId}-${input.amount}-${input.transactionType}`,
    journalDate: Date.UTC(2026, 0, 5, 12),
    accountPath: [input.accountId],
    isLeafAccount: true,
    currencyCode: 'USD',
    ...input,
  };
}

function input(facts: readonly ReportingFact[]): CalculatorInput {
  return { facts, query: { period: PERIOD, targetCurrency: 'USD', granularity: 'DAY' } };
}

describe('Reports V2 core calculators', () => {
  it('buckets calendar days in the report timezone', () => {
    const period = {
      startDate: Date.UTC(2026, 0, 1, 18, 30),
      endDate: Date.UTC(2026, 0, 3, 18, 29, 59),
      timeZone: 'Asia/Kolkata',
    };

    expect(makeBuckets(period, 'DAY')).toEqual([
      {
        startDate: Date.UTC(2026, 0, 1, 18, 30),
        endDate: Date.UTC(2026, 0, 2, 18, 29, 59, 999),
        label: '2026-01-02',
      },
      {
        startDate: Date.UTC(2026, 0, 2, 18, 30),
        endDate: Date.UTC(2026, 0, 3, 18, 29, 59),
        label: '2026-01-03',
      },
    ]);
  });

  it('does not apply pre-period facts on top of opening balances', () => {
    const facts = [
      fact({
        journalDate: Date.UTC(2025, 11, 31, 12),
        accountId: 'checking',
        accountType: AccountType.ASSET,
        accountSubtype: AccountSubtype.BANK_CHECKING,
        transactionType: TransactionType.DEBIT,
        amount: 100,
      }),
      fact({
        journalDate: Date.UTC(2026, 0, 5, 12),
        accountId: 'checking',
        accountType: AccountType.ASSET,
        accountSubtype: AccountSubtype.BANK_CHECKING,
        transactionType: TransactionType.DEBIT,
        amount: 25,
      }),
    ];

    const result = calculateNetWorth({
      facts,
      query: { period: PERIOD, targetCurrency: 'USD', granularity: 'DAY' },
      openingBalances: [{ accountId: 'checking', accountType: AccountType.ASSET, balance: 100 }],
      closingBalances: [{ accountId: 'checking', accountType: AccountType.ASSET, balance: 125 }],
    });

    expect(result.history[0]?.netWorth).toBe(100);
    expect(result.history[4]?.netWorth).toBe(125);
  });

  it('separates gross, reversal, net, and cash movement measures', () => {
    const facts = [
      fact({
        accountId: 'food',
        accountName: 'Food',
        accountType: AccountType.EXPENSE,
        accountSubtype: AccountSubtype.FOOD,
        transactionType: TransactionType.DEBIT,
        amount: 100,
      }),
      fact({
        accountId: 'food',
        accountName: 'Food',
        accountType: AccountType.EXPENSE,
        accountSubtype: AccountSubtype.FOOD,
        transactionType: TransactionType.CREDIT,
        amount: 20,
        semanticType: SemanticType.REFUND,
      }),
      fact({
        accountId: 'salary',
        accountName: 'Salary',
        accountType: AccountType.INCOME,
        accountSubtype: AccountSubtype.SALARY,
        transactionType: TransactionType.CREDIT,
        amount: 200,
      }),
      fact({
        accountId: 'checking',
        accountName: 'Checking',
        accountType: AccountType.ASSET,
        accountSubtype: AccountSubtype.BANK_CHECKING,
        transactionType: TransactionType.DEBIT,
        amount: 200,
      }),
      fact({
        accountId: 'checking',
        accountName: 'Checking',
        accountType: AccountType.ASSET,
        accountSubtype: AccountSubtype.BANK_CHECKING,
        transactionType: TransactionType.CREDIT,
        amount: 100,
      }),
      fact({
        accountId: 'checking',
        accountName: 'Checking',
        accountType: AccountType.ASSET,
        accountSubtype: AccountSubtype.BANK_CHECKING,
        transactionType: TransactionType.DEBIT,
        amount: 20,
      }),
    ];
    const reportInput = input(facts);
    expect(calculateSpending(reportInput)).toMatchObject({
      grossExpense: 100,
      refunds: 20,
      netExpense: 80,
    });
    expect(calculateIncome(reportInput)).toMatchObject({ grossIncome: 200, netIncome: 200 });
    expect(calculateCashFlow(reportInput)).toMatchObject({
      cashInflows: 220,
      cashOutflows: 100,
      netCashFlow: 120,
    });
    expect(calculateOverview(reportInput)).toMatchObject({
      netIncome: 200,
      netExpense: 80,
      netFlow: 120,
      savingsRate: 60,
    });
  });

  it('keeps internal transfers visible in cash flow without turning them into income or spending', () => {
    const transferFacts = [
      fact({
        journalId: 'transfer',
        accountId: 'savings',
        accountType: AccountType.ASSET,
        accountSubtype: AccountSubtype.BANK_SAVINGS,
        transactionType: TransactionType.DEBIT,
        amount: 50,
        semanticType: SemanticType.TRANSFER,
        journalDisplayType: JournalDisplayType.TRANSFER,
      }),
      fact({
        journalId: 'transfer',
        accountId: 'checking',
        accountType: AccountType.ASSET,
        accountSubtype: AccountSubtype.BANK_CHECKING,
        transactionType: TransactionType.CREDIT,
        amount: 50,
        semanticType: SemanticType.TRANSFER,
        journalDisplayType: JournalDisplayType.TRANSFER,
      }),
    ];
    const result = calculateCashFlow(input(transferFacts));
    expect(result).toMatchObject({
      cashInflows: 50,
      cashOutflows: 50,
      netCashFlow: 0,
      internalTransfers: 50,
    });
    expect(calculateOverview(input(transferFacts))).toMatchObject({
      grossIncome: 0,
      netExpense: 0,
      netFlow: 0,
    });
  });

  it('compares overview totals against the supplied comparison facts', () => {
    const currentFacts = [
      fact({
        journalId: 'current-income',
        accountId: 'salary',
        accountType: AccountType.INCOME,
        accountSubtype: AccountSubtype.SALARY,
        transactionType: TransactionType.CREDIT,
        amount: 200,
      }),
      fact({
        journalId: 'current-expense',
        accountId: 'food',
        accountType: AccountType.EXPENSE,
        accountSubtype: AccountSubtype.FOOD,
        transactionType: TransactionType.DEBIT,
        amount: 80,
      }),
    ];
    const previousFacts = [
      fact({
        journalId: 'previous-income',
        accountId: 'salary',
        accountType: AccountType.INCOME,
        accountSubtype: AccountSubtype.SALARY,
        transactionType: TransactionType.CREDIT,
        amount: 100,
      }),
      fact({
        journalId: 'previous-expense',
        accountId: 'food',
        accountType: AccountType.EXPENSE,
        accountSubtype: AccountSubtype.FOOD,
        transactionType: TransactionType.DEBIT,
        amount: 40,
      }),
    ];

    const result = calculateOverview({ ...input(currentFacts), comparisonFacts: previousFacts });

    expect(result.comparison).toMatchObject({
      netIncome: { current: 200, previous: 100, change: 100, percentChange: 100 },
      netExpense: { current: 80, previous: 40, change: 40, percentChange: 100 },
      netFlow: { current: 120, previous: 60, change: 60, percentChange: 100 },
    });
  });
});
