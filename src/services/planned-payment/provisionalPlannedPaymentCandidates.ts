/**
 * Provisional, matcher-free candidate types for evidence-driven planned payment
 * settlement (plan slice 5). These describe plan-linked PLANNED/POSTED occurrence
 * candidates and soft-match occurrence candidates so inbox merge and plan UI can be
 * wired before the shared movement matcher core lands.
 *
 * This module intentionally contains NO matcher logic and NO persistence. The
 * resolver is a stub that returns an empty list until the matcher is implemented.
 */

export type ProvisionalPlannedPaymentCandidateKind = 'planned' | 'posted' | 'projected';

export interface ProvisionalPlannedPaymentCandidate {
  /** Stable id for modal selection (F-16). */
  id: string;
  plannedPaymentId: string;
  /** Journal id when the candidate is backed by a real journal. */
  journalId?: string;
  kind: ProvisionalPlannedPaymentCandidateKind;
  /** True when the candidate journal carries a planned_payment_id link. */
  isPlanLinked: boolean;
  /** True when the candidate represents a POSTED (claiming) journal. */
  isPosted: boolean;
  /** Occurrence day (epoch ms, start of local day). */
  occurrenceDate: number;
  amount?: number;
  currencyCode?: string;
  /** Soft-match flag (review only; never auto-links). */
  softMatch?: boolean;
  softMatchReasons?: readonly string[];
}

export interface ProvisionalPlannedPaymentCandidateQuery {
  workplaceId: string;
  plannedPaymentId?: string;
  inboxItemId?: string;
}

/**
 * Stub resolver. Returns no candidates until the shared movement matcher is
 * implemented. Callers must treat an empty result as "no candidate".
 */
export function resolveProvisionalPlannedPaymentCandidates(
  _query: ProvisionalPlannedPaymentCandidateQuery,
): ProvisionalPlannedPaymentCandidate[] {
  return [];
}
