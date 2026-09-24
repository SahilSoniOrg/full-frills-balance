import { AppConfig } from '@/src/constants';
import { MetadataKeys, MetadataSources } from '@/src/constants/ledger-constants';
import type PlannedPayment from '@/src/data/models/PlannedPayment';
import type { AccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import {
  journalPersistenceRepository,
  type JournalPersistenceResult,
} from '@/src/data/repositories/journal/JournalPersistenceRepository';
import type { PlannedOccurrenceJournals } from '@/src/data/repositories/journal/JournalPlannedQueries';
import { journalPlannedQueries } from '@/src/data/repositories/journal/journalPlannedModule';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import { buildPlannedPaymentTransferLines } from '@/src/services/planned-payment/plannedPaymentJournalLines';
import {
  calculateNextOccurrence,
  normalizeToStartOfDay,
} from '@/src/services/planned-payment/plannedPaymentRecurrence';
import { requirePlannedPayment } from '@/src/services/planned-payment/plannedPaymentWorkplace';
import { JournalStatus, PlannedPaymentStatus } from '@/src/types/enums';
import { JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import { logger } from '@/src/utils/logger';

/**
 * `generate` settles the payment's current due occurrence (advance-only when already journalled);
 * `post` and `skip` act on any occurrence and reject one that is already settled.
 * A `post` with `journalId` only posts that scheduled journal.
 */
export type PlannedOccurrenceAction =
  | { kind: 'generate' }
  | { kind: 'post'; postedAt: number; journalId?: JournalId }
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

/**
 * Settles one occurrence inside the caller's write session: re-reads the payment, resolves the
 * occurrence's journals, applies the action and advances the schedule, so a rejection leaves
 * the journal and schedule unchanged together. Paused payments are never settled; completed
 * payments may only settle journals that were already scheduled.
 */
export async function settlePlannedOccurrence(
  session: AccountingWriteSession,
  workplaceId: WorkplaceId,
  plannedPaymentId: PlannedPaymentId,
  occurrenceDate: number,
  action: PlannedOccurrenceAction,
): Promise<PlannedOccurrenceSettlement> {
  const payment = await requirePlannedPayment(workplaceId, plannedPaymentId);
  if (action.kind === 'generate' || payment.status === PlannedPaymentStatus.PAUSED) {
    assertActive(payment);
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
  const journal = await applyOccurrenceAction(session, payment, day, occurrence, action);
  return { journal, ...(await advanceSchedule(session, payment, day.dayStart)) };
}

async function applyOccurrenceAction(
  session: AccountingWriteSession,
  payment: PlannedPayment,
  { dayStart }: OccurrenceDay,
  occurrence: PlannedOccurrenceJournals,
  action: PlannedOccurrenceAction,
): Promise<JournalPersistenceResult | null> {
  if (action.kind === 'generate') {
    if (occurrence.kind !== 'none') return null;
    if (!payment.toAccountId) {
      logger.warn(
        `Planned payment ${payment.id} is missing toAccountId — advancing its schedule without creating a journal.`,
      );
      return null;
    }
    return journalPersistenceService.putInSession(
      session,
      {
        journalDate: dayStart,
        description: payment.name,
        currencyCode: payment.currencyCode,
        transactions: buildPlannedPaymentTransferLines(payment),
        status: payment.isAutoPost ? JournalStatus.POSTED : JournalStatus.PLANNED,
        plannedPaymentId: payment.id,
      },
      payment.workplaceId,
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
      );
      return null;
    }
    if (!payment.toAccountId) {
      logger.warn(
        `[PlannedPaymentOrchestration] skipOccurrence: payment ${payment.id} has no toAccountId — advancing schedule without creating a journal.`,
      );
      return null;
    }
    return journalPersistenceService.putInSession(
      session,
      {
        journalDate: dayStart,
        description: payment.name,
        currencyCode: payment.currencyCode,
        transactions: buildPlannedPaymentTransferLines(payment, {
          includeNotes: false,
          includeCurrency: false,
        }),
        status: JournalStatus.SKIPPED,
        plannedPaymentId: payment.id,
      },
      payment.workplaceId,
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
    return journalPersistenceService.postInSession(
      session,
      planned[0].id,
      payment.workplaceId,
      action.postedAt,
    );
  }
  if (!payment.toAccountId) {
    throw new Error(`Planned payment ${payment.id} is missing toAccountId.`);
  }
  return journalPersistenceService.putInSession(
    session,
    {
      journalDate: action.postedAt,
      description: payment.name,
      currencyCode: payment.currencyCode,
      transactions: buildPlannedPaymentTransferLines(payment),
      status: JournalStatus.POSTED,
      plannedPaymentId: payment.id,
      metadata: {
        importSource: MetadataSources.MANUAL_POST,
        metadataJson: JSON.stringify({ [MetadataKeys.ORIGINAL_PLANNED_DATE]: dayStart }),
      },
    },
    payment.workplaceId,
  );
}

async function advanceSchedule(
  session: AccountingWriteSession,
  payment: PlannedPayment,
  dayStart: number,
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
  );
  return { nextOccurrence, completed };
}
