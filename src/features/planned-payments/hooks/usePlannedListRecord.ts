import { withPlannedPaymentFxReview } from '@/src/services/planned-payment/plannedPaymentFxReviewRequest';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import {
  postPlannedJournalOccurrence,
  postPlannedPaymentOccurrence,
} from '@/src/services/planned-payment/plannedPaymentOrchestration';
import type { PlannedPaymentListOccurrence } from '@/src/services/planned-payment/plannedPaymentReadService';
import { AppConfig } from '@/src/constants';
import type { WorkplaceId } from '@/src/types/ids';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Inline list recording state. A plan lock prevents two visible occurrences advancing one cursor. */
export function usePlannedListRecord(
  isOccurrenceCurrent: (occurrence: PlannedPaymentListOccurrence) => boolean,
) {
  const { workplaceId } = useWorkplace();
  const lockedPlans = useRef(new Set<string>());
  const currentWorkplace = useRef<WorkplaceId>(workplaceId);
  const previousWorkplace = useRef<WorkplaceId>(workplaceId);
  const generation = useRef(0);
  const mounted = useRef(true);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [pendingPlanIds, setPendingPlanIds] = useState<Set<string>>(() => new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    mounted.current = true;
    generation.current++;
    return () => {
      mounted.current = false;
    };
  }, []);
  useLayoutEffect(() => {
    currentWorkplace.current = workplaceId;
    generation.current++;
    if (previousWorkplace.current !== workplaceId) {
      previousWorkplace.current = workplaceId;
      setPendingIds(new Set());
      setPendingPlanIds(new Set());
      setErrors({});
    }
  }, [workplaceId]);
  const recordOccurrence = useCallback(
    async (occurrence: PlannedPaymentListOccurrence) => {
      const planId = occurrence.payment.id;
      if (!occurrence.canRecord || !isOccurrenceCurrent(occurrence)) return;
      const requestWorkplace = workplaceId;
      const requestGeneration = generation.current;
      if (currentWorkplace.current !== requestWorkplace) return;
      const lockKey = `${requestWorkplace}:${planId}`;
      if (lockedPlans.current.has(lockKey)) return;
      lockedPlans.current.add(lockKey);
      setPendingIds(current => new Set(current).add(occurrence.occurrenceId));
      setPendingPlanIds(current => new Set(current).add(planId));
      setErrors(current => {
        const next = { ...current };
        delete next[occurrence.occurrenceId];
        return next;
      });

      try {
        await withPlannedPaymentFxReview(review => {
          if (occurrence.journalId) {
            return review
              ? postPlannedJournalOccurrence(
                  requestWorkplace,
                  planId,
                  occurrence.journalId,
                  occurrence.date,
                  review,
                )
              : postPlannedJournalOccurrence(
                  requestWorkplace,
                  planId,
                  occurrence.journalId,
                  occurrence.date,
                );
          }
          return review
            ? postPlannedPaymentOccurrence(requestWorkplace, planId, occurrence.date, review)
            : postPlannedPaymentOccurrence(requestWorkplace, planId, occurrence.date);
        });
      } catch {
        if (
          mounted.current &&
          currentWorkplace.current === requestWorkplace &&
          generation.current === requestGeneration &&
          isOccurrenceCurrent(occurrence)
        ) {
          setErrors(current => ({
            ...current,
            [occurrence.occurrenceId]: AppConfig.strings.plannedListRedesign.recordError,
          }));
        }
      } finally {
        lockedPlans.current.delete(lockKey);
        if (
          mounted.current &&
          currentWorkplace.current === requestWorkplace &&
          generation.current === requestGeneration
        ) {
          setPendingIds(current => {
            const next = new Set(current);
            next.delete(occurrence.occurrenceId);
            return next;
          });
          setPendingPlanIds(current => {
            const next = new Set(current);
            next.delete(planId);
            return next;
          });
        }
      }
    },
    [isOccurrenceCurrent, setErrors, setPendingIds, setPendingPlanIds, workplaceId],
  );

  return { recordOccurrence, pendingIds, pendingPlanIds, errors };
}
