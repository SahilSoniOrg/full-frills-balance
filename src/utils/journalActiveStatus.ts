import { JournalStatus } from '@/src/types/domain';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';

const ACTIVE_SET = new Set<JournalStatus>(ACTIVE_JOURNAL_STATUSES);

/** Posted-equivalent statuses enqueue balance rebuilds; undefined defaults to active (posted). */
export function isRebuildEligibleJournalStatus(status: JournalStatus | undefined): boolean {
  if (status === undefined) return true;
  return ACTIVE_SET.has(status);
}
