import { AppConfig } from '@/src/constants';
import { MetadataKeys, MetadataSources } from '@/src/constants/ledger-constants';
import type PlannedPayment from '@/src/data/models/PlannedPayment';

import { assertExpectedJournalSnapshot } from '@/src/data/repositories/journal/journalAuditGuard';
import type { AuditEventMetadata } from '@/src/types/auditEvents';
import {
  readPlannedPaymentFxContext,
  resolvePlannedPaymentFxAmounts,
  plannedPaymentFxMetadata,
  plannedPaymentFxMode,
  type PlannedPaymentFxReview,
  type PlannedPaymentFxQuote,
} from './plannedPaymentFx';
import type { AccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import { accountQueryRepository } from '@/src/data/repositories/account/AccountQueryRepository';
import { journalPersistenceRepository } from '@/src/data/repositories/journal/JournalPersistenceRepository';
import type { JournalPersistenceResult } from '@/src/data/repositories/journal/journalPersistenceTypes';
import type { PlannedOccurrenceJournals } from '@/src/data/repositories/journal/JournalPlannedQueries';
import { journalPlannedQueries } from '@/src/data/repositories/journal/JournalPlannedQueries';
import { smsJournalQueries } from '@/src/data/repositories/journal/SmsJournalQueries';
import Journal from '@/src/data/models/Journal';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import {
  buildPlannedPaymentTransferLines,
  buildPlannedPaymentFxLines,
} from '@/src/services/planned-payment/plannedPaymentJournalLines';
import {
  calculateNextOccurrence,
  normalizeToStartOfDay,
} from '@/src/services/planned-payment/plannedPaymentRecurrence';
import { attachCaptureJournalToPlannedOccurrenceInSession } from '@/src/services/planned-payment/plannedPaymentPlanAttach';
import { classifyPlannedPaymentDirection } from '@/src/services/planned-payment/plannedPaymentReadService';
import { requirePlannedPayment } from '@/src/services/planned-payment/plannedPaymentWorkplace';
import {
  JournalStatus,
  PlannedPaymentInterval,
  PlannedPaymentStatus,
  TransactionType,
} from '@/src/types/enums';
import {
  matchSharedMovement,
  MOVEMENT_MATCH_WINDOWS,
  type ExistingMovement,
  type MovementObservation,
  type MovementOccurrence,
} from '@/src/domain/planned-payment/sharedMovementMatcher';
import { JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import { generator } from '@/src/data/database/idGenerator';
import { logger } from '@/src/utils/logger';

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

interface OccurrenceDay {
  dayStart: number;
  dayEnd: number;
}

function occurrenceDay(occurrenceDate: number): OccurrenceDay {
  const dayStart = normalizeToStartOfDay(occurrenceDate);
  return { dayStart, dayEnd: dayStart + (AppConfig.time.msPerDay - 1) };
}

function intervalDaysForPayment(payment: PlannedPayment): number {
  const n = Math.max(1, payment.intervalN || 1);
  switch (payment.intervalType) {
    case PlannedPaymentInterval.DAILY:
      return n;
    case PlannedPaymentInterval.WEEKLY:
      return n * 7;
    case PlannedPaymentInterval.YEARLY:
      return n * 365;
    case PlannedPaymentInterval.MONTHLY:
    default:
      return n * 30;
  }
}

/**
 * Dual-leg occurrence identity for plan→capture matching. Direction follows the
 * observation's visible account when it hits a known leg; otherwise classify.
 */
function resolvePlanOccurrenceLegs(
  payment: PlannedPayment,
  accountsById: Map<string, { accountType: string }>,
  visibleAccountId: string,
): { accountId: string; toAccountId: string; direction: 'debit' | 'credit' } {
  const accountId = payment.fromAccountId;
  const toAccountId = payment.toAccountId;
  if (visibleAccountId === payment.fromAccountId) {
    return { accountId, toAccountId, direction: 'debit' };
  }
  if (visibleAccountId === payment.toAccountId) {
    return { accountId, toAccountId, direction: 'credit' };
  }
  const fromType = accountsById.get(payment.fromAccountId)?.accountType as
    Parameters<typeof classifyPlannedPaymentDirection>[0] | undefined;
  const toType = accountsById.get(payment.toAccountId)?.accountType as
    Parameters<typeof classifyPlannedPaymentDirection>[1] | undefined;
  const flow = classifyPlannedPaymentDirection(fromType, toType);
  if (flow === 'inflow') return { accountId, toAccountId, direction: 'credit' };
  return { accountId, toAccountId, direction: 'debit' };
}

type CaptureMatch =
  | { kind: 'none' }
  | {
      kind: 'strict' | 'soft' | 'ambiguous';
      captureJournalId: JournalId;
      amount?: number;
      currencyCode?: string;
    };

/**
 * Match this occurrence against unlinked POSTED capture journals using both plan
 * legs. Strict unique → attach candidate; soft/ambiguous → review only.
 */
async function findCaptureMatchForOccurrence(
  payment: PlannedPayment,
  dayStart: number,
  asOf: number,
): Promise<CaptureMatch> {
  const today = normalizeToStartOfDay(asOf);
  const softHorizon = today + MOVEMENT_MATCH_WINDOWS.softDays * AppConfig.time.msPerDay;
  if (dayStart > softHorizon) return { kind: 'none' };

  const accounts = await accountQueryRepository.findAllByIds(payment.workplaceId, [
    payment.fromAccountId,
    payment.toAccountId,
  ]);
  const accountsById = new Map(accounts.map(account => [account.id, account]));
  const days = intervalDaysForPayment(payment);
  const windowMs =
    (MOVEMENT_MATCH_WINDOWS.softDays + MOVEMENT_MATCH_WINDOWS.strictDays) * AppConfig.time.msPerDay;
  // Do not exact-filter amount: soft matches need the ±5% band the matcher owns.
  const nearby = await smsJournalQueries.findUnlinkedPostedNear(
    { centerDate: dayStart, windowMs },
    payment.workplaceId,
  );
  if (nearby.length === 0) return { kind: 'none' };

  const nearbyIds = nearby.map(journal => journal.id);
  const transactions = await transactionQueryRepository.findByJournals(
    payment.workplaceId,
    nearbyIds,
  );
  const legAccountIds = new Set([payment.fromAccountId, payment.toAccountId]);

  let softOrAmbiguous: CaptureMatch | null = null;
  let strictId: JournalId | null = null;
  let strictMeta: { amount?: number; currencyCode?: string } = {};
  let strictCount = 0;

  for (const journal of nearby) {
    const legs = transactions.filter(
      tx => tx.journalId === journal.id && legAccountIds.has(tx.accountId),
    );
    if (legs.length === 0) continue;
    const leg = legs[0];
    const direction: MovementObservation['direction'] =
      leg.transactionType === TransactionType.CREDIT ? 'debit' : 'credit';
    const visibleAccountId = leg.accountId;
    const planLegs = resolvePlanOccurrenceLegs(payment, accountsById, visibleAccountId);
    const occurrence: MovementOccurrence = {
      id: `${payment.id}:${dayStart}`,
      planId: payment.id,
      status: 'active',
      date: dayStart,
      intervalDays: days,
      amount: payment.amount,
      currency: payment.currencyCode,
      accountId: planLegs.accountId,
      toAccountId: planLegs.toAccountId,
      direction: planLegs.direction,
    };
    const observation: MovementObservation = {
      id: journal.id,
      channel: 'sms',
      amount: journal.totalAmount,
      currency: journal.currencyCode,
      accountId: visibleAccountId,
      visibleAccountId,
      direction,
      date: journal.journalDate,
    };
    const captureJournals: ExistingMovement[] = nearby
      .filter(other => other.id !== journal.id)
      .flatMap(other => {
        const otherLegs = transactions.filter(
          tx => tx.journalId === other.id && legAccountIds.has(tx.accountId),
        );
        if (!otherLegs.length) return [];
        const otherLeg = otherLegs[0];
        return [
          {
            id: other.id,
            date: other.journalDate,
            amount: other.totalAmount,
            currency: other.currencyCode,
            accountId: otherLeg.accountId,
            direction:
              otherLeg.transactionType === TransactionType.CREDIT
                ? ('debit' as const)
                : ('credit' as const),
            linked: false,
            planLinked: false,
            status: 'posted' as const,
          },
        ];
      });
    const result = matchSharedMovement({
      observation,
      occurrences: [occurrence],
      pendingObservations: [],
      captureJournals,
      journals: [],
      today,
    });
    if (result.kind === 'strictUnique') {
      strictCount += 1;
      if (strictId === null) {
        strictId = journal.id;
        strictMeta = { amount: journal.totalAmount, currencyCode: journal.currencyCode };
      }
    } else if (
      result.kind === 'soft' ||
      result.kind === 'ambiguous' ||
      result.kind === 'conflict'
    ) {
      softOrAmbiguous = {
        kind: result.kind === 'conflict' ? 'ambiguous' : result.kind,
        captureJournalId: journal.id,
        amount: journal.totalAmount,
        currencyCode: journal.currencyCode,
      };
    }
  }

  if (strictCount === 1 && strictId) {
    return { kind: 'strict', captureJournalId: strictId, ...strictMeta };
  }
  if (strictCount > 1) {
    return {
      kind: 'ambiguous',
      captureJournalId: strictId!,
      ...strictMeta,
    };
  }
  if (softOrAmbiguous) return softOrAmbiguous;
  return { kind: 'none' };
}

/** UI/read helper: structured candidate for the "link instead?" prompt. */
export async function findPlanAttachCandidateForOccurrence(
  workplaceId: WorkplaceId,
  plannedPaymentId: PlannedPaymentId,
  occurrenceDate: number,
  asOf: number = Date.now(),
): Promise<PlanCaptureAttachCandidate | null> {
  const payment = await requirePlannedPayment(workplaceId, plannedPaymentId);
  const dayStart = normalizeToStartOfDay(occurrenceDate);
  const match = await findCaptureMatchForOccurrence(payment, dayStart, asOf);
  if (match.kind === 'none') return null;
  const day = occurrenceDay(occurrenceDate);
  const occurrence = await journalPlannedQueries.findOccurrenceJournals(
    workplaceId,
    payment.id,
    day.dayStart,
    day.dayEnd,
  );
  const plannedJournalId = occurrence.kind === 'planned' ? occurrence.journals[0]?.id : undefined;
  return {
    captureJournalId: match.captureJournalId,
    plannedJournalId,
    matchKind: match.kind,
    occurrenceDay: dayStart,
    amount: match.amount,
    currencyCode: match.currencyCode,
  };
}

async function attachCaptureUsingPlanService(
  session: AccountingWriteSession,
  payment: PlannedPayment,
  captureJournalId: JournalId,
  plannedJournalId: JournalId,
  occurrenceDayStart: number,
  correlationId: string,
): Promise<JournalPersistenceResult> {
  return attachCaptureJournalToPlannedOccurrenceInSession(
    session,
    payment.workplaceId,
    {
      captureJournalId,
      plannedPaymentId: payment.id,
      plannedJournalId,
      occurrenceDay: occurrenceDayStart,
    },
    { correlationId },
  );
}

function assertActive(payment: PlannedPayment): void {
  if (payment.status !== PlannedPaymentStatus.ACTIVE) {
    throw new Error(`Planned payment ${payment.id} is not active (status: ${payment.status})`);
  }
}

function occurrenceSettledError(plannedPaymentId: PlannedPaymentId, journalId: JournalId): Error {
  return new Error(
    `Planned payment ${plannedPaymentId} already has a journal for this occurrence (${journalId})`,
  );
}

export async function settlePlannedOccurrence(
  session: AccountingWriteSession,
  workplaceId: WorkplaceId,
  plannedPaymentId: PlannedPaymentId,
  occurrenceDate: number,
  action: PlannedOccurrenceAction,
  fxQuote?: PlannedPaymentFxQuote,
): Promise<PlannedOccurrenceSettlement> {
  const payment = await requirePlannedPayment(workplaceId, plannedPaymentId);
  if (action.kind === 'generate' || payment.status === PlannedPaymentStatus.PAUSED) {
    assertActive(payment);
  }
  if (action.kind === 'autoPostDue' && payment.status === PlannedPaymentStatus.PAUSED) {
    throw new Error(`Planned payment ${payment.id} is paused`);
  }
  const day = occurrenceDay(occurrenceDate);
  if (
    action.kind === 'generate' &&
    normalizeToStartOfDay(payment.nextOccurrence) !== day.dayStart
  ) {
    throw new Error('Planned payment changed while its occurrence was being processed');
  }

  const occurrence = await journalPlannedQueries.findOccurrenceJournals(
    workplaceId,
    payment.id,
    day.dayStart,
    day.dayEnd,
  );
  const correlationId = generator();
  const applied = await applyOccurrenceAction(
    session,
    payment,
    day,
    occurrence,
    action,
    correlationId,
    fxQuote,
  );
  if (applied.attachCandidate) {
    return {
      journal: null,
      nextOccurrence: payment.nextOccurrence,
      completed: false,
      attachCandidate: applied.attachCandidate,
    };
  }
  if (action.kind === 'autoPostDue' && !applied.journal && plannedPaymentFxMode(payment))
    return { journal: null, nextOccurrence: payment.nextOccurrence, completed: false };
  return {
    journal: applied.journal,
    ...(await advanceSchedule(session, payment, day.dayStart, correlationId)),
  };
}

type AppliedOccurrenceAction = {
  journal: JournalPersistenceResult | null;
  attachCandidate?: PlanCaptureAttachCandidate;
};

async function tryStrictPlanAttach(
  session: AccountingWriteSession,
  payment: PlannedPayment,
  dayStart: number,
  asOf: number,
  plannedJournalId: JournalId | undefined,
  correlationId: string,
): Promise<'attached' | 'hold' | 'none' | JournalPersistenceResult> {
  const capture = await findCaptureMatchForOccurrence(payment, dayStart, asOf);
  if (capture.kind === 'soft' || capture.kind === 'ambiguous') return 'hold';
  if (capture.kind !== 'strict') return 'none';
  if (!plannedJournalId) {
    // Mint a PLANNED twin then attach so upgrade/undo/audit stay on the real attach path.
    if (!payment.toAccountId) return 'hold';
    const minted = await journalPersistenceService.putInSession(
      session,
      {
        journalDate: dayStart,
        description: payment.name,
        currencyCode: payment.currencyCode,
        transactions: buildPlannedPaymentTransferLines(payment),
        status: JournalStatus.PLANNED,
        plannedPaymentId: payment.id,
      },
      payment.workplaceId,
      { source: 'system', correlationId, undoable: false },
    );
    return attachCaptureUsingPlanService(
      session,
      payment,
      capture.captureJournalId,
      minted.journal.id,
      dayStart,
      correlationId,
    );
  }
  return attachCaptureUsingPlanService(
    session,
    payment,
    capture.captureJournalId,
    plannedJournalId,
    dayStart,
    correlationId,
  );
}

async function applyOccurrenceAction(
  session: AccountingWriteSession,
  payment: PlannedPayment,
  { dayStart }: OccurrenceDay,
  occurrence: PlannedOccurrenceJournals,
  action: PlannedOccurrenceAction,
  correlationId: string,
  fxQuote?: PlannedPaymentFxQuote,
): Promise<AppliedOccurrenceAction> {
  if (action.kind === 'generate') {
    if (occurrence.kind !== 'none') {
      if (occurrence.kind === 'planned') {
        const attached = await tryStrictPlanAttach(
          session,
          payment,
          dayStart,
          action.asOf,
          occurrence.journals[0]?.id,
          correlationId,
        );
        if (attached === 'hold') return { journal: null };
        if (attached !== 'none' && attached !== 'attached') return { journal: attached };
        if (payment.isAutoPost && dayStart <= action.asOf) {
          const due = occurrence.journals[0];
          const context = await readPlannedPaymentFxContext(payment, dayStart, due);
          if (context && context.mode !== 'manual') {
            if (occurrence.journals.length !== 1)
              throw new Error('Multiple planned journals for this occurrence');
            return {
              journal: await postScheduledJournal(
                session,
                payment,
                due,
                dayStart,
                due.journalDate,
                correlationId,
                'system',
                fxQuote,
              ),
            };
          }
        }
      }
      return { journal: null };
    }
    // mint path
    const attached = await tryStrictPlanAttach(
      session,
      payment,
      dayStart,
      action.asOf,
      undefined,
      correlationId,
    );
    if (attached === 'hold') return { journal: null };
    if (attached !== 'none' && attached !== 'attached') return { journal: attached };
    if (!payment.toAccountId) {
      if (plannedPaymentFxMode(payment))
        throw new Error('Explicit planned FX requires exactly two distinct accounts');
      logger.warn(
        `Planned payment ${payment.id} is missing toAccountId — advancing its schedule without creating a journal.`,
      );
      return { journal: null };
    }
    const context = await readPlannedPaymentFxContext(payment, dayStart);
    const posting = payment.isAutoPost && context?.mode !== 'manual' && dayStart <= action.asOf;
    const amounts = context
      ? await resolvePlannedPaymentFxAmounts(context, {
          posting,
          postedAt: dayStart,
          quote: fxQuote,
        })
      : undefined;
    return {
      journal: await journalPersistenceService.putInSession(
        session,
        {
          journalDate: dayStart,
          description: payment.name,
          currencyCode: context?.review.sourceCurrency ?? payment.currencyCode,
          transactions:
            context && amounts
              ? buildPlannedPaymentFxLines(
                  context.lines,
                  context.review.sourceCurrency,
                  context.review.destinationCurrency,
                  amounts.sourceAmount,
                  amounts.destinationAmount,
                )
              : buildPlannedPaymentTransferLines(payment),
          status: posting ? JournalStatus.POSTED : JournalStatus.PLANNED,
          plannedPaymentId: payment.id,
          ...(context
            ? {
                metadata: plannedPaymentFxMetadata(
                  context,
                  !posting && context.mode === 'automatic' && fxQuote?.rate == null
                    ? { fxPreviewRateUnavailable: true }
                    : {},
                ),
              }
            : {}),
        },
        payment.workplaceId,
        { source: 'system', correlationId },
      ),
    };
  }

  if (action.kind === 'autoPostDue') {
    if (!payment.isAutoPost || dayStart > normalizeToStartOfDay(action.asOf))
      return { journal: null };
    const due =
      occurrence.kind === 'planned'
        ? occurrence.journals.find(journal => journal.id === action.journalId)
        : undefined;
    const attached = await tryStrictPlanAttach(
      session,
      payment,
      dayStart,
      action.asOf,
      due?.id ?? action.journalId,
      correlationId,
    );
    if (attached === 'hold') return { journal: null };
    if (attached !== 'none' && attached !== 'attached') return { journal: attached };
    if (!due) return { journal: null };
    const context = await readPlannedPaymentFxContext(payment, dayStart, due);
    if (context?.mode === 'manual') return { journal: null };
    return {
      journal: await postScheduledJournal(
        session,
        payment,
        due,
        dayStart,
        due.journalDate,
        correlationId,
        'system',
        fxQuote,
      ),
    };
  }

  if (occurrence.kind === 'settled') {
    throw occurrenceSettledError(payment.id, occurrence.journalId);
  }
  const planned = occurrence.kind === 'planned' ? occurrence.journals : [];
  if (planned.length === 0) assertActive(payment);

  if (action.kind === 'skip') {
    if (planned.length > 0) {
      await journalPersistenceRepository.setNonPostedStatusesInSession(
        session,
        payment.workplaceId,
        planned.map(journal => ({
          journalId: journal.id,
          status: JournalStatus.SKIPPED,
          expectedStatus: JournalStatus.PLANNED,
        })),
        { source: 'app', correlationId },
      );
      return { journal: null };
    }
    if (!payment.toAccountId) {
      if (plannedPaymentFxMode(payment))
        throw new Error('Explicit planned FX requires exactly two distinct accounts');
      logger.warn(
        `[PlannedPaymentOrchestration] skipOccurrence: payment ${payment.id} has no toAccountId — advancing schedule without creating a journal.`,
      );
      return { journal: null };
    }
    const context = await readPlannedPaymentFxContext(payment, dayStart);
    const amounts = context
      ? await resolvePlannedPaymentFxAmounts(context, { posting: false })
      : undefined;
    return {
      journal: await journalPersistenceService.putInSession(
        session,
        {
          journalDate: dayStart,
          description: payment.name,
          currencyCode: context?.review.sourceCurrency ?? payment.currencyCode,
          transactions:
            context && amounts
              ? buildPlannedPaymentFxLines(
                  context.lines,
                  context.review.sourceCurrency,
                  context.review.destinationCurrency,
                  amounts.sourceAmount,
                  amounts.destinationAmount,
                ).map(line => ({ ...line, notes: undefined }))
              : buildPlannedPaymentTransferLines(payment, {
                  includeNotes: false,
                  includeCurrency: false,
                }),
          ...(context ? { metadata: plannedPaymentFxMetadata(context) } : {}),
          status: JournalStatus.SKIPPED,
          plannedPaymentId: payment.id,
        },
        payment.workplaceId,
        {
          eventType: 'journal.planned_payment_skipped',
          source: 'app',
          correlationId,
          undoable: false,
        },
      ),
    };
  }

  // User-initiated post: never silent-attach; surface a candidate unless the user
  // already confirmed Post over "link instead?".
  if (!action.confirmPostDespiteCandidate) {
    const capture = await findCaptureMatchForOccurrence(payment, dayStart, action.postedAt);
    if (capture.kind !== 'none') {
      return {
        journal: null,
        attachCandidate: {
          captureJournalId: capture.captureJournalId,
          plannedJournalId: planned[0]?.id,
          matchKind: capture.kind,
          occurrenceDay: dayStart,
          amount: capture.amount,
          currencyCode: capture.currencyCode,
        },
      };
    }
  }

  if (planned.length > 1) {
    throw new Error(
      `Planned payment ${payment.id} has multiple planned journals for this occurrence`,
    );
  }
  if (action.journalId && planned[0]?.id !== action.journalId) {
    throw new Error(`Planned journal ${action.journalId} is not scheduled for this occurrence`);
  }
  if (planned.length === 1) {
    return {
      journal: await postScheduledJournal(
        session,
        payment,
        planned[0],
        dayStart,
        action.postedAt,
        correlationId,
        'app',
        fxQuote,
        action.review,
        action.auditMetadata,
        action.expectedCurrent,
      ),
    };
  }
  if (!payment.toAccountId) {
    throw new Error(`Planned payment ${payment.id} is missing toAccountId.`);
  }
  const context = await readPlannedPaymentFxContext(payment, dayStart);
  const amounts = context
    ? await resolvePlannedPaymentFxAmounts(context, {
        posting: true,
        postedAt: action.postedAt,
        quote: fxQuote,
        review: action.review,
      })
    : undefined;
  return {
    journal: await journalPersistenceService.putInSession(
      session,
      {
        journalDate: action.postedAt,
        description: payment.name,
        currencyCode: context?.review.sourceCurrency ?? payment.currencyCode,
        transactions:
          context && amounts
            ? buildPlannedPaymentFxLines(
                context.lines,
                context.review.sourceCurrency,
                context.review.destinationCurrency,
                amounts.sourceAmount,
                amounts.destinationAmount,
              )
            : buildPlannedPaymentTransferLines(payment),
        status: JournalStatus.POSTED,
        plannedPaymentId: payment.id,
        metadata: context
          ? {
              ...plannedPaymentFxMetadata(context, {
                [MetadataKeys.ORIGINAL_PLANNED_DATE]: dayStart,
              }),
              importSource: MetadataSources.MANUAL_POST,
            }
          : {
              importSource: MetadataSources.MANUAL_POST,
              metadataJson: JSON.stringify({ [MetadataKeys.ORIGINAL_PLANNED_DATE]: dayStart }),
            },
      },
      payment.workplaceId,
      { source: 'app', correlationId },
    ),
  };
}

/** Patch and post in one put: staged puts are not visible to a subsequent status-only post. */
async function postScheduledJournal(
  session: AccountingWriteSession,
  payment: PlannedPayment,
  journal: Journal,
  occurrenceDate: number,
  postedAt: number,
  correlationId: string,
  source: 'system' | 'app',
  quote?: PlannedPaymentFxQuote,
  review?: PlannedPaymentFxReview,
  auditMetadata?: AuditEventMetadata,
  expectedCurrent?: Record<string, unknown>,
): Promise<JournalPersistenceResult> {
  const context = await readPlannedPaymentFxContext(payment, occurrenceDate, journal);
  if (!context)
    return journalPersistenceService.postInSession(
      session,
      journal.id,
      payment.workplaceId,
      postedAt,
      { source, correlationId },
    );
  if (expectedCurrent)
    assertExpectedJournalSnapshot(
      expectedCurrent,
      journal,
      await transactionQueryRepository.findByJournal(payment.workplaceId, journal.id),
    );
  const amounts = await resolvePlannedPaymentFxAmounts(context, {
    posting: true,
    postedAt,
    quote,
    review,
  });
  return journalPersistenceService.putInSession(
    session,
    {
      journalId: journal.id,
      journalDate: postedAt,
      status: JournalStatus.POSTED,
      transactions: buildPlannedPaymentFxLines(
        context.lines,
        context.review.sourceCurrency,
        context.review.destinationCurrency,
        amounts.sourceAmount,
        amounts.destinationAmount,
      ),
      metadata: {
        ...plannedPaymentFxMetadata(context, {
          [MetadataKeys.ORIGINAL_PLANNED_DATE]: journal.journalDate,
          fxPreviewRateUnavailable: false,
        }),
        importSource: MetadataSources.MANUAL_POST,
      },
    },
    payment.workplaceId,
    { eventType: 'journal.posted', source, correlationId, ...auditMetadata },
  );
}

async function advanceSchedule(
  session: AccountingWriteSession,
  payment: PlannedPayment,
  dayStart: number,
  correlationId: string,
): Promise<Omit<PlannedOccurrenceSettlement, 'journal'>> {
  const nextOccurrence = calculateNextOccurrence(dayStart, payment);
  if (payment.status !== PlannedPaymentStatus.ACTIVE || nextOccurrence <= payment.nextOccurrence) {
    return { nextOccurrence: payment.nextOccurrence, completed: false };
  }
  const completed = !!payment.endDate && nextOccurrence > payment.endDate;
  await plannedPaymentRepository.updateInSession(
    session,
    payment.workplaceId,
    payment.id,
    { nextOccurrence, ...(completed ? { status: PlannedPaymentStatus.COMPLETED } : {}) },
    { status: PlannedPaymentStatus.ACTIVE, nextOccurrence: payment.nextOccurrence },
    {
      eventType: completed ? 'planned_payment.completed' : 'planned_payment.schedule_advanced',
      source: 'system',
      correlationId,
      undoable: false,
    },
  );
  return { nextOccurrence, completed };
}
