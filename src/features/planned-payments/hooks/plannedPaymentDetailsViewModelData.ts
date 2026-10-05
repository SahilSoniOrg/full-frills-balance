import { PlannedPaymentStatus } from '@/src/types/enums';
import type { PlainAuditLog, PlainJournal, PlainPlannedPayment } from '@/src/types/plainDtos';
import { AccountId, PlannedPaymentId } from '@/src/types/ids';
import { calculateNextOccurrence } from '@/src/services/planned-payment/plannedPaymentRecurrence';
import { projectPlannedOccurrencesForHorizon } from '@/src/services/planned-payment/plannedOccurrenceHorizon';

export function countRemainingPlannedOccurrences(
  nextOccurrence: number,
  endDate: number | undefined,
  payment: Parameters<typeof calculateNextOccurrence>[1],
): number | undefined {
  if (endDate == null) return undefined;
  if (!Number.isFinite(nextOccurrence) || !Number.isFinite(endDate)) return 0;
  const projected = projectPlannedOccurrencesForHorizon(
    {
      id: 'count' as PlannedPaymentId,
      name: '',
      fromAccountId: 'from' as AccountId,
      toAccountId: 'to' as AccountId,
      isAutoPost: false,
      status: PlannedPaymentStatus.ACTIVE,
      startDate: nextOccurrence,
      nextOccurrence,
      endDate,
      amount: 0,
      currencyCode: 'USD',
      ...payment,
    } satisfies PlainPlannedPayment,
    new Set(),
    { throughDate: endDate },
  );
  return projected.length >= 10000 ? undefined : projected.length;
}

export function findPausedAtFromAudit(logs: PlainAuditLog[]): number | undefined {
  let latestPauseTimestamp: number | undefined;
  for (const log of logs) {
    if (log.eventType !== 'planned_payment.status_changed' || !Number.isFinite(log.timestamp))
      continue;
    try {
      const changes = JSON.parse(log.changes) as {
        before?: { status?: string };
        after?: { status?: string };
      };
      if (
        changes.after?.status === PlannedPaymentStatus.PAUSED &&
        changes.before?.status === PlannedPaymentStatus.ACTIVE
      ) {
        latestPauseTimestamp = Math.max(latestPauseTimestamp ?? log.timestamp, log.timestamp);
      }
    } catch {
      // Damaged or legacy payloads do not provide a trustworthy pause date.
    }
  }
  return latestPauseTimestamp;
}

export function findFirstRecordedDate(
  journals: readonly Pick<PlainJournal, 'status' | 'journalDate' | 'originalJournalId'>[],
): number | undefined {
  return journals.reduce<number | undefined>((earliest, journal) => {
    if (journal.status !== 'POSTED' || journal.originalJournalId) return earliest;
    return earliest == null || journal.journalDate < earliest ? journal.journalDate : earliest;
  }, undefined);
}
