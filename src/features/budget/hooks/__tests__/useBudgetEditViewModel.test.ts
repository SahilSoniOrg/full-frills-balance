import { act, renderHook } from '@testing-library/react-native';
import { of } from 'rxjs';
import { budgetReadService } from '@/src/services/budget/budgetReadService';
import { budgetWriteService } from '@/src/services/budget/budgetWriteService';
import { accountQueries } from '@/src/services/accounts/accountQueries';
import { currencyReadService } from '@/src/services/currency-read-service';
import { asAccountId, asBudgetId } from '@/src/types/ids';
import type { PlainBudget } from '@/src/types/plainDtos';
import { useBudgetEditViewModel } from '../useBudgetEditViewModel';

jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: () => ({ workplaceId: 'wp', defaultCurrencyCode: 'USD' }),
}));
jest.mock('@/src/services/accounts/accountQueries', () => ({
  accountQueries: { observeByType: jest.fn() },
}));
jest.mock('@/src/services/currency-read-service', () => ({
  currencyReadService: { observeAll: jest.fn() },
}));
jest.mock('@/src/services/budget/budgetReadService', () => ({
  budgetReadService: { observeById: jest.fn(), observeScopes: jest.fn() },
}));
jest.mock('@/src/services/budget/budgetWriteService', () => ({
  budgetWriteService: { createBudget: jest.fn(), updateBudget: jest.fn() },
}));
jest.mock('@/src/utils/navigation', () => ({ AppNavigation: { back: jest.fn() } }));

const budget: PlainBudget = {
  id: asBudgetId('food'),
  name: 'Food',
  amount: 100,
  currencyCode: 'USD',
  startMonth: '2026-10',
  startDate: new Date(2026, 9, 4).getTime(),
  intervalType: 'MONTHLY',
  intervalN: 3,
  recurrenceDay: 31,
};

describe('budget repeat count editing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(accountQueries.observeByType).mockReturnValue(of([]));
    jest.mocked(currencyReadService.observeAll).mockReturnValue(of([]));
    jest.mocked(budgetReadService.observeById).mockReturnValue(of(budget));
    jest
      .mocked(budgetReadService.observeScopes)
      .mockReturnValue(
        of([{ id: 'scope', budgetId: budget.id, accountId: asAccountId('food-category') }]),
      );
  });

  it('loads the saved count, preserves Sunday on save, and switches units to a valid day', async () => {
    const { result } = renderHook(() => useBudgetEditViewModel({ id: budget.id }));
    expect(result.current.intervalN).toBe(3);
    act(() => {
      result.current.setIntervalType('WEEKLY');
      result.current.setIntervalN(7);
    });
    expect(result.current.recurrenceDay).toBe(0);
    await act(async () => {
      await result.current.save();
    });
    expect(budgetWriteService.updateBudget).toHaveBeenCalledWith(
      'wp',
      budget.id,
      expect.objectContaining({ intervalN: 7, intervalType: 'WEEKLY', recurrenceDay: 0 }),
      [asAccountId('food-category')],
    );
    act(() => result.current.setIntervalType('MONTHLY'));
    expect(result.current.recurrenceDay).toBe(4);
    expect(result.current.intervalN).toBe(7);
  });

  it.each([0, -1, 1.5, Number.NaN, 10000])('blocks saving an invalid count: %s', async count => {
    const { result } = renderHook(() => useBudgetEditViewModel({ id: budget.id }));
    act(() => result.current.setIntervalN(count));
    expect(result.current.isFormValid).toBe(false);
    await expect(result.current.save()).rejects.toThrow('Enter a whole number');
    expect(budgetWriteService.updateBudget).not.toHaveBeenCalled();
  });
});
