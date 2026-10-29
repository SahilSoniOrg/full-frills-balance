import { InboxProcessingStatus } from '@/src/types/enums';
import { inboxProcessingStatusLabel } from '../inboxProcessingStatusLabel';

describe('inboxProcessingStatusLabel', () => {
  it.each([
    [InboxProcessingStatus.PENDING, 'Needs review'],
    [InboxProcessingStatus.IMPORTED, 'Imported'],
    [InboxProcessingStatus.AUTO_POSTED, 'Added automatically'],
    [InboxProcessingStatus.DISMISSED, 'Dismissed'],
    [InboxProcessingStatus.DUPLICATE_FLAGGED, 'Review possible duplicate'],
    [InboxProcessingStatus.PARSE_FAILED, "Couldn't read transaction details"],
  ])('maps %s to a user-facing label', (status, label) => {
    expect(inboxProcessingStatusLabel(status)).toBe(label);
  });

  it('does not expose an unknown implementation status', () => {
    expect(inboxProcessingStatusLabel('future_status')).toBe('Status unavailable');
  });
});
