import {
  PlannedPaymentFxReviewRequiredError,
  type PlannedPaymentFxReviewRequest,
} from '../plannedPaymentFx';
import {
  registerPlannedPaymentFxReviewListener,
  withPlannedPaymentFxReview,
} from '../plannedPaymentFxReviewRequest';
import { asAccountId, asPlannedPaymentId, asWorkplaceId } from '@/src/types/ids';

const request: PlannedPaymentFxReviewRequest = {
  name: 'Transfer',
  sourceAmount: 100,
  destinationAmount: 100,
  sourceCurrency: 'USD',
  destinationCurrency: 'INR',
  fromAccountId: asAccountId('usd'),
  toAccountId: asAccountId('inr'),
  workplaceId: asWorkplaceId('workplace'),
  plannedPaymentId: asPlannedPaymentId('plan'),
  occurrenceDate: 1791158400000,
  planVersion: 'template',
  occurrenceVersion: 'occurrence',
};

describe('planned payment posting review handshake', () => {
  it('runs ordinary posting once without requesting review', async () => {
    const operation = jest.fn().mockResolvedValue(undefined);
    await expect(withPlannedPaymentFxReview(operation)).resolves.toBe(true);
    expect(operation).toHaveBeenCalledTimes(1);
  });
  it('retries only after receiving the reviewed amounts', async () => {
    const review = { ...request, sourceAmount: 120, destinationAmount: 85 };
    const unregister = registerPlannedPaymentFxReviewListener((shown, finish) => {
      expect(shown).toEqual(request);
      finish(review);
    });
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new PlannedPaymentFxReviewRequiredError(request))
      .mockResolvedValueOnce(undefined);
    try {
      await expect(withPlannedPaymentFxReview(operation)).resolves.toBe(true);
      expect(operation.mock.calls).toEqual([[], [review]]);
    } finally {
      unregister();
    }
  });
  it('cancels without retrying or reporting success', async () => {
    const unregister = registerPlannedPaymentFxReviewListener((_shown, finish) => finish(null));
    const operation = jest.fn().mockRejectedValue(new PlannedPaymentFxReviewRequiredError(request));
    try {
      await expect(withPlannedPaymentFxReview(operation)).resolves.toBe(false);
      expect(operation).toHaveBeenCalledTimes(1);
    } finally {
      unregister();
    }
  });
  it('preserves failures after review and unrelated posting errors', async () => {
    const unregister = registerPlannedPaymentFxReviewListener((_shown, finish) =>
      finish({ ...request, destinationAmount: 85 }),
    );
    const stale = new Error('Review is stale');
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new PlannedPaymentFxReviewRequiredError(request))
      .mockRejectedValueOnce(stale);
    try {
      await expect(withPlannedPaymentFxReview(operation)).rejects.toBe(stale);
      await expect(withPlannedPaymentFxReview(() => Promise.reject(stale))).rejects.toBe(stale);
    } finally {
      unregister();
    }
  });
});
