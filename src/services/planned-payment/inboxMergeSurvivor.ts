import type { ProvisionalPlannedPaymentCandidate } from './provisionalPlannedPaymentCandidates';

/**
 * Dual-POSTED collapse survivor rule (spec: prefer the sole plan-linked journal
 * when exactly one candidate carries a Planned Payment link).
 */
export function chooseDualPostedSurvivor(
  candidates: readonly ProvisionalPlannedPaymentCandidate[],
): ProvisionalPlannedPaymentCandidate | null {
  const posted = candidates.filter(candidate => candidate.isPosted || candidate.kind === 'posted');
  if (posted.length === 0) return candidates[0] ?? null;
  if (posted.length === 1) return posted[0];
  const planLinked = posted.filter(candidate => candidate.isPlanLinked);
  if (planLinked.length === 1) return planLinked[0];
  return posted[0];
}
