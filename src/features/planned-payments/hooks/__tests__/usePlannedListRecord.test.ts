import { act, renderHook } from '@/src/utils/test-utils';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { recordPlannedOccurrenceWithFxReview } from '@/src/services/planned-payment/recordPlannedOccurrenceWithFxReview';
import type { PlannedPaymentListOccurrence } from '@/src/services/planned-payment/plannedPaymentReadService';
import { PlannedPaymentInterval } from '@/src/types/enums';
import type { AccountId, JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import { usePlannedListRecord } from '../usePlannedListRecord';

jest.mock('@/src/contexts/WorkplaceContext', () => ({ useWorkplace: jest.fn() }));
jest.mock('@/src/services/planned-payment/recordPlannedOccurrenceWithFxReview', () => ({
  recordPlannedOccurrenceWithFxReview: jest.fn(),
}));

const workplaceId = 'workplace-a' as WorkplaceId;
const dueDate = new Date(2026, 9, 1).getTime();
const occurrence: PlannedPaymentListOccurrence = {
  occurrenceId: 'plan-a:2026-10-01',
  payment: {
    id: 'plan-a' as PlannedPaymentId,
    name: 'Rent',
    amount: 900,
    currencyCode: 'USD',
    fromAccountId: 'cash' as AccountId,
    toAccountId: 'rent' as AccountId,
    intervalN: 1,
    intervalType: PlannedPaymentInterval.MONTHLY,
    startDate: dueDate,
    nextOccurrence: dueDate,
    status: 'COMPLETED' as PlannedPaymentListOccurrence['payment']['status'],
    isAutoPost: false,
    flowDirection: 'outflow',
  },
  date: dueDate,
  amount: 725.25,
  currencyCode: 'EUR',
  journalId: 'saved-journal' as JournalId,
  canRecord: true,
};

function setWorkplace(id: WorkplaceId) {
  jest.mocked(useWorkplace).mockReturnValue({
    workplaceId: id,
    defaultCurrencyCode: 'USD',
    setWorkplaceId: jest.fn(),
    deleteWorkplace: jest.fn(),
  });
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderListRecordHook(
  workplace: WorkplaceId,
  isCurrent: (occurrence: PlannedPaymentListOccurrence) => boolean = () => true,
) {
  setWorkplace(workplace);
  return renderHook(() => usePlannedListRecord(isCurrent));
}

describe('usePlannedListRecord', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setWorkplace(workplaceId);
    jest.mocked(recordPlannedOccurrenceWithFxReview).mockResolvedValue(true);
  });

  it('posts the displayed saved journal occurrence with its own date and currency-specific saved row', async () => {
    const { result } = renderListRecordHook(workplaceId);
    await act(async () => result.current.recordOccurrence(occurrence));
    expect(recordPlannedOccurrenceWithFxReview).toHaveBeenCalledWith(
      workplaceId,
      occurrence.payment.id,
      occurrence.date,
      occurrence.journalId,
    );
  });

  it('blocks occurrences that cannot record or are no longer in the live list', async () => {
    const isCurrent = jest.fn(() => false);
    const { result } = renderListRecordHook(workplaceId, isCurrent);
    await act(async () => result.current.recordOccurrence(occurrence));
    await act(async () => result.current.recordOccurrence({ ...occurrence, canRecord: false }));
    expect(isCurrent).toHaveBeenCalledTimes(1);
    expect(recordPlannedOccurrenceWithFxReview).not.toHaveBeenCalled();
  });

  it('locks all visible rows for a plan until its write settles', async () => {
    const pending = deferred();
    jest.mocked(recordPlannedOccurrenceWithFxReview).mockReturnValue(pending.promise);
    const { result } = renderListRecordHook(workplaceId);
    act(() => {
      void result.current.recordOccurrence(occurrence);
    });
    await act(async () => {
      await result.current.recordOccurrence({
        ...occurrence,
        occurrenceId: 'plan-a:2026-10-02',
        date: dueDate + 86400000,
        journalId: 'second-journal' as JournalId,
      });
    });
    expect(recordPlannedOccurrenceWithFxReview).toHaveBeenCalledTimes(1);
    expect(result.current.pendingPlanIds.has(occurrence.payment.id)).toBe(true);
    await act(async () => pending.resolve());
    expect(result.current.pendingPlanIds.has(occurrence.payment.id)).toBe(false);
  });

  it('shows an inline retryable error and clears it on retry', async () => {
    jest
      .mocked(recordPlannedOccurrenceWithFxReview)
      .mockRejectedValueOnce(new Error('write failed'))
      .mockResolvedValueOnce(true);
    const { result } = renderListRecordHook(workplaceId);
    await act(async () => result.current.recordOccurrence(occurrence));
    expect(result.current.errors[occurrence.occurrenceId]).toBeTruthy();
    await act(async () => result.current.recordOccurrence(occurrence));
    expect(result.current.errors[occurrence.occurrenceId]).toBeUndefined();
    expect(recordPlannedOccurrenceWithFxReview).toHaveBeenCalledTimes(2);
  });

  it('does not start a stale row action after its workplace changes', async () => {
    const isCurrent = jest.fn(() => true);
    const { result, rerender } = renderHook(
      ({ id }: { id: WorkplaceId }) => {
        setWorkplace(id);
        return usePlannedListRecord(isCurrent);
      },
      { initialProps: { id: workplaceId } },
    );
    const oldAction = result.current.recordOccurrence;
    const nextWorkplace = 'workplace-b' as WorkplaceId;
    rerender({ id: nextWorkplace });
    await act(async () => oldAction(occurrence));
    expect(recordPlannedOccurrenceWithFxReview).not.toHaveBeenCalled();
  });

  it('clears pending and error UI when switching away and back while an old request finishes', async () => {
    const pending = deferred();
    jest
      .mocked(recordPlannedOccurrenceWithFxReview)
      .mockRejectedValueOnce(new Error('old error'))
      .mockReturnValueOnce(pending.promise);
    const otherPlanOccurrence = {
      ...occurrence,
      occurrenceId: 'plan-b:2026-10-01',
      payment: { ...occurrence.payment, id: 'plan-b' as PlannedPaymentId },
    };
    const { result, rerender } = renderHook(
      ({ id }: { id: WorkplaceId }) => {
        setWorkplace(id);
        return usePlannedListRecord(() => true);
      },
      { initialProps: { id: workplaceId } },
    );
    await act(async () => result.current.recordOccurrence(otherPlanOccurrence));
    expect(result.current.errors[otherPlanOccurrence.occurrenceId]).toBeTruthy();
    act(() => {
      void result.current.recordOccurrence(occurrence);
    });
    expect(result.current.pendingPlanIds.has(occurrence.payment.id)).toBe(true);

    const workplaceB = 'workplace-b' as WorkplaceId;
    rerender({ id: workplaceB });
    expect(result.current.pendingIds.size).toBe(0);
    expect(result.current.pendingPlanIds.size).toBe(0);
    expect(result.current.errors).toEqual({});
    rerender({ id: workplaceId });
    await act(async () => pending.resolve());

    expect(result.current.pendingIds.size).toBe(0);
    expect(result.current.pendingPlanIds.size).toBe(0);
    expect(result.current.errors).toEqual({});
  });
});
