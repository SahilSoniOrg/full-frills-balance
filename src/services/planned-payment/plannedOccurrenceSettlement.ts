import { AppConfig } from '@/src/constants';
import { MetadataKeys, MetadataSources } from '@/src/constants/ledger-constants';
import type PlannedPayment from '@/src/data/models/PlannedPayment';
import type Journal from '@/src/data/models/Journal';
import { assertExpectedJournalSnapshot } from '@/src/data/repositories/journal/journalAuditGuard';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
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
import {
  journalPersistenceRepository,
  type JournalPersistenceResult,
} from '@/src/data/repositories/journal/JournalPersistenceRepository';
import type { PlannedOccurrenceJournals } from '@/src/data/repositories/journal/JournalPlannedQueries';
import { journalPlannedQueries } from '@/src/data/repositories/journal/JournalPlannedQueries';
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
import { requirePlannedPayment } from '@/src/services/planned-payment/plannedPaymentWorkplace';
import { JournalStatus, PlannedPaymentStatus } from '@/src/types/enums';
import { JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import { generator } from '@/src/data/database/idGenerator';
import { logger } from '@/src/utils/logger';

/**
 * `generate` settles the payment's current due occurrence (advance-only when already journalled);
 * `post` and `skip` act on any occurrence and reject one that is already settled.
 * A `post` with `journalId` only posts that scheduled journal.
 */
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
    }
  | { kind: 'skip' };

export interface PlannedOccurrenceSettlement {
  journal: JournalPersistenceResult | null;
  nextOccurrence: number;
  completed: boolean;
}

interface OccurrenceDay {
  dayStart: number;
  dayEnd: number;
}

function occurrenceDay(occurrenceDate: number): OccurrenceDay {
  const dayStart = normalizeToStartOfDay(occurrenceDate);
  return { dayStart, dayEnd: dayStart + (AppConfig.time.msPerDay - 1) };
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
  const journal = await applyOccurrenceAction(
    session,
    payment,
    day,
    occurrence,
    action,
    correlationId,
    fxQuote,
  );
  if (action.kind === 'autoPostDue' && !journal && plannedPaymentFxMode(payment))
    return { journal: null, nextOccurrence: payment.nextOccurrence, completed: false };
  return {
    journal,
    ...(await advanceSchedule(session, payment, day.dayStart, correlationId)),
  };
}

async function applyOccurrenceAction(
  session: AccountingWriteSession,
  payment: PlannedPayment,
  { dayStart }: OccurrenceDay,
  occurrence: PlannedOccurrenceJournals,
  action: PlannedOccurrenceAction,
  correlationId: string,
  fxQuote?: PlannedPaymentFxQuote,
): Promise<JournalPersistenceResult | null> {
  if (action.kind === 'generate') {
    if (occurrence.kind !== 'none') {
      if (occurrence.kind === 'planned' && payment.isAutoPost && dayStart <= action.asOf) {
        const due = occurrence.journals[0];
        const context = await readPlannedPaymentFxContext(payment, dayStart, due);
        if (context && context.mode !== 'manual') {
          if (occurrence.journals.length !== 1)
            throw new Error('Multiple planned journals for this occurrence');
          return postScheduledJournal(
            session,
            payment,
            due,
            dayStart,
            due.journalDate,
            correlationId,
            'system',
            fxQuote,
          );
        }
      }
      return null;
    }
    if (!payment.toAccountId) {
      if (plannedPaymentFxMode(payment))
        throw new Error('Explicit planned FX requires exactly two distinct accounts');
      logger.warn(
        `Planned payment ${payment.id} is missing toAccountId — advancing its schedule without creating a journal.`,
      );
      return null;
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
    return journalPersistenceService.putInSession(
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
    );
  }

  if (action.kind === 'autoPostDue') {
    if (!payment.isAutoPost || dayStart > normalizeToStartOfDay(action.asOf)) return null;
    const due =
      occurrence.kind === 'planned'
        ? occurrence.journals.find(journal => journal.id === action.journalId)
        : undefined;
    if (!due) return null;
    const context = await readPlannedPaymentFxContext(payment, dayStart, due);
    if (context?.mode === 'manual') return null;
    return postScheduledJournal(
      session,
      payment,
      due,
      dayStart,
      due.journalDate,
      correlationId,
      'system',
      fxQuote,
    );
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
      return null;
    }
    if (!payment.toAccountId) {
      if (plannedPaymentFxMode(payment))
        throw new Error('Explicit planned FX requires exactly two distinct accounts');
      logger.warn(
        `[PlannedPaymentOrchestration] skipOccurrence: payment ${payment.id} has no toAccountId — advancing schedule without creating a journal.`,
      );
      return null;
    }
    const context = await readPlannedPaymentFxContext(payment, dayStart);
    const amounts = context
      ? await resolvePlannedPaymentFxAmounts(context, { posting: false })
      : undefined;
    return journalPersistenceService.putInSession(
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
    );
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
    return postScheduledJournal(
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
    );
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
  return journalPersistenceService.putInSession(
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
  );
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
