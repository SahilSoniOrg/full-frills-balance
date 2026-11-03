import { isActiveJournalStatus } from '@/src/utils/journalStatus';
import dayjs from 'dayjs';

/**
 * Newest posted or reversed journal date. Planned and draft entries are not
 * evidence that the books are current. Null when there is no real transaction yet.
 */
export function latestActiveJournalAt(
  journals: readonly { status: string; journalDate: number }[],
): number | null {
  let latest = Number.NEGATIVE_INFINITY;
  for (const journal of journals) {
    if (!isActiveJournalStatus(journal.status)) continue;
    if (!Number.isFinite(journal.journalDate)) continue;
    if (journal.journalDate > latest) latest = journal.journalDate;
  }
  return Number.isFinite(latest) ? latest : null;
}

/** Calendar days from `now` back to the journal date tagged on a calculation. */
export function booksGapDays(
  latestActiveJournalAt: number | null | undefined,
  now: number,
): number | null {
  if (latestActiveJournalAt == null || !Number.isFinite(latestActiveJournalAt)) return null;
  return dayjs(now).startOf('day').diff(dayjs(latestActiveJournalAt).startOf('day'), 'day');
}
