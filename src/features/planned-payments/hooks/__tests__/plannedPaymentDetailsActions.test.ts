import { PlannedPaymentInterval, PlannedPaymentStatus } from '@/src/types/enums';
import { type PlainPlannedPayment } from '@/src/types/plainDtos';
import { confirm } from '@/src/utils/alerts';
import {
  buildPlannedPaymentDetailsActions,
  resolvePlannedPaymentActionTarget,
} from '../plannedPaymentDetailsActions';

jest.mock('@/src/utils/alerts', () => ({
  confirm: { show: jest.fn() },
}));

describe('plannedPaymentDetailsActions', () => {
  const item = {
    amount: 125,
    currencyCode: 'USD',
    nextOccurrence: new Date('2026-08-15T00:00:00Z').getTime(),
    nextDueOccurrence: new Date('2026-08-15T00:00:00Z').getTime(),
    intervalN: 1,
    intervalType: PlannedPaymentInterval.MONTHLY,
    status: PlannedPaymentStatus.ACTIVE,
  } as PlainPlannedPayment & { nextDueOccurrence: number };
  const handlers = {
    handleEdit: jest.fn(),
    handleDelete: jest.fn().mockResolvedValue(undefined),
    handlePostNow: jest.fn().mockResolvedValue(undefined),
    handleSkip: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => jest.clearAllMocks());

  it('builds delete, post, and skip confirmations with service callbacks', () => {
    const actions = buildPlannedPaymentDetailsActions(item, handlers);

    actions.headerActions.onDelete();
    expect(confirm.show).toHaveBeenLastCalledWith(
      expect.objectContaining({ onConfirm: handlers.handleDelete, destructive: true }),
    );

    actions.onPost?.();
    expect(confirm.show).toHaveBeenLastCalledWith(
      expect.objectContaining({ onConfirm: handlers.handlePostNow }),
    );

    actions.onSkip?.();
    expect(confirm.show).toHaveBeenLastCalledWith(
      expect.objectContaining({ onConfirm: handlers.handleSkip, destructive: true }),
    );
  });

  it('masks the post confirmation amount when privacy mode is on', () => {
    const actions = buildPlannedPaymentDetailsActions(item, handlers, { isPrivacyMode: true });

    actions.onPost?.();
    const call = (confirm.show as jest.Mock).mock.calls.at(-1)?.[0];
    expect(call.message).toContain('\u2022\u2022\u2022\u2022');
    expect(call.message).not.toContain('125');
  });

  it('does not expose post or skip actions without an actionable projected date', () => {
    const actions = buildPlannedPaymentDetailsActions(
      { ...item, nextDueOccurrence: undefined },
      handlers,
    );
    expect(actions.onPost).toBeUndefined();
    expect(actions.onSkip).toBeUndefined();
  });

  it('targets a completed unpaid generated occurrence instead of the later raw cursor', () => {
    const projectedEarlierDate = new Date('2026-08-01T00:00:00Z').getTime();
    const rawCursor = new Date('2026-09-01T00:00:00Z').getTime();
    const target = resolvePlannedPaymentActionTarget({
      status: PlannedPaymentStatus.COMPLETED,
      nextDueOccurrence: projectedEarlierDate,
      outstandingJournalId: 'generated-journal' as never,
    });
    expect(target).toEqual({
      occurrenceDate: projectedEarlierDate,
      journalId: 'generated-journal',
    });
    expect(projectedEarlierDate).toBeLessThan(rawCursor);
    const actions = buildPlannedPaymentDetailsActions(
      {
        ...item,
        status: PlannedPaymentStatus.COMPLETED,
        nextOccurrence: rawCursor,
        nextDueOccurrence: projectedEarlierDate,
      },
      handlers,
    );
    expect(actions.onPost).toBeDefined();
    expect(actions.onSkip).toBeDefined();
    actions.onPost?.();
    expect(confirm.show).toHaveBeenLastCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(new Date(projectedEarlierDate).toLocaleDateString()),
      }),
    );
    expect((confirm.show as jest.Mock).mock.calls.at(-1)?.[0].message).not.toContain('advance');
  });
});
