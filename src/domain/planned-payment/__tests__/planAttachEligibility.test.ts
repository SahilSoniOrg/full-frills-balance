import {
  decidePlanAttachUpgrade,
  isCaptureGeneratedDescription,
  resolvePlanCategoryCounter,
} from '@/src/domain/planned-payment/planAttachEligibility';
import type { CaptureMetadata } from '@/src/domain/transaction-intelligence/captureMetadata';
import { AccountType, TransactionType } from '@/src/types/enums';
import { asAccountId } from '@/src/types/ids';

const cash = {
  id: asAccountId('cash'),
  accountType: AccountType.ASSET,
  currencyCode: 'USD',
};
const rent = {
  id: asAccountId('rent'),
  accountType: AccountType.EXPENSE,
  currencyCode: 'USD',
};
const liability = {
  id: asAccountId('card'),
  accountType: AccountType.LIABILITY,
  currencyCode: 'USD',
};
const uncategorized = {
  id: asAccountId('uncategorized'),
  accountType: AccountType.EXPENSE,
  currencyCode: 'USD',
};
const salary = {
  id: asAccountId('salary'),
  accountType: AccountType.INCOME,
  currencyCode: 'USD',
};

const uncategorizedCapture = (overrides: Partial<CaptureMetadata> = {}): CaptureMetadata => ({
  version: 1,
  merchant: 'Landlord',
  economicKind: 'expense',
  reviewState: 'needs_categorization',
  allocations: [
    {
      accountId: uncategorized.id,
      amount: 100,
      transactionType: TransactionType.DEBIT,
      currencyCode: 'USD',
      origin: 'uncategorized',
    },
  ],
  uncategorizedAccountIds: [uncategorized.id],
  sources: [{ channel: 'sms', sourceId: 'sms-1', occurredAt: 1_000 }],
  ...overrides,
});

describe('resolvePlanCategoryCounter', () => {
  it('returns the expense/income leg as the category counter', () => {
    expect(resolvePlanCategoryCounter(cash, rent)).toEqual({
      kind: 'category',
      accountId: rent.id,
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
    });
    expect(resolvePlanCategoryCounter(salary, cash)).toEqual({
      kind: 'category',
      accountId: salary.id,
      accountType: AccountType.INCOME,
      currencyCode: 'USD',
    });
  });

  it('marks asset/liability plans as structural', () => {
    expect(resolvePlanCategoryCounter(cash, liability).kind).toBe('structural');
  });
});

describe('isCaptureGeneratedDescription', () => {
  it('accepts merchant and Captured fallback descriptions', () => {
    const capture = uncategorizedCapture();
    expect(isCaptureGeneratedDescription('Landlord', capture)).toBe(true);
    expect(isCaptureGeneratedDescription('Captured expense', capture)).toBe(true);
    expect(isCaptureGeneratedDescription('Custom rent', capture)).toBe(false);
  });
});

describe('decidePlanAttachUpgrade', () => {
  const lines = [
    {
      accountId: cash.id,
      amount: 100,
      transactionType: TransactionType.CREDIT,
      currencyCode: 'USD',
      accountType: AccountType.ASSET,
    },
    {
      accountId: uncategorized.id,
      amount: 100,
      transactionType: TransactionType.DEBIT,
      currencyCode: 'USD',
      accountType: AccountType.EXPENSE,
    },
  ];
  const counter = resolvePlanCategoryCounter(cash, rent);

  it('rewrites eligible uncategorized capture lines', () => {
    expect(
      decidePlanAttachUpgrade({
        capture: uncategorizedCapture(),
        lines,
        description: 'Landlord',
        planCounter: counter,
      }),
    ).toMatchObject({
      kind: 'rewrite',
      replaceDescription: true,
      counter: { accountId: rent.id },
    });
  });

  it('leaves user-categorized lines untouched', () => {
    expect(
      decidePlanAttachUpgrade({
        capture: uncategorizedCapture({
          allocations: [
            {
              accountId: rent.id,
              amount: 100,
              transactionType: TransactionType.DEBIT,
              currencyCode: 'USD',
              origin: 'user',
              confirmedAt: 50,
            },
          ],
        }),
        lines: [lines[0], { ...lines[1], accountId: rent.id, accountType: AccountType.EXPENSE }],
        description: 'Rent',
        planCounter: counter,
      }),
    ).toEqual({ kind: 'link_only', reason: 'not_uncategorized' });
  });

  it('requires confirmation for structural conflicts and never rewrites', () => {
    expect(
      decidePlanAttachUpgrade({
        capture: uncategorizedCapture(),
        lines,
        description: 'Landlord',
        planCounter: resolvePlanCategoryCounter(cash, liability),
      }),
    ).toEqual({ kind: 'link_only', reason: 'structural_conflict' });
  });

  it('does not rewrite when lines no longer match capture allocations', () => {
    expect(
      decidePlanAttachUpgrade({
        capture: uncategorizedCapture(),
        lines: [lines[0], { ...lines[1], amount: 90 }],
        description: 'Landlord',
        planCounter: counter,
      }),
    ).toEqual({ kind: 'link_only', reason: 'lines_edited' });
  });
});
