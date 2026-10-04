import {
  PlannedPaymentFxReviewRequiredError,
  type PlannedPaymentFxReview,
  type PlannedPaymentFxReviewRequest,
} from './plannedPaymentFx';

type ReviewListener = (
  request: Readonly<PlannedPaymentFxReviewRequest>,
  finish: (review: PlannedPaymentFxReview | null) => void,
) => void;
let listener: ReviewListener | null = null;

/** One app-level review surface serves list, schedule, dashboard and journal posting. */
export function registerPlannedPaymentFxReviewListener(next: ReviewListener) {
  listener = next;
  return () => {
    if (listener === next) listener = null;
  };
}

export async function withPlannedPaymentFxReview(
  operation: (review?: PlannedPaymentFxReview) => Promise<unknown>,
): Promise<boolean> {
  try {
    await operation();
    return true;
  } catch (error) {
    if (!(error instanceof PlannedPaymentFxReviewRequiredError)) throw error;
    const showReview = listener;
    if (!showReview)
      throw new Error('Payment review is unavailable. Reopen the payment and try again.');
    const review = await new Promise<PlannedPaymentFxReview | null>(resolve =>
      showReview(error.request, resolve),
    );
    if (!review) return false;
    await operation(review);
    return true;
  }
}
