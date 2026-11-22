import { MetadataKeys, MetadataSources } from '@/src/constants/ledger-constants';
import type PlannedPayment from '@/src/data/models/PlannedPayment';
import type { AccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import type { JournalPersistenceResult } from '@/src/data/repositories/journal/journalPersistenceTypes';
import { journalPersistenceRepository } from '@/src/data/repositories/journal/JournalPersistenceRepository';
import Journal from '@/src/data/models/Journal';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import {
  buildPlannedPaymentTransferLines,
  buildPlannedPaymentFxLines,
} from '@/src/services/planned-payment/plannedPaymentJournalLines';
import {
  attachCaptureJournalToPlannedOccurrenceInSession,
  stageRetiredPlannedOccurrenceTwin,
} from '@/src/services/planned-payment/plannedPaymentPlanAttach';
import { JournalStatus } from '@/src/types/enums';
import { JournalId } from '@/src/types/ids';
import { logger } from '@/src/services/observability/logger';
import { normalizeToStartOfDay } from '@/src/services/planned-payment/plannedPaymentRecurrence';
import {
  readPlannedPaymentFxContext,
  resolvePlannedPaymentFxAmounts,
  plannedPaymentFxMetadata,
  plannedPaymentFxMode,
  type PlannedPaymentFxQuote,
} from './plannedPaymentFx';
import { findCaptureMatchForOccurrence } from './plannedOccurrenceCaptureMatching';
import { postScheduledJournal } from './plannedOccurrenceJournalPost';
import {
  assertActive,
  occurrenceSettledError,
  type AppliedOccurrenceAction,
  type OccurrenceDay,
  type OccurrenceTransition,
  type PlanAttachTransition,
} from './plannedOccurrenceSettlementTypes';

async function attachCaptureUsingPlanService(
  session: AccountingWriteSession,
  payment: PlannedPayment,
  captureJournalId: JournalId,
  plannedJournalId: JournalId,
  occurrenceDayStart: number,
  correlationId: string,
  stagedPlannedJournal?: Journal,
): Promise<JournalPersistenceResult> {
  return attachCaptureJournalToPlannedOccurrenceInSession(
    session,
    payment.workplaceId,
    {
      captureJournalId,
      plannedPaymentId: payment.id,
      plannedJournalId,
      occurrenceDay: occurrenceDayStart,
      stagedPlannedJournal,
    },
    { correlationId },
  );
}

async function tryStrictPlanAttach(
  session: AccountingWriteSession,
  payment: PlannedPayment,
  dayStart: number,
  asOf: number,
  plannedJournalId: JournalId | undefined,
  correlationId: string,
): Promise<PlanAttachTransition> {
  const capture = await findCaptureMatchForOccurrence(payment, dayStart, asOf);
  if (capture.kind === 'soft' || capture.kind === 'ambiguous') return { kind: 'hold' };
  if (capture.kind !== 'strict') return { kind: 'none' };
  if (!plannedJournalId) {
    // Stage a retired twin in this batch so attach undo can restore the occurrence.
    if (!payment.toAccountId) return { kind: 'hold' };
    const stagedTwin = await stageRetiredPlannedOccurrenceTwin(
      session,
      payment,
      dayStart,
      correlationId,
    );
    return {
      kind: 'attached',
      journal: await attachCaptureUsingPlanService(
        session,
        payment,
        capture.captureJournalId,
        stagedTwin.id,
        dayStart,
        correlationId,
        stagedTwin,
      ),
    };
  }
  return {
    kind: 'attached',
    journal: await attachCaptureUsingPlanService(
      session,
      payment,
      capture.captureJournalId,
      plannedJournalId,
      dayStart,
      correlationId,
    ),
  };
}

export async function applyOccurrenceAction(
  session: AccountingWriteSession,
  payment: PlannedPayment,
  { dayStart }: OccurrenceDay,
  transition: OccurrenceTransition,
  correlationId: string,
  fxQuote?: PlannedPaymentFxQuote,
): Promise<AppliedOccurrenceAction> {
  if (transition.kind === 'generateClaimed' || transition.kind === 'autoPostNoop') {
    return { journal: null };
  }
  if (transition.kind === 'generateExisting') {
    const action = transition.action;
    const plannedJournals = transition.journals;
    const attached = await tryStrictPlanAttach(
      session,
      payment,
      dayStart,
      action.asOf,
      plannedJournals[0]?.id,
      correlationId,
    );
    if (attached.kind === 'hold') return { journal: null };
    if (attached.kind === 'attached') return { journal: attached.journal };
    if (payment.isAutoPost && dayStart <= action.asOf) {
      const due = plannedJournals[0];
      const context = await readPlannedPaymentFxContext(payment, dayStart, due);
      if (context && context.mode !== 'manual') {
        if (plannedJournals.length !== 1)
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
    return { journal: null };
  }
  if (transition.kind === 'generateNew') {
    const action = transition.action;
    // mint path
    const attached = await tryStrictPlanAttach(
      session,
      payment,
      dayStart,
      action.asOf,
      undefined,
      correlationId,
    );
    if (attached.kind === 'hold') return { journal: null };
    if (attached.kind === 'attached') return { journal: attached.journal };
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

  if (transition.kind === 'autoPost') {
    const action = transition.action;
    if (!payment.isAutoPost || dayStart > normalizeToStartOfDay(action.asOf))
      return { journal: null };
    const due = transition.journal;
    const attached = await tryStrictPlanAttach(
      session,
      payment,
      dayStart,
      action.asOf,
      due.id,
      correlationId,
    );
    if (attached.kind === 'hold') return { journal: null };
    if (attached.kind === 'attached') return { journal: attached.journal };
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

  if (transition.kind === 'settled') {
    throw occurrenceSettledError(payment.id, transition.journalId);
  }
  const planned =
    transition.kind === 'skipExisting' || transition.kind === 'postExisting'
      ? transition.journals
      : [];
  if (planned.length === 0) assertActive(payment);

  if (transition.kind === 'skipNew' || transition.kind === 'skipExisting') {
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

  if (transition.kind === 'postNew' || transition.kind === 'postExisting') {
    const action = transition.action;
    // User post surfaces capture candidates unless the User confirmed posting.
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
  return { journal: null };
}
