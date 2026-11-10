import type { PlannedPaymentFxReview } from '@/src/services/planned-payment/plannedPaymentFx';
import { withPlannedPaymentFxReview } from '@/src/services/planned-payment/plannedPaymentFxReviewRequest';
import {
  postPlannedJournalOccurrence,
  postPlannedPaymentOccurrence,
  type PlannedJournalPostOptions,
  type PostPlannedOccurrenceResult,
} from '@/src/services/planned-payment/plannedPaymentOrchestration';
import type { JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';

export async function recordPlannedOccurrenceWithFxReview(
  workplaceId: WorkplaceId,
  planId: PlannedPaymentId,
  occurrenceDate: number,
  journalId?: JournalId,
  options?: PlannedJournalPostOptions,
): Promise<false | PostPlannedOccurrenceResult> {
  const post = (review?: PlannedPaymentFxReview) =>
    journalId
      ? postPlannedJournalOccurrence(
          workplaceId,
          planId,
          journalId,
          occurrenceDate,
          review,
          options,
        )
      : postPlannedPaymentOccurrence(workplaceId, planId, occurrenceDate, review, options);
  let last: PostPlannedOccurrenceResult | undefined;
  const completed = await withPlannedPaymentFxReview(async review => {
    last = await post(review);
  });
  if (!completed) return false;
  return last ?? { status: 'posted' };
}
