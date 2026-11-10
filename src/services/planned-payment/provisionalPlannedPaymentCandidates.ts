/** Plan-linked / soft-match candidate shapes for plan and inbox UI. */

export type ProvisionalPlannedPaymentCandidateKind = 'planned' | 'posted' | 'projected';

export interface ProvisionalPlannedPaymentCandidate {
  /** Stable id for modal selection (F-16). */
  id: string;
  plannedPaymentId: string;
  /** Capture (or other posted) journal offered as the link target. */
  journalId?: string;
  /** Existing PLANNED occurrence journal to retire, when already generated. */
  plannedOccurrenceJournalId?: string;
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
