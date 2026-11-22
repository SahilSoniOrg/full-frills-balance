import type PlannedPayment from '@/src/data/models/PlannedPayment';
import Journal from '@/src/data/models/Journal';
import type { JournalPersistenceResult } from '@/src/data/repositories/journal/journalPersistenceTypes';
import type { AuditEventMetadata } from '@/src/types/auditEvents';
import { PlannedPaymentStatus } from '@/src/types/enums';
import { JournalId, PlannedPaymentId } from '@/src/types/ids';
import {
  endOfLocalDay,
  normalizeToStartOfDay,
} from '@/src/services/planned-payment/plannedPaymentRecurrence';
import type {
  PlannedPaymentFxReview,
} from './plannedPaymentFx';

export type PlannedOccurrenceAction =
  | { kind: 'generate'; asOf: number }
  | { kind: 'autoPostDue'; asOf: number; journalId: JournalId }
  | {
      kind: 'post';
      postedAt: number;
      journalId?: JournalId;
      review?: PlannedPaymentFxReview;
      auditMetadata?: AuditEventMetadata;
      expectedCurrent?: Record<string, unknown>;
      /** User confirmed Post after "link instead?" — skip returning the capture candidate. */
      confirmPostDespiteCandidate?: boolean;
    }
  | { kind: 'skip' };

/** Capture journal the user may link instead of posting the PLANNED occurrence. */
export interface PlanCaptureAttachCandidate {
  captureJournalId: JournalId;
  plannedJournalId?: JournalId;
  matchKind: 'strict' | 'soft' | 'ambiguous';
  occurrenceDay: number;
  amount?: number;
  currencyCode?: string;
}

export interface PlannedOccurrenceSettlement {
  journal: JournalPersistenceResult | null;
  nextOccurrence: number;
  completed: boolean;
  /** Present when user `post` finds a capture candidate and does not silent-attach. */
  attachCandidate?: PlanCaptureAttachCandidate;
}

export interface OccurrenceDay {
  dayStart: number;
  dayEnd: number;
}

export function occurrenceDay(occurrenceDate: number): OccurrenceDay {
  const dayStart = normalizeToStartOfDay(occurrenceDate);
  return { dayStart, dayEnd: endOfLocalDay(dayStart) };
}

export type AppliedOccurrenceAction = {
  journal: JournalPersistenceResult | null;
  attachCandidate?: PlanCaptureAttachCandidate;
};

export type OccurrenceTransition =
  | { kind: 'generateClaimed' }
  | { kind: 'generateNew'; action: Extract<PlannedOccurrenceAction, { kind: 'generate' }> }
  | {
      kind: 'generateExisting';
      action: Extract<PlannedOccurrenceAction, { kind: 'generate' }>;
      journals: Journal[];
    }
  | { kind: 'autoPostNoop' }
  | {
      kind: 'autoPost';
      action: Extract<PlannedOccurrenceAction, { kind: 'autoPostDue' }>;
      journal: Journal;
    }
  | { kind: 'settled'; journalId: JournalId }
  | { kind: 'skipNew'; action: Extract<PlannedOccurrenceAction, { kind: 'skip' }> }
  | {
      kind: 'skipExisting';
      action: Extract<PlannedOccurrenceAction, { kind: 'skip' }>;
      journals: Journal[];
    }
  | { kind: 'postNew'; action: Extract<PlannedOccurrenceAction, { kind: 'post' }> }
  | {
      kind: 'postExisting';
      action: Extract<PlannedOccurrenceAction, { kind: 'post' }>;
      journals: Journal[];
    };

export type PlanAttachTransition =
  { kind: 'none' } | { kind: 'hold' } | { kind: 'attached'; journal: JournalPersistenceResult };

export function assertActive(payment: PlannedPayment): void {
  if (payment.status !== PlannedPaymentStatus.ACTIVE) {
    throw new Error(`Planned payment ${payment.id} is not active (status: ${payment.status})`);
  }
}

export function occurrenceSettledError(
  plannedPaymentId: PlannedPaymentId,
  journalId: JournalId,
): Error {
  return new Error(
    `Planned payment ${plannedPaymentId} already has a journal for this occurrence (${journalId})`,
  );
}
