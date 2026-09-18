import { createInitialDraft } from '../draft';
import { explainDraftTransition } from '../draftTransition';
import { PlannedPaymentInterval } from '@/src/types/enums';

describe('explainDraftTransition', () => {
  const base = createInitialDraft('USD', 'Personal');

  it('explains an account balance change from the draft delta', () => {
    const previous = {
      ...base,
      accounts: [{ id: 'bank-1', kind: 'bank' as const, name: 'Bank', balance: 100 }],
    };
    const current = {
      ...previous,
      accounts: [{ ...previous.accounts[0], balance: 125 }],
    };

    expect(explainDraftTransition(previous, current)).toBe('$25 added to Bank');
  });

  it('explains income, planned payment, and budget changes using their actual items', () => {
    const income = {
      id: 'income-1',
      name: 'Salary',
      source: 'salary' as const,
      amount: 2000,
      interval: PlannedPaymentInterval.MONTHLY,
      intervalN: 1,
      nextDate: 1,
    };
    const payment = {
      id: 'payment-1',
      name: 'Rent',
      type: 'rent' as const,
      amount: 800,
      dueDate: 1,
    };
    const budget = { id: 'budget-1', name: 'Food', amount: 300, category: 'Food' };

    expect(
      explainDraftTransition(base, { ...base, income: { kind: 'recurring', items: [income] } }),
    ).toBe('$2,000 expected from Salary');
    expect(
      explainDraftTransition(base, {
        ...base,
        commitment: { kind: 'payment', items: [payment] },
      }),
    ).toBe('$800 reserved for Rent');
    expect(
      explainDraftTransition(base, { ...base, budget: { kind: 'set', items: [budget] } }),
    ).toBe('$300 set aside monthly for Food');
  });

  it('makes skipped optional sections truthful', () => {
    expect(explainDraftTransition(base, { ...base, income: { kind: 'skipped' } })).toBe(
      'No income added — Safe to Spend unchanged',
    );
    expect(explainDraftTransition(base, { ...base, commitment: { kind: 'skipped' } })).toBe(
      'No planned payments added — Safe to Spend unchanged',
    );
  });
});
