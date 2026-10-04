import { toPlainJournal } from '@/src/data/models/Journal';
import { journalObserveQueries } from '@/src/data/repositories/journal/JournalObserveQueries';
import type { Money } from '@/src/types/domainReadModels';
import { JournalStatus, PlannedPaymentStatus } from '@/src/types/enums';
import type { JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import type { PlainJournal, PlainPlannedPayment } from '@/src/types/plainDtos';
import { safeAdd } from '@/src/utils/money';
import { getCurrencyPrecision } from '@/src/utils/currencyPrecision';
import { map } from 'rxjs';
import { projectPlannedOccurrencesForHorizon } from './plannedOccurrenceHorizon';
import { normalizeToStartOfDay } from './plannedPaymentRecurrence';

export interface PlannedPaymentActivitySummary {
  recordedCount: number;
  skippedCount: number;
  reversedCount: number;
  pendingCount: number;
  pausedCount: number;
  overdueCount: number;
  recordedTotals: Money[];
  lastRecorded?: PlainJournal;
}

export interface PlannedPaymentNextOccurrence extends Money {
  date: number;
  journalId?: JournalId;
}

/** Totals are grouped by saved journal currency. Reversed originals are not recorded payments. */
export function summarizePlannedPaymentActivity(
  journals: PlainJournal[],
  now: number,
): PlannedPaymentActivitySummary {
  const recorded = journals.filter(
    journal => journal.status === JournalStatus.POSTED && !journal.originalJournalId,
  );
  const pending = journals.filter(journal => journal.status === JournalStatus.PLANNED);
  const totals = new Map<string, number>();
  for (const journal of recorded) {
    totals.set(
      journal.currencyCode,
      safeAdd(
        totals.get(journal.currencyCode) ?? 0,
        journal.totalAmount,
        getCurrencyPrecision(journal.currencyCode),
      ),
    );
  }
  return {
    recordedCount: recorded.length,
    skippedCount: journals.filter(journal => journal.status === JournalStatus.SKIPPED).length,
    reversedCount: journals.filter(journal => journal.status === JournalStatus.REVERSED).length,
    pendingCount: pending.length,
    pausedCount: journals.filter(journal => journal.status === JournalStatus.PAUSED).length,
    overdueCount: pending.filter(
      journal => normalizeToStartOfDay(journal.journalDate) < normalizeToStartOfDay(now),
    ).length,
    recordedTotals: [...totals]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currencyCode, amount]) => ({ currencyCode, amount })),
    lastRecorded: recorded.reduce<PlainJournal | undefined>(
      (latest, journal) => (!latest || journal.journalDate > latest.journalDate ? journal : latest),
      undefined,
    ),
  };
}

/** Combine saved occurrences and the rule cursor, preserving edits and recurrence/end-date rules. */
export function getNextPlannedPaymentOccurrences(
  payment: PlainPlannedPayment,
  journals: PlainJournal[],
  count = 3,
): PlannedPaymentNextOccurrence[] {
  if (payment.status === PlannedPaymentStatus.PAUSED || count <= 0) return [];
  const occurrences = new Map<number, PlannedPaymentNextOccurrence>();
  for (const journal of journals
    .filter(journal => journal.status === JournalStatus.PLANNED)
    .sort((a, b) => a.journalDate - b.journalDate)) {
    const date = normalizeToStartOfDay(journal.journalDate);
    if (!occurrences.has(date))
      occurrences.set(date, {
        date: journal.journalDate,
        amount: journal.totalAmount,
        currencyCode: journal.currencyCode,
        journalId: journal.id,
      });
  }
  if (payment.status === PlannedPaymentStatus.ACTIVE) {
    const projected = projectPlannedOccurrencesForHorizon(payment, new Set(occurrences.keys()), {
      maxNewOccurrences: count,
      attemptBudget: journals.length + count,
    });
    for (const occurrence of projected) {
      const day = normalizeToStartOfDay(occurrence.date);
      if (!occurrences.has(day)) occurrences.set(day, occurrence);
    }
  }
  return [...occurrences.values()].sort((a, b) => a.date - b.date).slice(0, count);
}

export const plannedPaymentDetailService = {
  observeActivity(workplaceId: WorkplaceId, plannedPaymentId: PlannedPaymentId) {
    return journalObserveQueries
      .observeByPlannedPayment(workplaceId, plannedPaymentId)
      .pipe(map(journals => journals.map(toPlainJournal)));
  },
};
