import { act, renderHook } from '@testing-library/react-native';
import { usePlannedPaymentRecord } from '../usePlannedPaymentRecord';
import { usePlannedPaymentFormScreen } from '../usePlannedPaymentFormScreen';
import { updatePlannedPayment } from '@/src/services/planned-payment/plannedPaymentCommands';
import { useAccounts } from '@/src/components/account-selection';
import type { PlannedPaymentObligation } from '@/src/services/planned-payment/plannedPaymentReadService';
import { asAccountId, asPlannedPaymentId } from '@/src/types/ids';
import { AccountType, PlannedPaymentInterval, PlannedPaymentStatus } from '@/src/types/enums';
import type { PlainAccount } from '@/src/types/plainDtos';

jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: () => ({ workplaceId: 'wp', defaultCurrencyCode: 'USD' }),
}));
jest.mock('@/src/components/account-selection', () => ({
  useAccounts: jest.fn(() => ({ accounts: [] })),
}));
jest.mock('../usePlannedPaymentRecord', () => ({ usePlannedPaymentRecord: jest.fn() }));
jest.mock('@/src/services/planned-payment/plannedPaymentCommands', () => ({
  updatePlannedPayment: jest.fn(),
  createPlannedPayment: jest.fn(),
}));
jest.mock('@/src/utils/navigation', () => ({ AppNavigation: { back: jest.fn() } }));

const payment: PlannedPaymentObligation = {
  id: asPlannedPaymentId('rent'),
  name: 'Rent',
  amount: 100,
  currencyCode: 'USD',
  fromAccountId: asAccountId('cash'),
  toAccountId: asAccountId('rent-category'),
  intervalType: PlannedPaymentInterval.MONTHLY,
  intervalN: 2,
  recurrenceDay: 31,
  startDate: new Date(2026, 9, 4).getTime(),
  nextOccurrence: new Date(2026, 9, 31).getTime(),
  status: PlannedPaymentStatus.ACTIVE,
  isAutoPost: false,
  flowDirection: 'outflow',
};

describe('planned payment repeat count editing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(usePlannedPaymentRecord).mockReturnValue({ item: payment, isLoading: false });
  });

  it('loads the count and saves seven weeks with a valid Sunday after switching units', async () => {
    const { result } = renderHook(() => usePlannedPaymentFormScreen(payment.id));
    expect(result.current.isHydrated).toBe(true);
    expect(result.current.form.intervalN).toBe(2);
    act(() => {
      result.current.setField('intervalType', PlannedPaymentInterval.WEEKLY);
      result.current.setField('intervalN', 7);
    });
    expect(result.current.form.recurrenceDay).toBe(0);
    await act(async () => {
      await result.current.handleSave();
    });
    expect(updatePlannedPayment).toHaveBeenCalledWith(
      'wp',
      payment.id,
      expect.objectContaining({ intervalN: 7, intervalType: 'WEEKLY', recurrenceDay: 0 }),
    );
    act(() => result.current.setField('intervalType', PlannedPaymentInterval.MONTHLY));
    expect(result.current.form.recurrenceDay).toBe(4);
    expect(result.current.form.intervalN).toBe(7);
  });

  it.each([0, -1, 1.5, Number.NaN, 10000])('blocks saving an invalid count: %s', async count => {
    const { result } = renderHook(() => usePlannedPaymentFormScreen(payment.id));
    act(() => result.current.setField('intervalN', count));
    expect(result.current.isValid).toBe(false);
    await act(async () => {
      await result.current.handleSave();
    });
    expect(updatePlannedPayment).not.toHaveBeenCalled();
  });

  it('exposes and sets the schedule as one four-field update', () => {
    const { result } = renderHook(() => usePlannedPaymentFormScreen(payment.id));
    expect(result.current.schedule).toEqual({
      intervalType: 'MONTHLY', intervalN: 2, recurrenceDay: 31, recurrenceMonth: undefined,
    });
    act(() => result.current.setSchedule({
      intervalType: 'YEARLY', intervalN: 3, recurrenceDay: 15, recurrenceMonth: 8,
    }));
    expect(result.current.form).toMatchObject({
      intervalType: 'YEARLY', intervalN: 3, recurrenceDay: 15, recurrenceMonth: 8,
    });
  });

  it('swaps the From and To account IDs and focuses amount only for creation', () => {
    const { result } = renderHook(() => usePlannedPaymentFormScreen(payment.id));
    expect(result.current.autoFocusAmount).toBe(false);
    act(() => result.current.swapAccounts());
    expect(result.current.form.fromAccountId).toBe(payment.toAccountId);
    expect(result.current.form.toAccountId).toBe(payment.fromAccountId);

    jest.mocked(usePlannedPaymentRecord).mockReturnValue({ item: null, isLoading: false });
    const createModel = renderHook(() => usePlannedPaymentFormScreen());
    expect(createModel.result.current.autoFocusAmount).toBe(true);
  });

  it('provides sorted destinations through the picker model', () => {
    const account = (id: string, accountType: AccountType): PlainAccount => ({
      id: asAccountId(id),
      name: id,
      accountType,
      currencyCode: 'USD',
    });
    jest.mocked(useAccounts).mockReturnValue({
      accounts: [
        account('asset', AccountType.ASSET),
        account('liability', AccountType.LIABILITY),
        account('expense', AccountType.EXPENSE),
      ],
    } as ReturnType<typeof useAccounts>);

    const { result } = renderHook(() => usePlannedPaymentFormScreen());
    act(() => result.current.pickerState.open('to'));
    expect(result.current.pickerState.accounts.map(item => item.id)).toEqual([
      asAccountId('expense'), asAccountId('liability'), asAccountId('asset'),
    ]);
  });
});
