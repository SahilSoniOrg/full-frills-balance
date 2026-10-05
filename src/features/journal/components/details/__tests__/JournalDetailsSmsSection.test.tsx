import * as privacyScope from '@/src/contexts/PrivacyScope';
import { fireEvent, render } from '@/src/utils/test-utils';
import { logger } from '@/src/utils/logger';
import { JournalDetailsSmsSection } from '../JournalDetailsSmsSection';

afterEach(() => jest.restoreAllMocks());

it.each([false, true])(
  'shows the retained message only with Privacy Mode disabled (enabled=%s)',
  enabled => {
    jest.spyOn(privacyScope, 'useEffectivePrivacyMode').mockReturnValue(enabled);
    const diagnostic = jest.spyOn(logger, 'debug').mockImplementation(() => undefined);
    const screen = render(
      <JournalDetailsSmsSection
        smsInfo={[{ rawBody: 'Original transaction SMS', inboxRecordId: 'source-1' }]}
      />,
    );
    fireEvent.press(screen.getByLabelText('Expand imported SMS section'));
    if (enabled) {
      expect(screen.queryByText('Original transaction SMS')).toBeNull();
      expect(screen.getByText('Original message hidden in Privacy Mode.')).toBeTruthy();
    } else {
      expect(screen.getByText('Original transaction SMS')).toBeTruthy();
    }
    expect(JSON.stringify(diagnostic.mock.calls)).not.toContain('Original transaction');
  },
);
