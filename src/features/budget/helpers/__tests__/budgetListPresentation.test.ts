import { asBudgetId } from '@/src/types/ids';
import type { BudgetItem } from '../../types';
import { sortBudgetItems, summarizeBudgetList } from '../budgetListPresentation';

const now = new Date(2026, 9, 10, 12).getTime();
function item(
  name: string,
  spent: number,
  overrides: Partial<BudgetItem['budget']> = {},
): BudgetItem {
  return {
    budget: {
      id: asBudgetId(name),
      name,
      amount: 100,
      currencyCode: 'USD',
      intervalType: 'MONTHLY',
      intervalN: 1,
      recurrenceDay: 1,
      ...overrides,
    },
    usage: { spent, budgetAmount: 100, remaining: 100 - spent, usagePercent: spent / 100 },
    scopeAccounts: [],
  };
}

describe('budget list data', () => {
  it('orders by over, near, ahead, on pace, nothing spent, then name', () => {
    const items = [
      item('Zero', 0),
      item('On pace', 20),
      item('Near', 80),
      item('Ahead', 60),
      item('Z over', 110),
      item('A over', 120),
    ];
    expect(sortBudgetItems(items, now).map(row => row.budget.name)).toEqual([
      'A over',
      'Z over',
      'Near',
      'Ahead',
      'On pace',
      'Zero',
    ]);
    expect(items[0].budget.name).toBe('Zero');
  });

  it('uses each weekly period to determine pace', () => {
    const rows = [
      item('Monthly on pace', 20),
      item('Weekly ahead', 70, { intervalType: 'WEEKLY', recurrenceDay: 5 }),
    ];
    expect(sortBudgetItems(rows, now)[0].budget.name).toBe('Weekly ahead');
  });

  it('sums monthly budgets only in the main currency without conversion', () => {
    const summary = summarizeBudgetList(
      [
        item('A', 30),
        item('B', 110),
        item('Euro', 5, { currencyCode: 'EUR' }),
        item('Weekly', 70, { intervalType: 'WEEKLY' }),
        item('Quarterly', 5, { intervalN: 3 }),
      ],
      'USD',
      now,
    );
    expect(summary).toMatchObject({
      currencyCode: 'USD',
      otherCurrencyCount: 1,
      excludedCadenceCount: 2,
      overCount: 1,
      usage: { spent: 140, budgetAmount: 200, remaining: 60 },
    });
    expect(summary.period?.periodDays).toBe(31);
    expect(summary.period?.daysRemaining).toBe(22);
  });

  it('drops the period label and marker when monthly anchors differ', () => {
    const summary = summarizeBudgetList(
      [item('First', 1), item('Fifteenth', 1, { recurrenceDay: 15 })],
      'USD',
      now,
    );
    expect(summary.periodRange).toBeUndefined();
    expect(summary.period).toBeUndefined();
  });

  it('retains missing-FX uncertainty and exact currency precision', () => {
    const a = item('A', 0.1);
    a.usage.hasUnvaluedEntries = true;
    const summary = summarizeBudgetList([a, item('B', 0.2)], 'USD', now);
    expect(summary.usage.spent).toBe(0.3);
    expect(summary.usage.hasUnvaluedEntries).toBe(true);
    expect(summary.usage.remaining).toBe(199.7);
  });

  it('keeps money numeric so privacy-aware views control all formatting', () => {
    const summary = summarizeBudgetList([item('A', 12.34)], 'USD', now);
    expect(typeof summary.usage.spent).toBe('number');
    expect(JSON.stringify(summary)).not.toContain('$');
  });

  it('headlines the main budget currency instead of $0 when the workplace currency has none', () => {
    const summary = summarizeBudgetList([item('Euro', 5, { currencyCode: 'EUR' })], 'USD', now);
    expect(summary.currencyCode).toBe('EUR');
    expect(summary.usage.spent).toBe(5);
    expect(summary.otherCurrencyCount).toBe(0);
  });
});
