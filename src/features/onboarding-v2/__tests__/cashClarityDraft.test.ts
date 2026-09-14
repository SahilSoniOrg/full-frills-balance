import { PlannedPaymentInterval } from '@/src/types/enums';
import dayjs from 'dayjs';
import {
  createInitialDraft,
  incomeRecurrence,
  isMoneyReady,
  isSpendableAccount,
  nextDateOnDayOfMonth,
  type CashClarityDraft,
} from '../draft';
import { projectCashClarityDraft } from '../projectCashClarityDraft';
import { mapDraftToWorkplaceOutput } from '../mapToWorkplaceOutput';
import { confirmIncome, confirmMoney, confirmPayments } from '../spokenConfirm';

const now = dayjs('2026-09-14T10:00:00');

function draft(overrides: Partial<CashClarityDraft> = {}): CashClarityDraft {
  return {
    ...createInitialDraft('INR', 'Personal'),
    accounts: [{ id: 'main', kind: 'bank', name: 'Bank', balance: 50000 }],
    income: { kind: 'skipped' },
    commitment: { kind: 'skipped' },
    budget: { kind: 'skipped' },
    ...overrides,
  };
}

describe('projectCashClarityDraft', () => {
  it('uses liquid cash as Safe to Spend when nothing else is reserved', () => {
    const result = projectCashClarityDraft(draft(), now);
    expect(result.safeToSpend).toBe(50000);
    expect(result.liquidNow).toBe(50000);
  });

  it('does not treat a credit card balance as spendable cash', () => {
    const result = projectCashClarityDraft(
      draft({
        accounts: [{ id: 'card', kind: 'card', name: 'Credit Card', balance: 12000 }],
      }),
      now,
    );
    expect(result.liquidNow).toBe(0);
    expect(result.safeToSpend).toBe(0);
  });

  it('does not treat protected savings as spendable cash', () => {
    const result = projectCashClarityDraft(
      draft({
        accounts: [
          { id: 'save', kind: 'savings', name: 'Savings', balance: 80000, spendable: false },
        ],
      }),
      now,
    );
    expect(result.liquidNow).toBe(0);
  });

  it('does not invent income for skipped answers', () => {
    const skipped = projectCashClarityDraft(draft({ income: { kind: 'skipped' } }), now);
    expect(skipped.expectedIncomeInWindow).toBe(0);
    expect(skipped.omitted).toContain('No expected income included');
  });

  it('reduces Safe to Spend for a planned payment inside the window', () => {
    const without = projectCashClarityDraft(draft(), now);
    const withRent = projectCashClarityDraft(
      draft({
        commitment: {
          kind: 'payment',
          items: [
            {
              id: 'rent',
              name: 'Rent',
              type: 'rent',
              amount: 25000,
              dueDate: now.add(5, 'day').valueOf(),
            },
          ],
        },
      }),
      now,
    );
    expect(withRent.safeToSpend).toBeLessThan(without.safeToSpend);
    expect(withRent.safeToSpend).toBe(25000);
  });

  it('keeps income outside the projection window out of Safe to Spend', () => {
    const result = projectCashClarityDraft(
      draft({
        income: {
          kind: 'recurring',
          items: [
            {
              id: 'salary',
              name: 'Salary',
              source: 'salary',
              amount: 80000,
              interval: PlannedPaymentInterval.MONTHLY,
              intervalN: 1,
              nextDate: now.add(45, 'day').valueOf(),
            },
          ],
        },
      }),
      now,
    );
    expect(result.safeToSpend).toBe(50000);
    expect(result.expectedIncomeInWindow).toBe(0);
    expect(result.ahead.find(beat => beat.key === 'salary')?.subtitle).toBe(
      'Outside the next 30 days, so it is not counted yet.',
    );
  });

  it('explains in-window planned payments on the clarity lines', () => {
    const result = projectCashClarityDraft(
      draft({
        commitment: {
          kind: 'payment',
          items: [
            {
              id: 'rent',
              name: 'Rent',
              type: 'rent',
              amount: 25000,
              dueDate: now.add(5, 'day').valueOf(),
            },
          ],
        },
      }),
      now,
    );
    expect(result.plannedOutflowInWindow).toBe(25000);
    expect(result.ahead.find(beat => beat.key === 'rent')?.amount).toBe(25000);
  });

  it('keeps Safe to Spend at cash on hand until income arrives, with projected room as the row total', () => {
    const result = projectCashClarityDraft(
      draft({
        income: {
          kind: 'recurring',
          items: [
            {
              id: 'salary',
              name: 'Salary',
              source: 'salary',
              amount: 300000,
              interval: PlannedPaymentInterval.MONTHLY,
              intervalN: 1,
              nextDate: nextDateOnDayOfMonth(25, now).valueOf(),
            },
          ],
        },
        commitment: {
          kind: 'payment',
          items: [
            {
              id: 'rent',
              name: 'Rent',
              type: 'rent',
              amount: 22000,
              dueDate: nextDateOnDayOfMonth(1, now).valueOf(),
            },
          ],
        },
        budget: { kind: 'set', items: [{ id: 'food', name: 'Food', amount: 9000 }] },
      }),
      now,
    );
    expect(result.projectedRoom).toBe(50000 + 300000 - 22000 - 9000);
    expect(result.safeToSpend).toBe(44176.47);
    expect(result.heldNow).toBe(5823.53);
    expect(result.ahead.find(beat => beat.key === 'salary')?.subtitle).toBe(
      'Arrives 25 Sep. Not spendable until then.',
    );
    expect(result.ahead.find(beat => beat.key === 'rent')?.subtitle).toBe(
      'Due 1 Oct, after income — paid from that payday.',
    );
    expect(result.safeToSpend).toBeLessThan(result.liquidNow);
  });

  it('does not treat unset savings as spendable cash', () => {
    expect(
      isSpendableAccount({ id: 'save', kind: 'savings', name: 'Savings', balance: 80000 }),
    ).toBe(false);
    expect(isMoneyReady([{ id: 'save', kind: 'savings', name: 'Savings', balance: 80000 }])).toBe(
      false,
    );
    expect(
      isMoneyReady([
        { id: 'save', kind: 'savings', name: 'Savings', balance: 80000, spendable: true },
      ]),
    ).toBe(true);
  });

  it('holds an expected card payment from spendable cash', () => {
    const result = projectCashClarityDraft(
      draft({
        accounts: [
          { id: 'main', kind: 'bank', name: 'Bank', balance: 50000 },
          {
            id: 'card',
            kind: 'card',
            name: 'Credit Card',
            balance: 12000,
            cardPaymentAmount: 10000,
            cardPaymentDate: now.add(5, 'day').valueOf(),
          },
        ],
      }),
      now,
    );
    expect(result.liquidNow).toBe(50000);
    expect(result.safeToSpend).toBeLessThan(result.liquidNow);
  });

  it('sums more than one spendable account into liquid cash', () => {
    const result = projectCashClarityDraft(
      draft({
        accounts: [
          { id: 'bank', kind: 'bank', name: 'Bank', balance: 50000 },
          { id: 'cash', kind: 'cash', name: 'Cash', balance: 2000 },
        ],
      }),
      now,
    );
    expect(result.liquidNow).toBe(52000);
    expect(result.safeToSpend).toBe(52000);
  });
});

describe('mapDraftToWorkplaceOutput', () => {
  it('maps the conversational answers onto the existing workplace setup output', () => {
    const output = mapDraftToWorkplaceOutput(
      draft({
        income: {
          kind: 'recurring',
          items: [
            {
              id: 'salary',
              name: 'Salary',
              source: 'salary',
              amount: 80000,
              interval: PlannedPaymentInterval.MONTHLY,
              intervalN: 1,
              nextDate: now.add(10, 'day').valueOf(),
            },
          ],
        },
        commitment: {
          kind: 'payment',
          items: [
            {
              id: 'rent',
              name: 'Rent',
              type: 'rent',
              amount: 25000,
              dueDate: now.add(16, 'day').valueOf(),
            },
          ],
        },
        budget: { kind: 'set', items: [{ id: 'food', name: 'Food', amount: 8000 }] },
      }),
    );
    expect(output.name.value).toBe('Personal');
    expect(output.baseCurrency.value).toBe('INR');
    expect(output.selectedAccounts.map(item => item.name)).toEqual(['Bank']);
    expect(output.selectedCategories.some(item => item.name === 'Groceries')).toBe(true);
    expect(output.selectedCategories.some(item => item.name === 'Salary')).toBe(true);
    expect(output.selectedCategories.some(item => item.name === 'Rent')).toBe(true);
  });
});

describe('spoken confirmations', () => {
  it('names cash, protected savings, and a planned card payment', () => {
    expect(
      confirmMoney(
        [
          { id: 'bank', kind: 'bank', name: 'Bank', balance: 50000 },
          { id: 'save', kind: 'savings', name: 'Savings', balance: 80000, spendable: false },
          {
            id: 'card',
            kind: 'card',
            name: 'Card',
            balance: 12000,
            cardPaymentAmount: 2000,
            cardPaymentDate: now.add(17, 'day').valueOf(),
          },
        ],
        'INR',
      ),
    ).toBe(
      'Got it. ₹50,000 in Bank, ₹80,000 in Savings (protected), and ₹12,000 outstanding on Card, paying ₹2,000 on 1 Oct.',
    );
  });

  it('keeps skipped income from sounding like a forecast', () => {
    expect(confirmIncome([], 'INR')).toBe(
      'No expected income included. Safe to Spend is only cash you have.',
    );
  });

  it('names a protected rent payment', () => {
    expect(
      confirmPayments(
        [
          {
            id: 'rent',
            name: 'Rent',
            type: 'rent',
            amount: 25000,
            dueDate: now.add(17, 'day').valueOf(),
          },
        ],
        'INR',
      ),
    ).toBe('Rent of ₹25,000 on 1 Oct is already spoken for.');
  });
});

describe('onboarding date and amount helpers', () => {
  it('uses the next upcoming day of month, not a past date this month', () => {
    expect(nextDateOnDayOfMonth(25, dayjs('2026-09-14')).format('YYYY-MM-DD')).toBe('2026-09-25');
    expect(nextDateOnDayOfMonth(1, dayjs('2026-09-14')).format('YYYY-MM-DD')).toBe('2026-10-01');
    expect(nextDateOnDayOfMonth(25, dayjs('2026-09-26')).format('YYYY-MM-DD')).toBe('2026-10-25');
  });

  it('stores every-two-weeks income as weekly with interval 2', () => {
    expect(incomeRecurrence('BIWEEKLY')).toEqual({
      interval: PlannedPaymentInterval.WEEKLY,
      intervalN: 2,
    });
    expect(incomeRecurrence('MONTHLY')).toEqual({
      interval: PlannedPaymentInterval.MONTHLY,
      intervalN: 1,
    });
  });
});
