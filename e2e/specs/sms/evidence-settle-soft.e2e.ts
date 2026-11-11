/**
 * @owner mobile
 * @dataSource e2e
 * @platform android
 *
 * Soft amount mismatch (fee) blocks capture auto-post and flags the SMS for review.
 */
import { launchOnboardedApp } from '../../actions/launch';
import {
  openSmsInboxFromSettings,
  selectInboxFilter,
  waitForInboxItem,
} from '../../actions/mobile/smsInbox';
import { openCommitmentsTab } from '../../actions/mobile/flows';
import { assertTextVisible } from '../../actions/assertions';
import { tapById } from '../../actions/mobile/elementActions';
import { LONG_TIMEOUT_MS } from '../../constants/timeouts';
import { E2E_EVIDENCE_SETTLE } from '../../../src/testing/e2eConstants';

jest.setTimeout(300000);

describe(':android: evidence-driven settle (soft fee mismatch)', () => {
  beforeAll(async () => {
    await launchOnboardedApp({ seedProfile: 'evidence-settle-soft' });
  });

  it('keeps the plan pending and routes the fee SMS to duplicates review', async () => {
    await openCommitmentsTab();
    await tapById('home-v2-subtab-commitments-planned-payments', LONG_TIMEOUT_MS);
    await assertTextVisible(E2E_EVIDENCE_SETTLE.planName, LONG_TIMEOUT_MS);

    await openSmsInboxFromSettings();
    await selectInboxFilter('duplicates');
    await waitForInboxItem(E2E_EVIDENCE_SETTLE.softSmsId);
  });
});
