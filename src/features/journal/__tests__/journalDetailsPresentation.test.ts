import { buildJournalEntries, nextJournalOccurrence } from '../journalDetailsPresentation';
import { journalDetailLeg, journalDetailEvaluation } from '../testing/journalDetailsFixtures';
import { AccountType, PlannedPaymentInterval, PlannedPaymentStatus } from '@/src/types/enums';
import { asAccountId, asPlannedPaymentId } from '@/src/types/ids';
import dayjs from 'dayjs';

it('uses balances for same-currency one-to-one journals, excluding category lifetime totals', () => {
  const items = [journalDetailLeg('Bank'), journalDetailLeg('Food', AccountType.EXPENSE, false)];
  expect(
    buildJournalEntries(items, 'INR', 'POSTED').balanceItems.map(item => item.accountName),
  ).toEqual(['Bank']);
  expect(buildJournalEntries(items, 'INR', 'PLANNED').balanceItems).toEqual([]);
  expect(buildJournalEntries(items, 'INR', 'SKIPPED').balanceItems).toEqual([]);
});

it('forces a split for two-leg multi-currency journals', () => {
  const items = [
    { ...journalDetailLeg('USD Bank'), currencyCode: 'USD', exchangeRate: 83 },
    journalDetailLeg('Food', AccountType.EXPENSE, false),
  ];
  expect(buildJournalEntries(items, 'INR', 'POSTED').shape).toBe('split');
});

it.each([
  [1, 2],
  [2, 1],
  [2, 2],
])('renders %i credits and %i debits as a split', (credits, debits) => {
  const items = [
    ...Array.from({ length: credits }, (_, i) => journalDetailLeg(`credit-${i}`)),
    ...Array.from({ length: debits }, (_, i) =>
      journalDetailLeg(`debit-${i}`, AccountType.EXPENSE, false),
    ),
  ];
  const presentation = buildJournalEntries(items, 'INR', 'POSTED');
  expect(presentation.shape).toBe('split');
  expect(presentation.groups.map(group => group.items.length)).toEqual([credits, debits]);
});

it('never sums a partly valued group', () => {
  const items = [
    journalDetailLeg('Bank'),
    {
      ...journalDetailLeg('USD Card'),
      currencyCode: 'USD',
      journalValue: undefined,
      exchangeRate: undefined,
    },
    journalDetailLeg('Food', AccountType.EXPENSE, false),
  ];
  const evaluation = journalDetailEvaluation(items);
  const presentation = buildJournalEntries(items, 'INR', 'POSTED', evaluation);
  expect(presentation.groups[0].total).toBeUndefined();
  expect(presentation.balanced).toBe(false);
});

it.each([
  [
    'a balance-funded expense and reimbursement split',
    [
      journalDetailLeg('Bank'),
      journalDetailLeg('Card', AccountType.LIABILITY),
      journalDetailLeg('Travel', AccountType.EXPENSE, false),
      journalDetailLeg('Receivable', AccountType.ASSET, false),
    ],
  ],
  [
    'a card repayment funded by savings and income',
    [
      journalDetailLeg('Savings'),
      journalDetailLeg('Interest', AccountType.INCOME),
      journalDetailLeg('Card', AccountType.LIABILITY, false),
    ],
  ],
  [
    'a category reclassification',
    [
      journalDetailLeg('Food', AccountType.EXPENSE),
      journalDetailLeg('Travel', AccountType.EXPENSE, false),
    ],
  ],
])('labels %s as From/To', (_, items) => {
  expect(buildJournalEntries(items, 'INR', 'POSTED').groups.map(group => group.label)).toEqual([
    'From',
    'To',
  ]);
});

it('computes the occurrence after the journal independently of the current cursor and respects schedule end', () => {
  const date = dayjs('2023-09-12').valueOf();
  const payment = {
    id: asPlannedPaymentId('schedule'),
    name: 'Netflix',
    amount: 649,
    currencyCode: 'INR',
    fromAccountId: asAccountId('bank'),
    toAccountId: asAccountId('food'),
    intervalN: 1,
    intervalType: PlannedPaymentInterval.MONTHLY,
    startDate: dayjs('2023-02-12').valueOf(),
    nextOccurrence: dayjs('2026-11-12').valueOf(),
    status: PlannedPaymentStatus.ACTIVE,
    isAutoPost: false,
    recurrenceDay: 12,
  };
  expect(dayjs(nextJournalOccurrence(payment, date)).format('YYYY-MM-DD')).toBe('2023-10-12');
  expect(nextJournalOccurrence({ ...payment, endDate: date }, date)).toBeUndefined();
});
