import { JournalStatus } from '@/src/types/enums';

export const ACTIVE_JOURNAL_STATUSES = [JournalStatus.POSTED, JournalStatus.REVERSED] as const;

export type ActiveJournalStatus = (typeof ACTIVE_JOURNAL_STATUSES)[number];

export function isActiveJournalStatus(value: string | undefined): value is ActiveJournalStatus {
  return value !== undefined && ACTIVE_JOURNAL_STATUSES.includes(value as ActiveJournalStatus);
}

/** Posted-equivalent statuses enqueue balance rebuilds; undefined defaults to active (posted). */
export function isRebuildEligibleJournalStatus(status: JournalStatus | undefined): boolean {
  if (status === undefined) return true;
  return isActiveJournalStatus(status);
}
