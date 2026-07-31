import { JournalStatus } from '@/src/data/models/Journal';

export const ACTIVE_JOURNAL_STATUSES = [JournalStatus.POSTED, JournalStatus.REVERSED] as const;

export type ActiveJournalStatus = (typeof ACTIVE_JOURNAL_STATUSES)[number];

export function isJournalStatus(value: string | undefined): value is JournalStatus {
  return value !== undefined && Object.values(JournalStatus).includes(value as JournalStatus);
}

export function isActiveJournalStatus(value: string | undefined): value is ActiveJournalStatus {
  return value !== undefined && ACTIVE_JOURNAL_STATUSES.includes(value as ActiveJournalStatus);
}
