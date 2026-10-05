import { act, renderHook } from '@testing-library/react-native';
import { of as mockOf } from 'rxjs';
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
  budgetReadService: {
    observeById: jest.fn(),
    observeScopes: jest.fn(),
    observeSpendingHistory: jest.fn(() => mockOf([])),
  },
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
    jest.mocked(accountQueries.observeByType).mockReturnValue(mockOf([]));
    jest.mocked(currencyReadService.observeAll).mockReturnValue(mockOf([]));
    jest.mocked(budgetReadService.observeById).mockReturnValue(mockOf(budget));
    jest
      .mocked(budgetReadService.observeScopes)
      .mockReturnValue(
        mockOf([{ id: 'scope', budgetId: budget.id, accountId: asAccountId('food-category') }]),
      );
  });

  it('loads the saved count, preserves Sunday on save, and switches units to a valid day', async () => {
    const { result } = renderHook(() => useBudgetEditViewModel({ id: budget.id }));
    expect(result.current.schedule.intervalN).toBe(3);
    act(() => {
      result.current.setSchedule({ intervalType: 'WEEKLY', intervalN: 7, recurrenceDay: 0 });
    });
    expect(result.current.schedule.recurrenceDay).toBe(0);
    await act(async () => {
      await result.current.save();
    });
    expect(budgetWriteService.updateBudget).toHaveBeenCalledWith(
      'wp',
      budget.id,
      expect.objectContaining({ intervalN: 7, intervalType: 'WEEKLY', recurrenceDay: 0 }),
      [asAccountId('food-category')],
    );
    act(() =>
      result.current.setSchedule({ intervalType: 'MONTHLY', intervalN: 7, recurrenceDay: 4 }),
    );
    expect(result.current.schedule.recurrenceDay).toBe(4);
    expect(result.current.schedule.intervalN).toBe(7);
  });

  it.each([0, -1, 1.5, Number.NaN, 10000])('blocks saving an invalid count: %s', async count => {
    const { result } = renderHook(() => useBudgetEditViewModel({ id: budget.id }));
    act(() =>
      result.current.setSchedule({ intervalType: 'MONTHLY', intervalN: count, recurrenceDay: 31 }),
    );
    expect(result.current.isFormValid).toBe(false);
    await expect(result.current.save()).rejects.toThrow('Enter a whole number');
    expect(budgetWriteService.updateBudget).not.toHaveBeenCalled();
  });

  it('exposes and applies the complete schedule value and derives the amount label', () => {
    const { result } = renderHook(() => useBudgetEditViewModel({ id: budget.id }));
    expect(result.current.schedule).toEqual({
      intervalType: 'MONTHLY',
      intervalN: 3,
      recurrenceDay: 31,
    });
    expect(result.current.amountLabel).toBe('Limit every 3 months');

    act(() =>
      result.current.setSchedule({
        intervalType: 'WEEKLY',
        intervalN: 2,
        recurrenceDay: 4,
      }),
    );

    expect(result.current.schedule).toEqual({
      intervalType: 'WEEKLY',
      intervalN: 2,
      recurrenceDay: 4,
    });
    expect(result.current.amountLabel).toBe('Limit every 2 weeks');

    act(() => result.current.setSchedule({ intervalType: 'DAILY', intervalN: 1 }));
    expect(result.current.schedule).toEqual({ intervalType: 'DAILY', intervalN: 1 });
    expect(result.current.amountLabel).toBe('Limit each day');
  });

  it('owns category add and remove actions in the view model', () => {
    const { result } = renderHook(() => useBudgetEditViewModel({ id: budget.id }));
    const existingId = asAccountId('food-category');
    const addedId = asAccountId('dining-category');

    act(() => result.current.addCategory(addedId));
    expect(result.current.selectedAccountIds).toEqual([existingId, addedId]);

    act(() => result.current.removeCategory(existingId));
    expect(result.current.selectedAccountIds).toEqual([addedId]);
  });

  it('passes changing category selections to the observable history read and uses its average', () => {
    jest.mocked(budgetReadService.observeSpendingHistory).mockReturnValue(
      mockOf([
        {
          label: 'May',
          startDate: 1,
          endDate: 2,
          spent: 30,
          transactionCount: 1,
          hasUnvaluedEntries: false,
        },
        {
          label: 'Jun',
          startDate: 3,
          endDate: 4,
          spent: 0,
          transactionCount: 0,
          hasUnvaluedEntries: false,
        },
        {
          label: 'Jul',
          startDate: 5,
          endDate: 6,
          spent: 10,
          transactionCount: 1,
          hasUnvaluedEntries: false,
        },
        {
          label: 'Aug',
          startDate: 7,
          endDate: 8,
          spent: 0,
          transactionCount: 0,
          hasUnvaluedEntries: false,
        },
        {
          label: 'Sep',
          startDate: 9,
          endDate: 10,
          spent: 0,
          transactionCount: 0,
          hasUnvaluedEntries: false,
        },
        {
          label: 'Oct',
          startDate: 11,
          endDate: 12,
          spent: 0,
          transactionCount: 0,
          hasUnvaluedEntries: false,
        },
        {
          label: 'Now',
          startDate: 13,
          endDate: 14,
          spent: 99,
          transactionCount: 2,
          hasUnvaluedEntries: false,
        },
      ]),
    );
    const { result } = renderHook(() => useBudgetEditViewModel({ id: budget.id }));
    expect(result.current.averageSpend).toBe(20);
    const readsBeforeAmountChange = jest.mocked(budgetReadService.observeSpendingHistory).mock.calls
      .length;

    act(() => result.current.useAverage());
    expect(result.current.amount).toBe('20.00');
    expect(budgetReadService.observeSpendingHistory).toHaveBeenCalledTimes(readsBeforeAmountChange);

    act(() => result.current.setSelectedAccountIds([asAccountId('another-category')]));
    expect(budgetReadService.observeSpendingHistory).toHaveBeenLastCalledWith(
      'wp',
      [asAccountId('another-category')],
      expect.objectContaining({ intervalType: 'MONTHLY', intervalN: 3 }),
      'USD',
    );
  });
});
