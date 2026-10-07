import { JournalEntryCard } from '../JournalEntryCard';
import type { JournalEntryCardProps, JournalEntryLeg } from '@/src/types/journalEntryCard';
import { asAccountId } from '@/src/types/ids';
import { Icon } from '@/src/types/domainIcons';
import { preferences } from '@/src/services/preferences';
import { act, fireEvent, render } from '@/src/utils/test-utils';
import { formatClockTime, formatDate } from '@/src/utils/dateUtils';

import { getLayoutPath as contentLayout } from '@/src/testing/layoutAssertions';

jest.mock('@/src/hooks/useHourCyclePrefs', () => ({
  useHourCyclePrefs: () => ({ resolvedHourCycle: '12-hour' }),
}));

function leg(name: string, role: JournalEntryLeg['role']): JournalEntryLeg {
  return {
    id: name,
    accountId: asAccountId(name),
    name,
    role,
    fallbackIcon: Icon.Wallet,
    variant: 'default',
  };
}

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
  accountFlow: {
    primaryAccount: leg('Checking', 'SOURCE'),
    sources: [],
    destinations: [leg('Dining', 'DESTINATION')],
    neutral: [],
    showCurrencyCodes: false,
  },
  notes: 'Lunch with Sam',
  onPress: jest.fn(),
};

describe('JournalEntryCard', () => {
  beforeEach(() => act(() => preferences.privacy.setIsPrivacyMode(false)));
  afterEach(() => act(() => preferences.privacy.setIsPrivacyMode(false)));

  it('shows time in grouped feeds while retaining the full date and context for accessibility', () => {
    const { getByText, getByRole, queryByText } = render(
      <JournalEntryCard {...entry} dateDisplay="time" />,
    );
    const fullDate = formatDate(entry.transactionDate, { includeTime: true, hourCycle: '12-hour' });
    expect(getByText(formatClockTime(entry.transactionDate, '12-hour'))).toBeTruthy();
    expect(queryByText(fullDate)).toBeNull();
    const label = getByRole('button').props.accessibilityLabel;
    expect(label).toContain(fullDate);
    expect(label).toContain('From Checking');
    expect(label).toContain('To Dining');
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

  it('keeps account context and special labels while omitting the debt payment badge', () => {
    const { getByText, getByRole, queryByTestId, getByTestId, rerender } = render(
      <JournalEntryCard {...entry} />,
    );
    expect(getByText('Checking')).toBeTruthy();
    expect(getByText('Dining')).toBeTruthy();
    expect(getByText('Lunch with Sam')).toBeTruthy();
    expect(queryByTestId('transaction-type-badge')).toBeNull();

    rerender(
      <JournalEntryCard
        {...entry}
        presentation={{ ...entry.presentation, label: 'Debt Payment', showTypeBadge: false }}
      />,
    );
    expect(queryByTestId('transaction-type-badge')).toBeNull();
    expect(getByRole('button').props.accessibilityLabel).toContain('Debt Payment');
    rerender(
      <JournalEntryCard
        {...entry}
        presentation={{ ...entry.presentation, label: 'Refund', showTypeBadge: true }}
      />,
    );
    expect(getByTestId('transaction-type-badge')).toBeTruthy();
    expect(getByText('Refund')).toBeTruthy();
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

  it.each([false, true])(
    'keeps content geometry stable when entering selection mode (selected: %s)',
    isSelected => {
      const { getByTestId, queryByTestId, rerender } = render(<JournalEntryCard {...entry} />);
      const titleLayout = contentLayout(getByTestId('journal-entry-card-title'));
      const accountFlowLayout = contentLayout(getByTestId('transaction-account-flow'));

      rerender(<JournalEntryCard {...entry} isSelectionModeActive isSelected={isSelected} />);
      expect(contentLayout(getByTestId('journal-entry-card-title'))).toEqual(titleLayout);
      expect(contentLayout(getByTestId('transaction-account-flow'))).toEqual(accountFlowLayout);
      if (isSelected) {
        expect(
          getByTestId('journal-entry-card-selection-outline', { includeHiddenElements: true }),
        ).toHaveStyle({
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
        });
      } else {
        expect(
          queryByTestId('journal-entry-card-selection-outline', { includeHiddenElements: true }),
        ).toBeNull();
      }

      rerender(<JournalEntryCard {...entry} />);
      expect(contentLayout(getByTestId('journal-entry-card-title'))).toEqual(titleLayout);
      expect(contentLayout(getByTestId('transaction-account-flow'))).toEqual(accountFlowLayout);
      expect(
        queryByTestId('journal-entry-card-selection-outline', { includeHiddenElements: true }),
      ).toBeNull();
    },
  );
});
