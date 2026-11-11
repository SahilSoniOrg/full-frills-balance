/**
 * @owner mobile
 * @dataSource e2e
 * @platform android
 *
 * Seeds a unique Bank SMS against an ACTIVE plan (auto-post off) so evidence-driven
 * settlement posts the PLANNED occurrence during arrival scan.
 */
import { launchOnboardedApp } from '../../actions/launch';
import {
  assertInboxItemMissing,
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

describe(':android: evidence-driven settle (unique SMS)', () => {
  beforeAll(async () => {
    await launchOnboardedApp({ seedProfile: 'evidence-settle-unique' });
  });

  it('settles the plan occurrence and clears the SMS from pending', async () => {
    await openCommitmentsTab();
    // HomeV2 subtabs: current route `commitments` → sibling `planned-payments`
    await tapById('home-v2-subtab-commitments-planned-payments', LONG_TIMEOUT_MS);
    await assertTextVisible(E2E_EVIDENCE_SETTLE.planName, LONG_TIMEOUT_MS);

    await openSmsInboxFromSettings();
    await selectInboxFilter('pending');
    await assertInboxItemMissing(E2E_EVIDENCE_SETTLE.smsId);
    // Evidence settle links the SMS; status is IMPORTED (Processed) or AUTO_POSTED.
    await tapById('inbox-filter-processed', LONG_TIMEOUT_MS);
    try {
      await waitForInboxItem(E2E_EVIDENCE_SETTLE.smsId);
    } catch {
      await selectInboxFilter('auto_posted');
      await waitForInboxItem(E2E_EVIDENCE_SETTLE.smsId);
    }
  });
});
