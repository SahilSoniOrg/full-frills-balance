import { renderHook, waitFor } from '@testing-library/react-native';
import { of as mockOf } from 'rxjs';
import { AccountType } from '@/src/types/enums';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { useAccountDetailsMetrics } from '@/src/features/accounts/hooks/details/useAccountDetailsMetrics';
import { observeAccountPeriodMetrics } from '@/src/services/accounts/accountDerivedReads';

jest.mock('@/src/hooks/use-currencies', () => ({
  useCurrencyPrecision: () => ({ precision: 2 }),
}));

jest.mock('@/src/services/accounts/accountDerivedReads', () => ({
  observeAccountChartTransactions: jest.fn(() => mockOf([])),
  observeAccountPeriodMetrics: jest.fn((_, __, startDate) =>
    mockOf({ totalIncrease: startDate === 0 ? 150 : startDate, totalDecrease: 0 }),
  ),
}));

describe('useAccountDetailsMetrics', () => {
  it('rebuilds period totals when the selected date range changes', async () => {
    const accountId = '00000000-0000-4000-8000-000000000003' as AccountId;
    const workplaceId = '00000000-0000-4000-8000-000000000004' as WorkplaceId;
    const baseOptions = {
      accountId,
      workplaceId,
      accountType: AccountType.ASSET,
      balanceCurrency: 'USD',
      balanceData: null,
      accountIds: [accountId],
    };

    const { result, rerender } = renderHook(
      ({ startDate, endDate }: { startDate: number | null; endDate: number | null }) =>
        useAccountDetailsMetrics({
          ...baseOptions,
          dateRange: startDate === null || endDate === null ? null : { startDate, endDate },
        }),
      { initialProps: { startDate: 100, endDate: 200 } },
    );

    await waitFor(() => expect(result.current.periodMetrics.totalIncrease).toBe(100));

    rerender({ startDate: 300, endDate: 400 });

    await waitFor(() => expect(result.current.periodMetrics.totalIncrease).toBe(300));
    expect(observeAccountPeriodMetrics).toHaveBeenCalledWith(
      workplaceId,
      accountId,
      300,
      400,
      AccountType.ASSET,
      [accountId],
    );

    rerender({ startDate: null, endDate: null });

    await waitFor(() => expect(result.current.periodMetrics.totalIncrease).toBe(150));
    expect(result.current.periodMetrics.dailyAverage).toBeNull();
    expect(observeAccountPeriodMetrics).toHaveBeenCalledWith(
      workplaceId,
      accountId,
      0,
      Number.MAX_SAFE_INTEGER,
      AccountType.ASSET,
      [accountId],
    );
  });
});
