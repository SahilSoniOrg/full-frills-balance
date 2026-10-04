import { act, renderHook, waitFor } from '@testing-library/react-native';
import { of as mockOf } from 'rxjs';
import { useBudgetEditViewModel } from '@/src/features/budget/hooks/useBudgetEditViewModel';
import { usePlannedPaymentFormScreen } from '@/src/features/planned-payments/hooks/usePlannedPaymentFormScreen';
import { useConfirmUnsavedChanges } from '../useConfirmUnsavedChanges';
import { budgetWriteService } from '@/src/services/budget/budgetWriteService';
import { createPlannedPayment } from '@/src/services/planned-payment/plannedPaymentCommands';
import { asAccountId } from '@/src/types/ids';
import { confirm } from '@/src/utils/alerts';
import type Budget from '@/src/data/models/Budget';
import type PlannedPayment from '@/src/data/models/PlannedPayment';

let mockPreventRemove = false;
let mockBeforeRemove: (event: { data: { action: { type: string } } }) => void;
let mockQueuedLeave: (() => void) | undefined;
const mockLeft = jest.fn();
const mockGuardAtNavigation = jest.fn();

jest.mock('expo-router', () => ({ useNavigation: () => ({ dispatch: mockLeft }) }));
jest.mock('expo-router/react-navigation', () => ({
  usePreventRemove: (enabled: boolean, callback: typeof mockBeforeRemove) => {
    const React = jest.requireActual<typeof import('react')>('react');
    React.useEffect(() => {
      mockPreventRemove = enabled;
      mockBeforeRemove = callback;
    }, [enabled, callback]);
  },
}));
jest.mock('@/src/utils/navigation', () => ({
  AppNavigation: {
    back: jest.fn(() => {
      mockGuardAtNavigation(mockPreventRemove);
      mockQueuedLeave = () => {
        if (mockPreventRemove) mockBeforeRemove({ data: { action: { type: 'GO_BACK' } } });
        else mockLeft();
      };
    }),
  },
}));
jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: () => ({ workplaceId: 'wp', defaultCurrencyCode: 'USD' }),
}));
jest.mock('@/src/services/accounts/accountQueries', () => ({
  accountQueries: { observeByType: () => mockOf([]) },
}));
jest.mock('@/src/services/currency-read-service', () => ({
  currencyReadService: { observeAll: () => mockOf([]) },
}));
jest.mock('@/src/services/budget/budgetReadService', () => ({
  budgetReadService: { observeSpendingHistory: () => mockOf([]) },
}));
jest.mock('@/src/services/budget/budgetWriteService', () => ({
  budgetWriteService: { createBudget: jest.fn() },
}));
jest.mock('@/src/components/account-selection', () => ({ useAccounts: () => ({ accounts: [] }) }));
jest.mock('@/src/features/planned-payments/hooks/usePlannedPaymentRecord', () => ({
  usePlannedPaymentRecord: () => ({ item: null, isLoading: false }),
}));
jest.mock('@/src/services/planned-payment/plannedPaymentCommands', () => ({
  createPlannedPayment: jest.fn(),
}));
jest.mock('@/src/hooks/use-currencies', () => ({ useCurrencies: () => ({ currencies: [] }) }));
jest.mock('@/src/services/analytics', () => ({ analytics: { trackFeatureUsage: jest.fn() } }));
jest.mock('@/src/utils/alerts', () => ({
  confirm: { show: jest.fn() },
  toast: { error: jest.fn() },
}));
jest.mock('@/src/utils/logger', () => ({ logger: { error: jest.fn() } }));

function useBudgetHarness() {
  const vm = useBudgetEditViewModel({});
  const guard = useConfirmUnsavedChanges({
    fingerprint: JSON.stringify([vm.name, vm.amount, vm.selectedAccountIds]),
    baselineReady: !vm.loading,
    disabled: vm.isSaving,
    leaveAfterSave: vm.leaveAfterSave,
  });
  return {
    guard,
    save: vm.save,
    change: () => {
      vm.setName('Groceries');
      vm.setAmount('100');
      vm.setSelectedAccountIds([asAccountId('food')]);
    },
  };
}

function usePaymentHarness() {
  const vm = usePlannedPaymentFormScreen();
  const guard = useConfirmUnsavedChanges({
    fingerprint: JSON.stringify(vm.form),
    baselineReady: vm.isHydrated,
    disabled: vm.isSubmitting,
    leaveAfterSave: vm.leaveAfterSave,
  });
  return {
    guard,
    save: vm.handleSave,
    change: () => {
      vm.setField('name', 'Rent');
      vm.setField('amount', '100');
      vm.setField('fromAccountId', asAccountId('bank'));
      vm.setField('toAccountId', asAccountId('rent'));
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPreventRemove = false;
  mockQueuedLeave = undefined;
  jest.mocked(budgetWriteService.createBudget).mockResolvedValue({} as Budget);
  jest.mocked(createPlannedPayment).mockResolvedValue({ id: 'rent' } as PlannedPayment);
});

describe.each([
  ['budget', useBudgetHarness, () => jest.mocked(budgetWriteService.createBudget)],
  ['planned payment', usePaymentHarness, () => jest.mocked(createPlannedPayment)],
] as const)('%s save navigation', (_name, useHarness, command) => {
  async function dirtyForm() {
    const hook = renderHook(useHarness);
    await waitFor(() => expect(hook.result.current.guard.hasBaseline).toBe(true));
    act(() => hook.result.current.change());
    expect(mockPreventRemove).toBe(true);
    return hook;
  }

  it('leaves after persistence without offering to discard the saved draft', async () => {
    const { result } = await dirtyForm();
    await act(async () => {
      await result.current.save();
    });
    expect(command()).toHaveBeenCalledTimes(1);
    expect(mockQueuedLeave).toBeDefined();
    act(() => mockQueuedLeave?.());
    expect(confirm.show).not.toHaveBeenCalled();
    expect(mockLeft).toHaveBeenCalledTimes(1);
    expect(mockGuardAtNavigation).toHaveBeenCalledWith(false);
  });

  it('keeps failed saves guarded and retryable', async () => {
    command().mockRejectedValueOnce(new Error('write failed'));
    const { result } = await dirtyForm();
    await act(async () => {
      await result.current.save().catch(() => undefined);
    });
    expect(mockQueuedLeave).toBeUndefined();
    act(() => result.current.guard.onBack());
    expect(confirm.show).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.save();
    });
    expect(command()).toHaveBeenCalledTimes(2);
  });

  it('blocks repeated saves while navigation is queued', async () => {
    const { result } = await dirtyForm();
    await act(async () => {
      await Promise.all([result.current.save(), result.current.save()]);
    });
    await act(async () => {
      await result.current.save();
    });
    expect(command()).toHaveBeenCalledTimes(1);
  });
});
