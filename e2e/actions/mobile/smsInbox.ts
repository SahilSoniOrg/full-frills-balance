import { element, by, waitFor } from 'detox';
import { smsInbox, tabs } from '../../screens';
import { LONG_TIMEOUT_MS } from '../../constants/timeouts';
import { assertVisibleById, assertTextVisible } from '../assertions';
import { tapById } from './elementActions';
import { openDashboardTab } from './flows';

export async function openSmsInboxFromSettings(): Promise<void> {
  await openDashboardTab();
  await tapById(tabs.settings, LONG_TIMEOUT_MS);
  await tapById(smsInbox.settingsAutomation, LONG_TIMEOUT_MS);
  await tapById(smsInbox.settingsSmsInbox, LONG_TIMEOUT_MS);
  await assertVisibleById(smsInbox.screen, LONG_TIMEOUT_MS);
}

export async function selectInboxFilter(filter: 'pending' | 'duplicates'): Promise<void> {
  const filterId = filter === 'duplicates' ? smsInbox.filterDuplicates : smsInbox.filterPending;
  await tapById(filterId, LONG_TIMEOUT_MS);
}

export async function waitForInboxItem(deviceSourceId: string): Promise<void> {
  await waitFor(element(by.id(smsInbox.item(deviceSourceId))))
    .toExist()
    .withTimeout(LONG_TIMEOUT_MS);
}

export async function tapCompareDuplicate(deviceSourceId: string): Promise<void> {
  await tapById(smsInbox.compareDuplicate(deviceSourceId), LONG_TIMEOUT_MS);
}

export async function refreshSmsInbox(): Promise<void> {
  await tapById(smsInbox.refreshSms, LONG_TIMEOUT_MS);
}

export async function assertJournalDetailsVisible(): Promise<void> {
  await assertTextVisible('UPI Payment', LONG_TIMEOUT_MS);
  await waitFor(element(by.id('edit-button')))
    .toExist()
    .withTimeout(LONG_TIMEOUT_MS);
}
