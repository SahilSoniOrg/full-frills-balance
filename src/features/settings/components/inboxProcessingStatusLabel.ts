import { InboxProcessingStatus } from '@/src/types/enums';

const LABEL_BY_STATUS: Record<InboxProcessingStatus, string> = {
  [InboxProcessingStatus.PENDING]: 'Needs review',
  [InboxProcessingStatus.IMPORTED]: 'Imported',
  [InboxProcessingStatus.AUTO_POSTED]: 'Added automatically',
  [InboxProcessingStatus.DISMISSED]: 'Dismissed',
  [InboxProcessingStatus.DUPLICATE_FLAGGED]: 'Review possible duplicate',
  [InboxProcessingStatus.PARSE_FAILED]: "Couldn't read transaction details",
};

export function inboxProcessingStatusLabel(status: string): string {
  return LABEL_BY_STATUS[status as InboxProcessingStatus] ?? 'Status unavailable';
}
