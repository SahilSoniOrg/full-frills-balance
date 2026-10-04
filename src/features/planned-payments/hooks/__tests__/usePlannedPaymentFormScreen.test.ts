import { act, renderHook } from '@testing-library/react-native';
import { usePlannedPaymentRecord } from '../usePlannedPaymentRecord';
import { usePlannedPaymentForm } from '../usePlannedPaymentForm';
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
jest.mock('@/src/hooks/useCrossCurrencyRates', () => ({
  useCrossCurrencyRates: () => ({
    sourceBaseRate: 1,
    destBaseRate: 1 / 85,
    isLoading: false,
    error: null,
  }),
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
    jest
      .mocked(useAccounts)
      .mockReturnValue({ accounts: [], isLoading: false, version: 0, error: null });
    jest.mocked(usePlannedPaymentRecord).mockReturnValue({ item: payment, isLoading: false });
  });

  it('loads the count and saves seven weeks with a valid Sunday after switching units', async () => {
    const { result } = renderHook(() => usePlannedPaymentForm(payment.id));
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
    const { result } = renderHook(() => usePlannedPaymentForm(payment.id));
    act(() => result.current.setField('intervalN', count));
    expect(result.current.isValid).toBe(false);
    await act(async () => {
      await result.current.handleSave();
    });
    expect(updatePlannedPayment).not.toHaveBeenCalled();
  });

  it('exposes and sets the schedule as one four-field update', () => {
    const { result } = renderHook(() => usePlannedPaymentForm(payment.id));
    expect(result.current.schedule).toEqual({
      intervalType: 'MONTHLY',
      intervalN: 2,
      recurrenceDay: 31,
      recurrenceMonth: undefined,
    });
    act(() =>
      result.current.setSchedule({
        intervalType: 'YEARLY',
        intervalN: 3,
        recurrenceDay: 15,
        recurrenceMonth: 8,
      }),
    );
    expect(result.current.form).toMatchObject({
      intervalType: 'YEARLY',
      intervalN: 3,
      recurrenceDay: 15,
      recurrenceMonth: 8,
    });
  });

  it('swaps the From and To account IDs and focuses amount only for creation', () => {
    const { result } = renderHook(() => usePlannedPaymentForm(payment.id));
    expect(result.current.autoFocusAmount).toBe(false);
    act(() => result.current.swapAccounts());
    expect(result.current.form.fromAccountId).toBe(payment.toAccountId);
    expect(result.current.form.toAccountId).toBe(payment.fromAccountId);

    jest.mocked(usePlannedPaymentRecord).mockReturnValue({ item: null, isLoading: false });
    const createModel = renderHook(() => usePlannedPaymentForm());
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

    const { result } = renderHook(() => usePlannedPaymentForm());
    act(() => result.current.pickerState.open('to'));
    expect(result.current.pickerState.accounts.map(item => item.id)).toEqual([
      asAccountId('expense'),
      asAccountId('liability'),
      asAccountId('asset'),
    ]);
  });
});

describe('planned payment FX policy', () => {
  const usd: PlainAccount = {
    id: asAccountId('cash'),
    name: 'USD Checking',
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
  };
  const inr: PlainAccount = {
    id: asAccountId('rupees'),
    name: 'INR Wallet',
    accountType: AccountType.ASSET,
    currencyCode: 'INR',
  };
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(useAccounts)
      .mockReturnValue({ accounts: [usd, inr] } as ReturnType<typeof useAccounts>);
    jest.mocked(usePlannedPaymentRecord).mockReturnValue({
      item: { ...payment, fxMode: 'automatic', toAccountId: inr.id },
      isLoading: false,
    });
  });
  it('shows a current automatic estimate without persisting a destination amount', async () => {
    const { result } = renderHook(() => usePlannedPaymentForm(payment.id));
    expect(result.current.fxPair.convertedAmount).toBe(8500);
    expect(result.current.form.destinationAmount).toBeUndefined();
    await act(async () => result.current.handleSave());
    expect(updatePlannedPayment).toHaveBeenCalledWith(
      'wp',
      payment.id,
      expect.objectContaining({
        fxMode: 'automatic',
        amount: 100,
        currencyCode: 'USD',
        destinationAmount: undefined,
      }),
    );
  });
  it('saves two fixed native amounts even when the implied rate is parity', async () => {
    const { result } = renderHook(() => usePlannedPaymentForm(payment.id));
    act(() => {
      result.current.setFxMode('fixed');
      result.current.setField('destinationAmount', '100');
    });
    expect(result.current.fxPair.pairRate).toBe(1);
    expect(result.current.isValid).toBe(true);
    await act(async () => result.current.handleSave());
    expect(updatePlannedPayment).toHaveBeenCalledWith(
      'wp',
      payment.id,
      expect.objectContaining({ fxMode: 'fixed', amount: 100, destinationAmount: 100 }),
    );
  });
  it('retains fixed amounts when reselecting either existing account', () => {
    const { result } = renderHook(() => usePlannedPaymentForm(payment.id));
    act(() => {
      result.current.setFxMode('fixed');
      result.current.setField('destinationAmount', '100');
    });
    act(() => result.current.selectSource(usd.id));
    act(() => result.current.selectDestination(inr.id));
    expect(result.current.form.destinationAmount).toBe('100');
    expect(result.current.fxPair.pairRate).toBe(1);
  });
  it('requires a new source amount when a legacy To change switches currency interpretation', () => {
    const otherInr = { ...inr, id: asAccountId('other-inr') };
    jest
      .mocked(useAccounts)
      .mockReturnValue({ accounts: [usd, inr, otherInr] } as ReturnType<typeof useAccounts>);
    jest
      .mocked(usePlannedPaymentRecord)
      .mockReturnValue({
        item: { ...payment, currencyCode: 'EUR', toAccountId: inr.id },
        isLoading: false,
      });
    const { result } = renderHook(() => usePlannedPaymentForm(payment.id));
    act(() => result.current.selectDestination(otherInr.id));
    expect(result.current.form).toMatchObject({
      fxMode: 'automatic',
      currencyCode: 'USD',
      amount: '',
    });
    expect(result.current.isValid).toBe(false);
  });
  it('blocks saving the same account on both sides', async () => {
    const { result } = renderHook(() => usePlannedPaymentForm(payment.id));
    act(() => result.current.selectDestination(usd.id));
    expect(result.current.isValid).toBe(false);
    await act(async () => result.current.handleSave());
    expect(updatePlannedPayment).not.toHaveBeenCalled();
  });
  it('blocks a fixed schedule with a missing destination amount', async () => {
    const { result } = renderHook(() => usePlannedPaymentForm(payment.id));
    act(() => {
      result.current.setFxMode('fixed');
      result.current.setField('destinationAmount', '');
    });
    expect(result.current.isValid).toBe(false);
    await act(async () => result.current.handleSave());
    expect(updatePlannedPayment).not.toHaveBeenCalled();
  });
  it('manual FX turns off automatic recording in the draft and save payload', async () => {
    const { result } = renderHook(() => usePlannedPaymentForm(payment.id));
    act(() => result.current.setField('isAutoPost', true));
    act(() => result.current.setFxMode('manual'));
    expect(result.current.form.isAutoPost).toBe(false);
    // Command payload remains safe even when a caller bypasses the disabled switch.
    act(() => result.current.setField('isAutoPost', true));
    await act(async () => result.current.handleSave());
    expect(updatePlannedPayment).toHaveBeenCalledWith(
      'wp',
      payment.id,
      expect.objectContaining({ fxMode: 'manual', isAutoPost: false }),
    );
  });
  it('swapping foreign accounts changes source currency and requires a new amount', () => {
    const { result } = renderHook(() => usePlannedPaymentForm(payment.id));
    act(() => {
      result.current.setFxMode('fixed');
      result.current.setField('destinationAmount', '100');
    });
    act(() => result.current.swapAccounts());
    expect(result.current.form).toMatchObject({
      currencyCode: 'INR',
      fromAccountId: inr.id,
      amount: '',
    });
    expect(result.current.form.destinationAmount).toBeUndefined();
    expect(result.current.isValid).toBe(false);
  });
  it('returns to equal amounts when switching a fixed schedule to same-currency accounts', () => {
    const otherUsd = { ...usd, id: asAccountId('other-usd') };
    jest
      .mocked(useAccounts)
      .mockReturnValue({ accounts: [usd, inr, otherUsd] } as ReturnType<typeof useAccounts>);
    const { result } = renderHook(() => usePlannedPaymentForm(payment.id));
    act(() => result.current.setFxMode('fixed'));
    act(() => result.current.selectDestination(otherUsd.id));
    expect(result.current.form.fxMode).toBe('automatic');
    expect(result.current.form.destinationAmount).toBeUndefined();
    expect(result.current.fxPair.isCrossCurrency).toBe(false);
    expect(result.current.isValid).toBe(true);
  });
});
