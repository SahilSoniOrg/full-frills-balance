/**
 * @owner mobile
 * @dataSource e2e
 * @platform android
 *
 * Pending (non-duplicate) inbox items expose Attach to journal via journal search,
 * and linked items can be detached back to Pending.
 */
import { by, element, waitFor } from 'detox';
import { launchOnboardedApp } from '../../actions/launch';
import {
  openSmsInboxFromSettings,
  selectInboxFilter,
  waitForInboxItem,
} from '../../actions/mobile/smsInbox';
import { tapById, tapByText } from '../../actions/mobile/elementActions';
import { LONG_TIMEOUT_MS } from '../../constants/timeouts';
import { E2E_EVIDENCE_SETTLE } from '../../../src/testing/e2eConstants';

jest.setTimeout(300000);

describe(':android: inbox attach to journal (pending)', () => {
  beforeAll(async () => {
    await launchOnboardedApp({ seedProfile: 'evidence-settle-soft' });
  });

  it('attaches a pending item then detaches it back to pending', async () => {
    await openSmsInboxFromSettings();
    await selectInboxFilter('pending');
    await waitForInboxItem(E2E_EVIDENCE_SETTLE.pendingAttachSmsId);

    const moreId = `inbox-more-${E2E_EVIDENCE_SETTLE.pendingAttachSmsId}`;
    const attachId = `inbox-attach-journal-${E2E_EVIDENCE_SETTLE.pendingAttachSmsId}`;
    const detachId = `inbox-detach-journal-${E2E_EVIDENCE_SETTLE.pendingAttachSmsId}`;
    await tapById(moreId, LONG_TIMEOUT_MS);
    await waitFor(element(by.id(attachId)))
      .toBeVisible()
      .withTimeout(LONG_TIMEOUT_MS);
    await tapById(attachId, LONG_TIMEOUT_MS);

    await waitFor(element(by.id('journal-search-screen')))
      .toBeVisible()
      .withTimeout(LONG_TIMEOUT_MS);
    await waitFor(element(by.id('journal-search-attach-hint')))
      .toBeVisible()
      .withTimeout(LONG_TIMEOUT_MS);
    await waitFor(element(by.id('journal-search-input')))
      .toBeVisible()
      .withTimeout(LONG_TIMEOUT_MS);
    await waitFor(element(by.text(E2E_EVIDENCE_SETTLE.attachTargetDescription)))
      .toBeVisible()
      .withTimeout(LONG_TIMEOUT_MS);
    await tapByText(E2E_EVIDENCE_SETTLE.attachTargetDescription, LONG_TIMEOUT_MS);
    await waitFor(element(by.id('attach-to-journal-confirm-content')))
      .toBeVisible()
      .withTimeout(LONG_TIMEOUT_MS);
    await waitFor(element(by.id('confirmation-primary-action')))
      .toBeVisible()
      .withTimeout(LONG_TIMEOUT_MS);
    await tapById('confirmation-primary-action', LONG_TIMEOUT_MS);
    await waitFor(element(by.id('transaction-inbox-screen')))
      .toBeVisible()
      .withTimeout(LONG_TIMEOUT_MS);

    await selectInboxFilter('processed');
    await waitForInboxItem(E2E_EVIDENCE_SETTLE.pendingAttachSmsId);
    await tapById(moreId, LONG_TIMEOUT_MS);
    await waitFor(element(by.id(detachId)))
      .toBeVisible()
      .withTimeout(LONG_TIMEOUT_MS);
    await tapById(detachId, LONG_TIMEOUT_MS);
    await waitFor(element(by.id('attach-to-journal-confirm-content')))
      .toBeVisible()
      .withTimeout(LONG_TIMEOUT_MS);
    await waitFor(element(by.id('confirmation-primary-action')))
      .toBeVisible()
      .withTimeout(LONG_TIMEOUT_MS);
    await tapById('confirmation-primary-action', LONG_TIMEOUT_MS);

    await selectInboxFilter('pending');
    await waitForInboxItem(E2E_EVIDENCE_SETTLE.pendingAttachSmsId);
  });
});
