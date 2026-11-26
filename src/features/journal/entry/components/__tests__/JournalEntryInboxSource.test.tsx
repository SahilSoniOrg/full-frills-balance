import { AppIcon, Icon } from '@/src/components/core';
import { AppConfig } from '@/src/constants/app-config';
import { transactionCaptureStrings } from '@/src/constants/copy/domains/transactionCaptureStrings';
import { preferences } from '@/src/services/preferences';
import { fireEvent, render, screen } from '@/src/testing/render';
import { TransactionDirection } from '@/src/types/enums';
import type { PlainInboxRecord } from '@/src/types/plainDtos';
import { JournalEntryInboxSource } from '../JournalEntryInboxSource';

function makeInboxRecord(overrides: Partial<PlainInboxRecord> = {}): PlainInboxRecord {
  return {
    id: 'inbox-1',
    channel: 'sms',
    deviceSourceId: 'dev-1',
    senderAddress: 'HDFC-BANK',
    rawBody: 'Spent INR 250 at Cafe',
    inputDate: new Date('2026-11-25T10:00:00Z').getTime(),
    parseStatus: 'parsed',
    direction: TransactionDirection.DEBIT,
    processingStatus: 'pending',
    ...overrides,
  };
}

describe('JournalEntryInboxSource', () => {
  beforeEach(() => {
    preferences.update({ isPrivacyMode: false });
  });

  afterEach(() => {
    preferences.update({ isPrivacyMode: false });
  });

  it('returns null when there are no items', () => {
    render(<JournalEntryInboxSource items={[]} isEdit={false} />);
    expect(screen.queryByTestId('journal-entry-inbox-source')).toBeNull();
  });

  it('uses shared copy and unavailable fallback for SMS sources', () => {
    const strings = AppConfig.strings.transactionFlow.inboxSource;
    const sms = makeInboxRecord({ rawBody: '' });
    render(<JournalEntryInboxSource items={[sms]} isEdit={false} />);

    expect(screen.getByText(strings.smsToTag)).toBeTruthy();
    fireEvent.press(screen.getByTestId('journal-entry-inbox-source-toggle'));
    expect(screen.getByText(strings.messageUnavailable)).toBeTruthy();
  });

  it('masks sender and message body in privacy mode', () => {
    preferences.update({ isPrivacyMode: true });
    const sms = makeInboxRecord();
    render(<JournalEntryInboxSource items={[sms]} isEdit={false} />);

    expect(screen.queryByText('HDFC-BANK')).toBeNull();
    fireEvent.press(screen.getByTestId('journal-entry-inbox-source-toggle'));
    expect(screen.getByText(AppConfig.strings.journalDetails.hiddenSms)).toBeTruthy();
    expect(screen.queryByText('Spent INR 250 at Cafe')).toBeNull();
  });

  it('unifies channel icons and channel fallbacks across header and expanded rows', () => {
    const strings = AppConfig.strings.transactionFlow.inboxSource;
    const email = makeInboxRecord({
      id: 'email-1',
      channel: 'email',
      senderAddress: undefined,
      rawBody: 'Receipt for order #12',
    });
    const voice = makeInboxRecord({
      id: 'voice-1',
      channel: 'voice',
      senderAddress: undefined,
      rawBody: 'Coffee five dollars',
    });

    const view = render(<JournalEntryInboxSource items={[email, voice]} isEdit />);

    expect(screen.getByText(strings.taggedInboxItem)).toBeTruthy();
    expect(screen.getByText(strings.linkedItemsCount(2))).toBeTruthy();

    // Header icon uses the first item's channel icon (Mail) before expansion.
    const collapsedIcons = view.UNSAFE_getAllByType(AppIcon).map(node => node.props.name);
    expect(collapsedIcons).toContain(Icon.Mail);
    expect(collapsedIcons).not.toContain(Icon.Inbox);

    fireEvent.press(screen.getByTestId('journal-entry-inbox-source-toggle'));

    expect(screen.getByText(transactionCaptureStrings.inboxChannelEmail)).toBeTruthy();
    expect(screen.getByText(transactionCaptureStrings.inboxChannelSpoken)).toBeTruthy();

    const expandedIcons = view.UNSAFE_getAllByType(AppIcon).map(node => node.props.name);
    expect(expandedIcons).toContain(Icon.Mail);
    expect(expandedIcons).toContain(Icon.Mic);
    expect(expandedIcons).not.toContain(Icon.Inbox);
  });
});
