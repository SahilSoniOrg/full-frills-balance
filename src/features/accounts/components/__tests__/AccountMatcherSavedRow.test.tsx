import { fireEvent, render, screen, waitFor } from '@/src/utils/test-utils';
import { AccountMatcherSavedRow } from '../AccountMatcherSavedRow';
import type { AccountMatcherMatches } from '@/src/services/accounts/accountMatcherMatchQueries';
import { asAccountId, asJournalId, asWorkplaceId } from '@/src/types/ids';
import { InboxParseStatus, InboxProcessingStatus, TransactionDirection } from '@/src/types/enums';
import { AppNavigation } from '@/src/utils/navigation';

jest.mock('@/src/utils/navigation', () => ({ AppNavigation: { toJournalDetails: jest.fn() } }));
jest.mock('@/src/components/core/AppToggle', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { Pressable } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    AppToggle: ({
      value,
      onValueChange,
      accessibilityLabel,
    }: {
      value: boolean;
      onValueChange: (value: boolean) => void;
      accessibilityLabel?: string;
    }) =>
      React.createElement(Pressable, {
        accessibilityRole: 'switch',
        accessibilityLabel,
        accessibilityState: { checked: value },
        onPress: () => onValueChange(!value),
      }),
  };
});

const accountId = asAccountId('match-details-account');
const journalId = asJournalId('match-details-journal');
const matcher = {
  id: 'saved-pattern',
  isEnabled: false,
  definitionJson: JSON.stringify({
    version: 1,
    sender: { op: 'contains', value: 'BANKXYZ' },
    body: { kind: 'fragments', fragments: ['card'] },
  }),
};
const matches: AccountMatcherMatches = {
  messages: [
    {
      message: {
        id: 'matched-sms',
        workplaceId: asWorkplaceId('match-details-workplace'),
        channel: 'sms',
        deviceSourceId: 'source-sms',
        senderAddress: 'BANKXYZ',
        rawBody: 'Your card payment',
        inputDate: Date.UTC(2026, 10, 4),
        inputFingerprint: 'match-fingerprint',
        parseStatus: InboxParseStatus.PARSED,
        parsedMerchant: 'Corner Coffee',
        parsedAmount: 12.5,
        parsedCurrencyCode: 'USD',
        direction: TransactionDirection.DEBIT,
        processingStatus: InboxProcessingStatus.IMPORTED,
        firstSeenAt: 1,
        lastScannedAt: 1,
        linkedJournalId: journalId,
        linkedAccountIds: [accountId],
        linkedAccountNames: ['Checking'],
      },
      spans: [{ start: 5, end: 9 }],
      journal: { id: journalId, description: 'Coffee payment', journalDate: Date.UTC(2026, 10, 4) },
    },
  ],
  journals: [{ id: journalId, description: 'Coffee payment', journalDate: Date.UTC(2026, 10, 4) }],
  indeterminateCount: 0,
};
const defaultProps = {
  matcher,
  eligible: true,
  privateMode: false,
  warning: null,
  matches,
  isLoading: false,
  error: null,
  onEdit: jest.fn(),
  onToggle: jest.fn().mockResolvedValue(undefined),
};

describe('saved account matcher details', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows matching SMS for a disabled pattern and opens the journal attached to that SMS', () => {
    render(<AccountMatcherSavedRow {...defaultProps} />);
    expect(screen.queryByText('Coffee payment')).toBeNull();
    fireEvent.press(screen.getByTestId('account-matcher-matches-saved-pattern'));
    expect(
      screen.getByText('Recognition is off. These messages still match the saved conditions.'),
    ).toBeTruthy();
    expect(screen.getByText('Coffee payment')).toBeTruthy();
    expect(screen.getByText('Corner Coffee')).toBeTruthy();
    expect(screen.queryByTestId('account-matcher-sms-saved-pattern-matched-sms')).toBeNull();
    fireEvent.press(screen.getByTestId('account-matcher-read-sms-saved-pattern-matched-sms'));
    expect(screen.getByTestId('account-matcher-sms-saved-pattern-matched-sms')).toBeTruthy();
    fireEvent.press(screen.getByTestId('account-matcher-journal-saved-pattern-matched-sms'));
    expect(AppNavigation.toJournalDetails).toHaveBeenCalledWith(journalId);
  });

  it('uses the app switch and forwards its next enabled state', async () => {
    render(<AccountMatcherSavedRow {...defaultProps} />);
    const toggle = screen.getByRole('switch');
    expect(toggle.props.accessibilityState.checked).toBe(false);
    fireEvent.press(toggle);
    await waitFor(() => expect(defaultProps.onToggle).toHaveBeenCalledWith(true));
  });

  it('masks the sender, SMS, and linked-journal description in privacy mode', () => {
    render(<AccountMatcherSavedRow {...defaultProps} privateMode />);
    fireEvent.press(screen.getByTestId('account-matcher-conditions-saved-pattern'));
    fireEvent.press(screen.getByTestId('account-matcher-matches-saved-pattern'));
    fireEvent.press(screen.getByTestId('account-matcher-read-sms-saved-pattern-matched-sms'));
    expect(screen.queryByText(/BANKXYZ/)).toBeNull();
    expect(screen.queryByText('Corner Coffee')).toBeNull();
    expect(screen.queryByText(/12\.50/)).toBeNull();
    expect(screen.queryByText('card')).toBeNull();
    expect(screen.queryByText('Coffee payment')).toBeNull();
    expect(screen.queryByText('Your card payment')).toBeNull();
  });

  it('reveals the saved conditions without expanding matching SMS', () => {
    render(<AccountMatcherSavedRow {...defaultProps} />);
    expect(screen.queryByText('card')).toBeNull();
    fireEvent.press(screen.getByTestId('account-matcher-conditions-saved-pattern'));
    expect(screen.getByText('card')).toBeTruthy();
    expect(screen.queryByTestId('account-matcher-match-details-saved-pattern')).toBeNull();
    fireEvent.press(screen.getByTestId('account-matcher-conditions-saved-pattern'));
    expect(screen.queryByText('card')).toBeNull();
  });
});
