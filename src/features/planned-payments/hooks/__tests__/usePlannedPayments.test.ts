import { act, renderHook, waitFor } from '@/src/utils/test-utils';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useCalendarDay } from '@/src/hooks/useCalendarDay';
import {
  plannedPaymentReadService,
  type PlannedPaymentListData,
  type PlannedPaymentObligation,
} from '@/src/services/planned-payment/plannedPaymentReadService';
import { PlannedPaymentInterval, PlannedPaymentStatus } from '@/src/types/enums';
import type { AccountId, JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import { AppNavigation } from '@/src/utils/navigation';
import { BehaviorSubject, Subject, defer, of, throwError } from 'rxjs';
import { usePlannedPayments } from '../usePlannedPayments';

jest.mock('@/src/hooks/useCalendarDay', () => ({ useCalendarDay: jest.fn() }));
jest.mock('@/src/contexts/WorkplaceContext', () => ({ useWorkplace: jest.fn() }));
jest.mock('@/src/services/planned-payment/plannedPaymentReadService', () => ({
  ...jest.requireActual('@/src/services/planned-payment/plannedPaymentReadService'),
  plannedPaymentReadService: { observeListData: jest.fn() },
}));
jest.mock('@/src/utils/navigation', () => ({
  AppNavigation: { toPlannedPaymentDetails: jest.fn() },
}));

const date = (month: number, day: number) => new Date(2026, month - 1, day).getTime();
const workplaceId = 'workplace' as WorkplaceId;
const item: PlannedPaymentObligation = {
  id: 'plan' as PlannedPaymentId,
  name: 'Rent',
  amount: 100,
  currencyCode: 'USD',
  fromAccountId: 'cash' as AccountId,
  toAccountId: 'rent' as AccountId,
  intervalN: 1,
  intervalType: PlannedPaymentInterval.MONTHLY,
  startDate: date(10, 3),
  nextOccurrence: date(10, 3),
  nextDueOccurrence: date(9, 30),
  status: PlannedPaymentStatus.COMPLETED,
  isAutoPost: false,
  flowDirection: 'outflow',
  outstandingJournalId: 'pending',
};
const data: PlannedPaymentListData = {
  items: [item],
  savedOccurrences: [
    {
      plannedPaymentId: item.id,
      journalId: 'pending' as JournalId,
      date: date(9, 30),
      amount: 75,
      currencyCode: 'EUR',
    },
  ],
};
function setCurrency(currency: string, workplace = workplaceId) {
  jest.mocked(useWorkplace).mockReturnValue({
    workplaceId: workplace,
    defaultCurrencyCode: currency,
    setWorkplaceId: jest.fn(),
    deleteWorkplace: jest.fn(),
  });
}

describe('planned payments list hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setCurrency('USD');
    jest.mocked(useCalendarDay).mockReturnValue(date(10, 3));
    jest.mocked(plannedPaymentReadService.observeListData).mockReturnValue(of(data));
  });

  it('starts with loading true before the first snapshot, with stable empty list data', () => {
    const source = new Subject<PlannedPaymentListData>();
    jest.mocked(plannedPaymentReadService.observeListData).mockReturnValue(source);
    const loadingFrames: boolean[] = [];
    const { result } = renderHook(() => {
      const value = usePlannedPayments(workplaceId);
      loadingFrames.push(value.isLoading);
      return value;
    });
    expect(loadingFrames[0]).toBe(true);
    expect(result.current.items).toEqual([]);
    expect(result.current.listData.summary.outgoing.count).toBe(0);
    act(() => source.next(data));
    expect(result.current.isLoading).toBe(false);
  });

  it('preserves existing items/navigation and adds occurrence data using the workplace currency', async () => {
    const { result } = renderHook(() => usePlannedPayments(workplaceId));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items).toBe(data.items);
    expect(result.current.listData.summary.outgoing).toMatchObject({
      count: 1,
      mainCurrency: { currencyCode: 'USD', amount: 0 },
      otherCurrencyCount: 1,
    });
    expect(result.current.listData.groups[0].rows[0]).toMatchObject({
      amount: 75,
      currencyCode: 'EUR',
      journalId: 'pending',
    });
    act(() => result.current.onItemPress(item));
    expect(AppNavigation.toPlannedPaymentDetails).toHaveBeenCalledWith('plan', {
      description: 'Rent',
      amount: 100,
      currency: 'USD',
      nextDate: date(9, 30),
    });
  });

  it('responds to live saved amount/currency edits and settlement', async () => {
    const source = new BehaviorSubject(data);
    jest.mocked(plannedPaymentReadService.observeListData).mockReturnValue(source);
    const { result } = renderHook(() => usePlannedPayments(workplaceId));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() =>
      source.next({
        ...data,
        savedOccurrences: [{ ...data.savedOccurrences[0], amount: 125, currencyCode: 'USD' }],
      }),
    );
    expect(result.current.listData.summary.outgoing.mainCurrency.amount).toBe(125);
    act(() => source.next({ ...data, savedOccurrences: [] }));
    expect(result.current.listData.summary.outgoing.count).toBe(0);
    expect(result.current.listData.groups[0].rows).toEqual([]);
    expect(result.current.listData.groups[5].rows[0].payment.id).toBe('plan');
  });

  it('updates selected currency without changing the subscription', async () => {
    const { result, rerender } = renderHook(() => usePlannedPayments(workplaceId));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    setCurrency('EUR');
    rerender({});
    expect(result.current.listData.summary.outgoing.mainCurrency.amount).toBe(75);
    expect(result.current.listData.summary.outgoing.otherCurrencyCount).toBe(0);
    expect(plannedPaymentReadService.observeListData).toHaveBeenCalledTimes(1);
  });

  it('regroups and reprojects when the calendar day crosses midnight or a month boundary', async () => {
    const daily: PlannedPaymentListData = {
      items: [
        {
          ...item,
          status: PlannedPaymentStatus.ACTIVE,
          intervalType: PlannedPaymentInterval.DAILY,
          startDate: date(10, 31),
          nextOccurrence: date(10, 31),
          endDate: date(11, 2),
        },
      ],
      savedOccurrences: [],
    };
    jest.mocked(plannedPaymentReadService.observeListData).mockReturnValue(of(daily));
    jest.mocked(useCalendarDay).mockReturnValue(date(10, 31));
    const { result, rerender } = renderHook(() => usePlannedPayments(workplaceId));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.listData.summary.outgoing.count).toBe(1);
    expect(result.current.listData.groups[0].rows).toHaveLength(0);
    jest.mocked(useCalendarDay).mockReturnValue(date(11, 1));
    rerender({});
    expect(result.current.listData.groups[0].rows).toHaveLength(1);
    expect(result.current.listData.summary.outgoing.count).toBe(3);
    expect(result.current.listData.monthStrip).toHaveLength(30);
    expect(result.current.listData.monthStrip[0]).toMatchObject({
      isToday: true,
      outgoingAmount: 100,
    });
    expect(plannedPaymentReadService.observeListData).toHaveBeenCalledTimes(2);
  });

  it('clears previous workplace data while the next workplace is loading and unsubscribes the old source', async () => {
    const first = new BehaviorSubject(data);
    const second = new Subject<PlannedPaymentListData>();
    jest
      .mocked(plannedPaymentReadService.observeListData)
      .mockImplementation(id => (id === workplaceId ? first : second));
    const { result, rerender, unmount } = renderHook(
      ({ id }: { id: WorkplaceId }) => usePlannedPayments(id),
      {
        initialProps: { id: workplaceId },
      },
    );
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    const other = 'other' as WorkplaceId;
    setCurrency('GBP', other);
    rerender({ id: other });
    expect(result.current.items).toEqual([]);
    expect(result.current.listData.summary.outgoing.count).toBe(0);
    expect(result.current.isLoading).toBe(true);
    expect(first.observed).toBe(false);
    act(() => second.next({ items: [], savedOccurrences: [] }));
    expect(result.current.isLoading).toBe(false);
    unmount();
    expect(second.observed).toBe(false);
  });

  it('retains read errors and retry support', async () => {
    let failed = true;
    jest
      .mocked(plannedPaymentReadService.observeListData)
      .mockReturnValue(
        defer(() => (failed ? throwError(() => new Error('read failed')) : of(data))),
      );
    const { result } = renderHook(() => usePlannedPayments(workplaceId));
    await waitFor(() => expect(result.current.error?.message).toBe('read failed'));
    failed = false;
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.items).toHaveLength(1);
    expect(result.current.isLoading).toBe(false);
  });
});
