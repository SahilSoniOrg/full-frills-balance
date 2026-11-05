/**
 * @owner mobile
 * @dataSource e2e
 * @platform android
 */
import { launchOnboardedApp } from '../../actions/launch';
import {
  assertInboxItemMissing,
  openSmsInboxFromSettings,
  refreshSmsInbox,
  selectInboxFilter,
  waitForInboxItem,
} from '../../actions/mobile/smsInbox';
import { assertTextVisible } from '../../actions/assertions';
import { LONG_TIMEOUT_MS } from '../../constants/timeouts';

jest.setTimeout(300000);

describe(':android: account matcher discovery', () => {
  beforeAll(async () => {
    await launchOnboardedApp({ seedProfile: 'matcher-discovery' });
  });

  it('holds contradictory recognition and auto-posts a compatible SMS', async () => {
    await openSmsInboxFromSettings();
    await refreshSmsInbox();
    await selectInboxFilter('pending');
    await waitForInboxItem('e2e-matcher-contradictory');
    await assertTextVisible("Account didn't match the rule", LONG_TIMEOUT_MS);
    await assertInboxItemMissing('e2e-matcher-compatible');
  });
});
