/**
 * @owner mobile
 * @dataSource e2e
 * @platform android
 */
import { launchOnboardedApp } from '../../actions/launch';
import {
  openSmsInboxFromSettings,
  refreshSmsInbox,
  selectInboxFilter,
  waitForInboxItem,
} from '../../actions/mobile/smsInbox';

jest.setTimeout(300000);

describe('SMS sync harness', () => {
  beforeAll(async () => {
    await launchOnboardedApp({ seedProfile: 'sms-sync' });
  });

  it('flags injected SMS as duplicate after refresh', async () => {
    await openSmsInboxFromSettings();
    await refreshSmsInbox();
    await selectInboxFilter('duplicates');
    await waitForInboxItem('e2e-sync-sms-1');
  });
});
