/**
 * @owner mobile
 * @dataSource e2e
 * @platform android
 */
import { launchOnboardedApp } from '../../actions/launch';
import {
  assertJournalDetailsVisible,
  openSmsInboxFromSettings,
  selectInboxFilter,
  tapCompareDuplicate,
  waitForInboxItem,
} from '../../actions/mobile/smsInbox';

jest.setTimeout(300000);

describe('SMS inbox duplicates', () => {
  beforeAll(async () => {
    await launchOnboardedApp({ seedProfile: 'sms-ready' });
  });

  it('shows pre-seeded duplicate items in the duplicates filter', async () => {
    await openSmsInboxFromSettings();
    await selectInboxFilter('duplicates');
    await waitForInboxItem('e2e-dup-seeded');
  });

  it('navigates to journal details from compare duplicate', async () => {
    await openSmsInboxFromSettings();
    await selectInboxFilter('duplicates');
    await waitForInboxItem('e2e-dup-seeded');
    await tapCompareDuplicate('e2e-dup-seeded');
    await assertJournalDetailsVisible();
  });

  it('keeps duplicate items out of the pending filter', async () => {
    await openSmsInboxFromSettings();
    await selectInboxFilter('pending');
    await waitForInboxItem('e2e-pending-seeded');
  });
});
