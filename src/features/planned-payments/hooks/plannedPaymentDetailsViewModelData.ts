import { PlannedPaymentStatus } from '@/src/types/enums';
import type { PlainAuditLog, PlainJournal } from '@/src/types/plainDtos';
import { calculateNextOccurrence } from '@/src/services/planned-payment/plannedPaymentRecurrence';

export function countRemainingPlannedOccurrences(
  nextOccurrence: number,
  endDate: number | undefined,
  payment: Parameters<typeof calculateNextOccurrence>[1],
): number | undefined {
  if (endDate == null) return undefined;
  if (!Number.isFinite(nextOccurrence) || !Number.isFinite(endDate)) return 0;
  let cursor = nextOccurrence;
  let count = 0;
  while (cursor <= endDate && count < 10000) {
    count++;
    const next = calculateNextOccurrence(cursor, payment);
    if (next <= cursor) break;
    cursor = next;
  }
  return cursor <= endDate ? undefined : count;
}

/** Uses only the audited ACTIVE → PAUSED transition timestamp, never a scheduled journal date. */
export function findPausedAtFromAudit(logs: PlainAuditLog[]): number | undefined {
  let latestPauseTimestamp: number | undefined;
  for (const log of logs) {
    if (log.eventType !== 'planned_payment.status_changed' || !Number.isFinite(log.timestamp))
      continue;
    try {
      const changes: unknown = JSON.parse(log.changes);
      if (typeof changes !== 'object' || changes === null || Array.isArray(changes)) continue;
      const after = Reflect.get(changes, 'after');
      const before = Reflect.get(changes, 'before');
      if (
        typeof after === 'object' &&
        after !== null &&
        Reflect.get(after, 'status') === PlannedPaymentStatus.PAUSED &&
        typeof before === 'object' &&
        before !== null &&
        Reflect.get(before, 'status') === PlannedPaymentStatus.ACTIVE
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
