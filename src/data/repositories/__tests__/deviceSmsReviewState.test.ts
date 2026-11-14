import { readReviewStates } from '../deviceSmsReviewState';
import { InboxProcessingStatus } from '@/src/types/enums';

describe('persisted Device SMS review state', () => {
  it.each(['null', '[]', '42', 'broken JSON'])('rejects non-record payload %s', json => {
    expect(readReviewStates(json)).toEqual({});
  });

  it('retains valid Workplaces while dropping corrupt sibling states and fields', () => {
    const states = readReviewStates(
      JSON.stringify({
        corrupt: null,
        wrongStatus: { processingStatus: 'something else' },
        valid: {
          processingStatus: InboxProcessingStatus.PENDING,
          metadataJson: '{}',
          duplicateConfidence: 'high',
          suggestedSourceAccountId: ['not-an-id'],
        },
      }),
    );

    expect(Object.keys(states)).toEqual(['valid']);
    expect(states.valid.processingStatus).toBe(InboxProcessingStatus.PENDING);
    expect(states.valid.metadataJson).toBe('{}');
    expect(states.valid.duplicateConfidence).toBeUndefined();
    expect(states.valid.suggestedSourceAccountId).toBeUndefined();
  });
});
