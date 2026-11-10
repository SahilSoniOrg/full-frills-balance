import type { AccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import {
  journalAlreadyHasCaptureSource,
  stageLinkedCaptureSource,
} from '@/src/data/repositories/journal/captureSourceLinkStaging';
import { findActiveJournal } from '@/src/data/repositories/journal/journalPersistenceSupport';
import { EVIDENCE_SETTLE_AUDIT_SOURCE } from '@/src/data/repositories/journal/journalPlanAttachOperations';
import type { JournalPersistenceResult } from '@/src/data/repositories/journal/journalPersistenceTypes';
import type { CaptureAccountEvidence } from '@/src/domain/transaction-intelligence/captureDecision';
import type { CaptureSourceObservation } from '@/src/domain/transaction-intelligence/captureMetadata';
import {
  decideCapture,
  type CaptureObservation,
  type CapturePolicy,
} from '@/src/domain/transaction-intelligence/decideCapture';
import type {
  MovementChannel,
  MovementObservation,
  MovementOccurrence,
} from '@/src/domain/planned-payment/sharedMovementMatcher';
import { JournalStatus } from '@/src/types/enums';
import type { JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import { settlePlannedOccurrence } from './plannedOccurrenceSettlement';
import {
  createRepositorySharedMovementMatchLoader,
  findSharedMovementMatch,
  type SharedMovementMatchLoader,
} from './sharedMovementMatcher';

/**
 * Call findSharedMovementMatch (and any settle/link writes) inside the caller's
 * `runAccountingWriteSession`. Spec Concurrency: re-validate candidates in-session
 * before mutation so capture and plan auto-post cannot dual-mint on one device.
 */
export type EvidenceDrivenObservationDisposition =
  | { kind: 'passthrough' }
  | {
      kind: 'settled';
      journalId: JournalId;
      journalResult: JournalPersistenceResult;
      occurrence: MovementOccurrence;
    }
  | {
      kind: 'linked';
      journalId: JournalId;
      occurrence: MovementOccurrence;
      silentAttach: true;
      /**
       * Hard reference identity: settlement already ran the capture link path
       * (or confirmed it was already linked). Callers must not stage again.
       */
      hardIdentity?: true;
    }
  | {
      kind: 'review';
      reason: string;
      /** Soft / conflict / ambiguous / same-channel → flag duplicate-style review. */
      flagDuplicate: boolean;
      blockCaptureAutoPost: true;
      matchKind: 'soft' | 'conflict' | 'ambiguous' | 'reviewSameChannel' | 'strictUnique';
    };

export interface EvidenceDrivenObservationSettlementInput {
  session: AccountingWriteSession;
  workplaceId: WorkplaceId;
  observation: MovementObservation;
  /** Inputs for the shared capture posting gate (`decideCapture`). */
  captureGate: {
    observation: CaptureObservation;
    accounts: CaptureAccountEvidence;
    policy: CapturePolicy;
    now?: number;
  };
  /** Defaults to the repository-backed loader for `workplaceId`. */
  loader?: SharedMovementMatchLoader;
}

function ungeneratedOccurrenceId(occurrence: MovementOccurrence): boolean {
  return occurrence.id.startsWith('plan:');
}

function reviewReason(kind: 'soft' | 'conflict' | 'ambiguous' | 'reviewSameChannel'): string {
  switch (kind) {
    case 'reviewSameChannel':
      return 'A planned payment already has a matching observation from this channel. Review before linking.';
    case 'conflict':
      return 'This observation conflicts with a planned payment structure. Review before posting.';
    case 'soft':
      return 'This observation soft-matches a planned payment. Review before posting.';
    case 'ambiguous':
      return 'Multiple planned payments could match this observation. Review before posting.';
  }
}

function captureSourceFromGate(observation: CaptureObservation): CaptureSourceObservation {
  return {
    ...observation.source,
    merchant: observation.source.merchant ?? observation.merchant,
  };
}

function hardLinkedOccurrence(
  journalId: JournalId,
  observation: MovementObservation,
): MovementOccurrence {
  return {
    id: journalId,
    planId: '',
    status: 'active',
    date: observation.date,
    intervalDays: 1,
    amount: observation.amount,
    currency: observation.currency,
    accountId: observation.accountId,
    direction: observation.direction === 'unknown' ? 'debit' : observation.direction,
  };
}

/**
 * Spec: unique hard reference match → link observation; do not create a second journal.
 * This is existing capture reference-link behavior — no `decideCapture` gate.
 * Idempotent when the observation is already on that journal; otherwise stages via
 * `stageLinkedCaptureSource` (same path as SMS/Gmail cross-source link).
 */
async function linkHardIdentity(params: {
  session: AccountingWriteSession;
  workplaceId: WorkplaceId;
  journalId: JournalId;
  observation: MovementObservation;
  captureSource: CaptureSourceObservation;
}): Promise<EvidenceDrivenObservationDisposition> {
  const { session, workplaceId, journalId, observation, captureSource } = params;
  const alreadyLinked = await journalAlreadyHasCaptureSource(workplaceId, journalId, captureSource);
  if (!alreadyLinked) {
    await stageLinkedCaptureSource(session, workplaceId, journalId, captureSource);
  }
  return {
    kind: 'linked',
    journalId,
    occurrence: hardLinkedOccurrence(journalId, observation),
    silentAttach: true,
    hardIdentity: true,
  };
}

async function settleStrictUnique(params: {
  session: AccountingWriteSession;
  workplaceId: WorkplaceId;
  observation: MovementObservation;
  occurrence: MovementOccurrence;
  silentAttach: boolean;
}): Promise<EvidenceDrivenObservationDisposition> {
  const { session, workplaceId, observation, occurrence, silentAttach } = params;

  if (silentAttach) {
    const claiming = await findActiveJournal(occurrence.id as JournalId, workplaceId);
    if (!claiming || claiming.status !== JournalStatus.POSTED || !claiming.plannedPaymentId) {
      return { kind: 'passthrough' };
    }
    return {
      kind: 'linked',
      journalId: claiming.id,
      occurrence,
      silentAttach: true,
    };
  }

  if (ungeneratedOccurrenceId(occurrence)) {
    const settlement = await settlePlannedOccurrence(
      session,
      workplaceId,
      occurrence.planId as PlannedPaymentId,
      occurrence.date,
      {
        kind: 'post',
        postedAt: observation.date,
        auditMetadata: { source: EVIDENCE_SETTLE_AUDIT_SOURCE, undoable: true },
      },
    );
    if (!settlement.journal) return { kind: 'passthrough' };
    return {
      kind: 'settled',
      journalId: settlement.journal.journal.id,
      journalResult: settlement.journal,
      occurrence,
    };
  }

  const planned = await findActiveJournal(occurrence.id as JournalId, workplaceId);
  if (!planned) return { kind: 'passthrough' };

  if (planned.status === JournalStatus.POSTED && planned.plannedPaymentId) {
    // Matcher said unique without silentAttach — still link when already posted.
    return {
      kind: 'linked',
      journalId: planned.id,
      occurrence,
      silentAttach: true,
    };
  }

  if (planned.status !== JournalStatus.PLANNED) return { kind: 'passthrough' };

  const settlement = await settlePlannedOccurrence(
    session,
    workplaceId,
    (planned.plannedPaymentId ?? occurrence.planId) as PlannedPaymentId,
    occurrence.date,
    {
      kind: 'post',
      postedAt: observation.date,
      journalId: planned.id,
      auditMetadata: { source: EVIDENCE_SETTLE_AUDIT_SOURCE, undoable: true },
    },
  );
  if (!settlement.journal) return { kind: 'passthrough' };
  return {
    kind: 'settled',
    journalId: settlement.journal.journal.id,
    journalResult: settlement.journal,
    occurrence,
  };
}

/**
 * Evidence-driven observation settlement for SMS/Gmail capture writers.
 *
 * Posting gate: unattended settle only when `decideCapture` would post.
 * Soft / conflict / FX-as-soft / ambiguous / same-channel → block capture auto-post.
 * Strict unique → settle PLANNED / mint ungenerated / silent-attach claiming POSTED.
 * Hard reference → existing capture link path (no decideCapture); see `linkHardIdentity`.
 */
export async function applyEvidenceDrivenObservationSettlement(
  input: EvidenceDrivenObservationSettlementInput,
): Promise<EvidenceDrivenObservationDisposition> {
  const { session, workplaceId, observation, captureGate } = input;
  if (
    !Number.isFinite(observation.amount) ||
    observation.amount <= 0 ||
    !observation.currency ||
    !observation.accountId
  ) {
    return { kind: 'passthrough' };
  }

  const loader = input.loader ?? createRepositorySharedMovementMatchLoader(workplaceId);
  // Re-validate inside the caller's accounting write session before any mutation.
  const match = await findSharedMovementMatch(observation, loader);

  if (
    match.kind === 'soft' ||
    match.kind === 'conflict' ||
    match.kind === 'ambiguous' ||
    match.kind === 'reviewSameChannel'
  ) {
    return {
      kind: 'review',
      reason: reviewReason(match.kind),
      flagDuplicate: true,
      blockCaptureAutoPost: true,
      matchKind: match.kind,
    };
  }

  if (match.kind === 'hard') {
    const journalId = match.candidates[0]?.id as JournalId | undefined;
    if (!journalId) return { kind: 'passthrough' };
    return linkHardIdentity({
      session,
      workplaceId,
      journalId,
      observation,
      captureSource: captureSourceFromGate(captureGate.observation),
    });
  }

  if (match.kind !== 'strictUnique') return { kind: 'passthrough' };

  const gate = decideCapture(
    captureGate.observation,
    captureGate.accounts,
    captureGate.policy,
    captureGate.now ?? Date.now(),
  );
  if (gate.kind !== 'post') {
    // Gate failed: never evidence-settle; still offer the occurrence in review.
    return {
      kind: 'review',
      reason: gate.reason ?? 'A planned payment matches this observation. Review before posting.',
      flagDuplicate: false,
      blockCaptureAutoPost: true,
      matchKind: 'strictUnique',
    };
  }

  return settleStrictUnique({
    session,
    workplaceId,
    observation,
    occurrence: match.occurrence,
    silentAttach: match.silentAttach,
  });
}

export function movementObservationFromCapture(params: {
  id: string;
  channel: MovementChannel;
  amount: number;
  currency: string;
  accountId: string;
  direction: MovementObservation['direction'];
  date: number;
  reference?: string | null;
  economicKind?: string | null;
}): MovementObservation {
  return {
    id: params.id,
    channel: params.channel,
    amount: params.amount,
    currency: params.currency,
    accountId: params.accountId,
    direction: params.direction,
    date: params.date,
    reference: params.reference ?? null,
    economicKind: params.economicKind ?? null,
  };
}
