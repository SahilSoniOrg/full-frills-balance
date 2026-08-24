import { BudgetId } from '@/src/types/ids';
import { buildBudgetDetailPreview, buildBudgetUsagePreview } from '../budgetDetailPresentation';

describe('budgetDetailPresentation', () => {
  const budgetId = 'budget-1' as BudgetId;

  it('builds a typed preview budget from navigation params', () => {
    expect(
      buildBudgetDetailPreview({
        budgetId,
        name: 'Food',
        amount: '125.50',
        currency: 'EUR',
        period: 'MONTHLY',
        baseCurrency: 'USD',
      }),
    ).toMatchObject({
      id: budgetId,
      name: 'Food',
      amount: 125.5,
      currencyCode: 'EUR',
      intervalType: 'MONTHLY',
      intervalN: 1,
    });
  });

  it('uses the same parsed amount for preview usage', () => {
    expect(buildBudgetUsagePreview({ name: 'Food', amount: '125.50' })).toEqual({
      spent: 0,
      remaining: 125.5,
      budgetAmount: 125.5,
      usagePercent: 0,
    });
  });

  it('returns no preview when the route has no budget name', () => {
    expect(buildBudgetDetailPreview({ budgetId, baseCurrency: 'USD', amount: '10' })).toBeNull();
    expect(buildBudgetUsagePreview({ amount: '10' })).toBeNull();
  });
});
