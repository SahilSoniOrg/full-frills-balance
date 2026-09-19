import dayjs from 'dayjs';
import { createInitialDraft } from '../draft';
import { explainDraftTransition } from '../draftTransitionModel';
import { PlannedPaymentInterval } from '@/src/types/enums';

describe('explainDraftTransition', () => {
  const base = createInitialDraft('USD', 'Personal');
  const now = dayjs('2026-09-01T10:00:00');
  const withCash = {
    ...base,
    accounts: [{ id: 'bank-1', kind: 'bank' as const, name: 'Bank', balance: 50000 }],
    income: { kind: 'skipped' as const },
    commitment: { kind: 'skipped' as const },
    budget: { kind: 'skipped' as const },
  };

  it('explains an account balance change from the draft delta', () => {
    const previous = {
      ...base,
      accounts: [{ id: 'bank-1', kind: 'bank' as const, name: 'Bank', balance: 100 }],
    };
    const current = {
      ...previous,
      accounts: [{ ...previous.accounts[0], balance: 125 }],
    };

    expect(explainDraftTransition(previous, current, now)).toBe(
      '$25 added to Safe to Spend — Bank balance increased',
    );
  });

  it('uses the actual Safe-to-Spend effect for a budget before a future salary', () => {
    const previous = {
      ...withCash,
      income: {
        kind: 'recurring' as const,
        items: [
          {
            id: 'income-1',
            name: 'Salary',
            source: 'salary' as const,
            amount: 20000,
            interval: PlannedPaymentInterval.MONTHLY,
            intervalN: 1,
            nextDate: now.add(15, 'day').valueOf(),
          },
        ],
      },
    };
    const current = {
      ...previous,
      budget: {
        kind: 'set' as const,
        items: [{ id: 'budget-1', name: 'Food', amount: 12000 }],
      },
    };

    expect(explainDraftTransition(previous, current, now)).toBe(
      '$6,000 held from Safe to Spend — Food budget added',
    );
  });

  it('attributes payment and future-income transitions to their displayed effect', () => {
    const income = {
      id: 'income-1',
      name: 'Salary',
      source: 'salary' as const,
      amount: 2000,
      interval: PlannedPaymentInterval.MONTHLY,
      intervalN: 1,
      nextDate: now.add(15, 'day').valueOf(),
    };
    const payment = {
      id: 'payment-1',
      name: 'Rent',
      type: 'rent' as const,
      amount: 800,
      dueDate: now.add(5, 'day').valueOf(),
    };

    expect(
      explainDraftTransition(
        withCash,
        {
          ...withCash,
          income: { kind: 'recurring', items: [income] },
        },
        now,
      ),
    ).toBe('Safe to Spend unchanged — Salary income added');
    expect(
      explainDraftTransition(
        withCash,
        {
          ...withCash,
          commitment: { kind: 'payment', items: [payment] },
        },
        now,
      ),
    ).toBe('$800 held from Safe to Spend — Rent payment added');
  });

  it('reports the effect when a planned payment is removed', () => {
    const payment = {
      id: 'payment-1',
      name: 'Rent',
      type: 'rent' as const,
      amount: 800,
      dueDate: now.add(5, 'day').valueOf(),
    };

    expect(
      explainDraftTransition(
        { ...withCash, commitment: { kind: 'payment', items: [payment] } },
        { ...withCash, commitment: { kind: 'payment', items: [] } },
        now,
      ),
    ).toBe('$800 added to Safe to Spend — Rent payment removed');
  });

  it('makes skipped optional sections truthful when they do not change the number', () => {
    expect(explainDraftTransition(base, { ...base, income: { kind: 'skipped' } }, now)).toBe(
      'Safe to Spend unchanged — income skipped',
    );
    expect(explainDraftTransition(base, { ...base, commitment: { kind: 'skipped' } }, now)).toBe(
      'Safe to Spend unchanged — planned payments skipped',
    );
  });

  it('attributes projection changes caused by payment dates', () => {
    const payment = {
      id: 'payment-1',
      name: 'Rent',
      type: 'rent' as const,
      amount: 800,
      dueDate: now.add(40, 'day').valueOf(),
    };

    expect(
      explainDraftTransition(
        { ...withCash, commitment: { kind: 'payment', items: [payment] } },
        {
          ...withCash,
          commitment: {
            kind: 'payment',
            items: [{ ...payment, dueDate: now.add(5, 'day').valueOf() }],
          },
        },
        now,
      ),
    ).toBe('$800 held from Safe to Spend — Rent payment changed');
  });

  it('returns null for metadata-only draft updates', () => {
    expect(explainDraftTransition(base, { ...base, workplaceName: 'Household' }, now)).toBeNull();
  });
});
