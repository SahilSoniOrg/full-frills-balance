import { AppConfig } from '@/src/constants';
import type PlannedPayment from '@/src/data/models/PlannedPayment';
import { accountQueryRepository } from '@/src/data/repositories/account/AccountQueryRepository';
import { journalPlannedQueries } from '@/src/data/repositories/journal/JournalPlannedQueries';
import { smsJournalQueries } from '@/src/data/repositories/journal/SmsJournalQueries';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { classifyPlannedPaymentDirection } from '@/src/services/planned-payment/plannedPaymentReadService';
import { normalizeToStartOfDay } from '@/src/services/planned-payment/plannedPaymentRecurrence';
import { requirePlannedPayment } from '@/src/services/planned-payment/plannedPaymentWorkplace';
import {
  matchSharedMovement,
  MOVEMENT_MATCH_WINDOWS,
  type ExistingMovement,
  type MovementObservation,
  type MovementOccurrence,
} from '@/src/domain/planned-payment/sharedMovementMatcher';
import { approxIntervalDays } from '@/src/domain/recurrence/intervalPolicy';
import { TransactionType } from '@/src/types/enums';
import { JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import { occurrenceDay, type PlanCaptureAttachCandidate } from './plannedOccurrenceSettlementTypes';

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

export type CaptureMatch =
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
export async function findCaptureMatchForOccurrence(
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
  const days = approxIntervalDays(payment.intervalType, payment.intervalN);
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
