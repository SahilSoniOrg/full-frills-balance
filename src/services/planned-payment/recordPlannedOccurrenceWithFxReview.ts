import type { PlannedPaymentFxReview } from '@/src/services/planned-payment/plannedPaymentFx';
import { withPlannedPaymentFxReview } from '@/src/services/planned-payment/plannedPaymentFxReviewRequest';
import {
  postPlannedJournalOccurrence,
  postPlannedPaymentOccurrence,
} from '@/src/services/planned-payment/plannedPaymentOrchestration';
import type { JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';

export async function recordPlannedOccurrenceWithFxReview(
  workplaceId: WorkplaceId,
  planId: PlannedPaymentId,
  occurrenceDate: number,
  journalId?: JournalId,
): Promise<boolean | void> {
  const post = (review?: PlannedPaymentFxReview) =>
    journalId
      ? review
        ? postPlannedJournalOccurrence(workplaceId, planId, journalId, occurrenceDate, review)
        : postPlannedJournalOccurrence(workplaceId, planId, journalId, occurrenceDate)
      : review
        ? postPlannedPaymentOccurrence(workplaceId, planId, occurrenceDate, review)
        : postPlannedPaymentOccurrence(workplaceId, planId, occurrenceDate);
  return withPlannedPaymentFxReview(post);
}
