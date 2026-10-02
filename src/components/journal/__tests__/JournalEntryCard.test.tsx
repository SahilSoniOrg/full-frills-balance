import { JournalEntryCard, type JournalEntryCardProps } from '../JournalEntryCard';
import { Icon } from '@/src/types/domainIcons';
import { preferences } from '@/src/services/preferences';
import { fireEvent, render } from '@/src/utils/test-utils';
import { formatClockTime, formatDate } from '@/src/utils/dateUtils';

jest.mock('@/src/hooks/useHourCyclePrefs', () => ({
  useHourCyclePrefs: () => ({ resolvedHourCycle: '12-hour' }),
}));

const entry: JournalEntryCardProps = {
  title: 'Cafe purchase',
  amount: 18.5,
  currencyCode: 'USD',
  transactionDate: new Date(2026, 8, 30, 13),
  presentation: {
    label: 'Expense',
    showTypeBadge: false,
    typeIcon: Icon.ArrowDown,
    typeColor: 'error',
    amountPrefix: '− ',
  },
  badges: [{ text: 'From: Checking' }, { text: 'To: Dining' }],
  notes: 'Lunch with Sam',
  onPress: jest.fn(),
};

describe('JournalEntryCard', () => {
  beforeEach(() => preferences.privacy.setIsPrivacyMode(false));
  afterEach(() => preferences.privacy.setIsPrivacyMode(false));

  it('shows time in grouped feeds while retaining the full date and context for accessibility', () => {
    const { getByText, getByRole, queryByText } = render(
      <JournalEntryCard {...entry} dateDisplay="time" />,
    );
    const fullDate = formatDate(entry.transactionDate, { includeTime: true, hourCycle: '12-hour' });
    expect(getByText(formatClockTime(entry.transactionDate, '12-hour'))).toBeTruthy();
    expect(queryByText(fullDate)).toBeNull();
    const label = getByRole('button').props.accessibilityLabel;
    expect(label).toContain(fullDate);
    expect(label).toContain('From: Checking');
    expect(label).toContain('To: Dining');
    expect(label).toContain('Lunch with Sam');
    expect(label).toContain('18.50');
  });

  it('masks the accessible amount as well as the visible amount in privacy mode', () => {
    preferences.privacy.setIsPrivacyMode(true);
    const { getByRole, getByText, queryByText } = render(<JournalEntryCard {...entry} />);
    const label = getByRole('button').props.accessibilityLabel;
    expect(label).toContain('••••');
    expect(label).not.toContain('18.50');
    expect(getByText('••••')).toBeTruthy();
    expect(queryByText(/18\.50/)).toBeNull();
  });

  it('keeps account badges and notes while removing only the routine duplicate type badge', () => {
    const { getByText, queryByTestId, getByTestId, rerender } = render(
      <JournalEntryCard {...entry} />,
    );
    expect(getByText('From: Checking')).toBeTruthy();
    expect(getByText('To: Dining')).toBeTruthy();
    expect(getByText('Lunch with Sam')).toBeTruthy();
    expect(queryByTestId('transaction-type-badge')).toBeNull();

    rerender(
      <JournalEntryCard {...entry} presentation={{ ...entry.presentation, label: 'Debt Payment', showTypeBadge: true }} />,
    );
    expect(getByTestId('transaction-type-badge')).toBeTruthy();
    expect(getByText('Debt Payment')).toBeTruthy();
  });

  it('retains press and long-press actions', () => {
    const onPress = jest.fn();
    const onLongPress = jest.fn();
    const { getByRole } = render(
      <JournalEntryCard {...entry} onPress={onPress} onLongPress={onLongPress} />,
    );
    fireEvent.press(getByRole('button'));
    fireEvent(getByRole('button'), 'longPress');
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });
});
