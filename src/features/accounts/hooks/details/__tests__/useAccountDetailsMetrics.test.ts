import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Subject, of as mockOf } from 'rxjs';
import { AccountType } from '@/src/types/enums';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { useAccountDetailsMetrics } from '@/src/features/accounts/hooks/details/useAccountDetailsMetrics';
import {
  observeAccountChartTransactions,
  observeAccountOpeningBalance,
  observeAccountPeriodMetrics,
} from '@/src/services/accounts/accountDerivedReads';
import type Transaction from '@/src/data/models/Transaction';
import dayjs from 'dayjs';

jest.mock('@/src/hooks/use-currencies', () => ({
  useCurrencyPrecision: () => ({ precision: 2 }),
}));

jest.mock('@/src/services/accounts/accountDerivedReads', () => ({
  observeAccountChartTransactions: jest.fn(() => mockOf([])),
  observeAccountOpeningBalance: jest.fn(() => mockOf(100)),
  observeAccountPeriodMetrics: jest.fn((_, __, startDate) =>
    mockOf({ totalIncrease: startDate === 0 ? 150 : startDate, totalDecrease: 0 }),
  ),
}));

describe('useAccountDetailsMetrics', () => {
  beforeEach(() => {
    jest.mocked(observeAccountChartTransactions).mockReset().mockReturnValue(mockOf([]));
    jest.mocked(observeAccountOpeningBalance).mockReset().mockReturnValue(mockOf(100));
  });

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

  it('plots a category period from zero at its opening balance', async () => {
    const accountId = '00000000-0000-4000-8000-000000000005' as AccountId;
    const start = dayjs('2024-09-01').valueOf();
    const end = dayjs('2024-09-30').endOf('day').valueOf();
    jest.mocked(observeAccountChartTransactions).mockReturnValueOnce(
      mockOf([
        { transactionDate: dayjs('2024-09-05').valueOf(), runningBalance: 130 },
        { transactionDate: dayjs('2024-09-12').valueOf(), runningBalance: 175 },
      ] as unknown as Transaction[]),
    );

    const options = {
      accountId,
      workplaceId: '00000000-0000-4000-8000-000000000006' as WorkplaceId,
      accountType: AccountType.EXPENSE,
      balanceCurrency: 'USD',
      balanceData: null,
      accountIds: [accountId],
      dateRange: { startDate: start, endDate: end },
    };
    const { result } = renderHook(() => useAccountDetailsMetrics(options));

    await waitFor(() => expect(result.current.chartData.length).toBeGreaterThan(0));
    expect(observeAccountOpeningBalance).toHaveBeenCalledWith(expect.anything(), accountId, start);
    expect(result.current.chartData[0]).toEqual({ x: start, y: 0 });
    expect(result.current.chartData.at(-1)?.y).toBe(75);
    expect(result.current.rollingAverageData).toEqual([]);
  });

  it.each(['transactions', 'opening'] as const)(
    'waits for both new period inputs when %s arrive first and ignores the old subscription',
    async first => {
      const august = {
        startDate: dayjs('2024-08-01').valueOf(),
        endDate: dayjs('2024-08-31').endOf('day').valueOf(),
      };
      const september = {
        startDate: dayjs('2024-09-01').valueOf(),
        endDate: dayjs('2024-09-30').endOf('day').valueOf(),
      };
      const oldTransactions = new Subject<Transaction[]>();
      const oldOpening = new Subject<number>();
      const newTransactions = new Subject<Transaction[]>();
      const newOpening = new Subject<number>();
      jest
        .mocked(observeAccountChartTransactions)
        .mockReturnValueOnce(oldTransactions)
        .mockReturnValueOnce(newTransactions);
      jest
        .mocked(observeAccountOpeningBalance)
        .mockReturnValueOnce(oldOpening)
        .mockReturnValueOnce(newOpening);
      const baseOptions = {
        accountId: 'category' as AccountId,
        workplaceId: 'workplace' as WorkplaceId,
        accountType: AccountType.EXPENSE,
        balanceCurrency: 'USD',
        balanceData: null,
        accountIds: ['category' as AccountId],
      };
      const { result, rerender } = renderHook(
        ({ dateRange }: { dateRange: typeof august }) =>
          useAccountDetailsMetrics({ ...baseOptions, dateRange }),
        { initialProps: { dateRange: august } },
      );
      await act(async () => {
        oldTransactions.next([
          { transactionDate: dayjs('2024-08-05').valueOf(), runningBalance: 130 } as Transaction,
        ]);
        oldOpening.next(100);
      });
      expect(result.current.chartData.at(-1)?.y).toBe(30);

      rerender({ dateRange: september });
      expect(result.current.chartData).toEqual([]);
      const emitTransactions = () =>
        newTransactions.next([
          { transactionDate: dayjs('2024-09-05').valueOf(), runningBalance: 150 } as Transaction,
        ]);
      const emitOpening = () => newOpening.next(130);
      await act(async () => {
        (first === 'transactions' ? emitTransactions : emitOpening)();
        oldTransactions.next([
          { transactionDate: dayjs('2024-09-05').valueOf(), runningBalance: 999 } as Transaction,
        ]);
        oldOpening.next(999);
      });
      expect(result.current.chartData).toEqual([]);
      await act(async () => {
        (first === 'transactions' ? emitOpening : emitTransactions)();
      });
      expect(result.current.chartData[0]).toEqual({ x: september.startDate, y: 0 });
      expect(result.current.chartData.at(-1)?.y).toBe(20);
    },
  );
});
