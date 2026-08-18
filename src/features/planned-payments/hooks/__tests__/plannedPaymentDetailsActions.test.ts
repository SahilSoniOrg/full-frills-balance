import {
  PlannedPaymentInterval,
  PlannedPaymentStatus,
  type PlainPlannedPayment,
} from '@/src/types/domain';
import { confirm } from '@/src/utils/alerts';
import { buildPlannedPaymentDetailsActions } from '../plannedPaymentDetailsActions';

jest.mock('@/src/utils/alerts', () => ({
  confirm: { show: jest.fn() },
}));

describe('plannedPaymentDetailsActions', () => {
  const item = {
    amount: 125,
    currencyCode: 'USD',
    nextOccurrence: new Date('2026-08-15T00:00:00Z').getTime(),
    intervalN: 1,
    intervalType: PlannedPaymentInterval.MONTHLY,
    status: PlannedPaymentStatus.ACTIVE,
  } as PlainPlannedPayment;
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

    actions.onPost();
    expect(confirm.show).toHaveBeenLastCalledWith(
      expect.objectContaining({ onConfirm: handlers.handlePostNow }),
    );

    actions.onSkip();
    expect(confirm.show).toHaveBeenLastCalledWith(
      expect.objectContaining({ onConfirm: handlers.handleSkip, destructive: true }),
    );
  });

  it('masks the post confirmation amount when privacy mode is on', () => {
    const actions = buildPlannedPaymentDetailsActions(item, handlers, { isPrivacyMode: true });

    actions.onPost();
    const call = (confirm.show as jest.Mock).mock.calls.at(-1)?.[0];
    expect(call.message).toContain('\u2022\u2022\u2022\u2022');
    expect(call.message).not.toContain('125');
  });
});
