import { JournalEntryCard } from '../JournalEntryCard';
import type { JournalEntryCardProps, JournalEntryLeg } from '@/src/types/journalEntryCard';
import { asAccountId } from '@/src/types/ids';
import { Icon } from '@/src/types/domainIcons';
import { preferences } from '@/src/services/preferences';
import { act, fireEvent, render, within, type RenderAPI } from '@/src/utils/test-utils';
import { formatClockTime } from '@/src/utils/dateUtils';
import { ThemeOverride } from '@/src/contexts/UIContext';
import { getThemeColors, ThemeIds } from '@/src/constants/design-tokens';
import { getContrastRatio, getLuminance } from '@/src/utils/color-math';
import { Dimensions, StyleSheet } from 'react-native';

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

const splitEntry: JournalEntryCardProps = {
  ...entry,
  title: 'Vacation booking',
  amount: 1000,
  accountFlow: {
    primaryAccount: leg('Checking', 'SOURCE'),
    sources: [leg('Credit Card', 'SOURCE')],
    destinations: [leg('Flights', 'DESTINATION'), leg('Hotel', 'DESTINATION')],
    neutral: [],
    showCurrencyCodes: false,
  },
};

function cardProps(overrides: Partial<JournalEntryCardProps> = {}): JournalEntryCardProps {
  return { ...entry, ...overrides, accountFlow: overrides.accountFlow ?? entry.accountFlow };
}

function oneToOneExpenseFlow() {
  return {
    primaryAccount: leg('Checking', 'SOURCE'),
    sources: [],
    destinations: [leg('Dining', 'DESTINATION')],
    neutral: [],
    showCurrencyCodes: false,
  };
}

function layoutFlow(
  { getByTestId }: Pick<RenderAPI, 'getByTestId'>,
  availableWidth: number,
  sourceWidth: number,
  destinationWidth: number,
) {
  const layout = (width: number) => ({
    nativeEvent: { layout: { x: 0, y: 0, width, height: 48 } },
  });
  fireEvent(getByTestId('transaction-account-flow'), 'layout', layout(availableWidth));
  fireEvent(getByTestId('transaction-source-group'), 'layout', layout(sourceWidth));
  fireEvent(getByTestId('transaction-destination-group'), 'layout', layout(destinationWidth));
}

describe('JournalAccountFlow via JournalEntryCard', () => {
  beforeEach(() => act(() => preferences.privacy.setIsPrivacyMode(false)));
  afterEach(() => act(() => preferences.privacy.setIsPrivacyMode(false)));

  it.each([
    {
      label: 'fits at default scale',
      fontScale: 1,
      widths: [320, 190, 94] as const,
      inline: true,
      checkA11y: false,
    },
    {
      label: 'stacks at enlarged text',
      fontScale: 2,
      widths: [320, 200, 150] as const,
      inline: false,
      checkA11y: true,
    },
  ])('$label for a simple expense flow', ({ fontScale, widths, inline, checkA11y }) => {
    const dimensions =
      fontScale === 1
        ? null
        : jest.spyOn(Dimensions, 'get').mockReturnValue({
            width: 320,
            height: 640,
            scale: 2,
            fontScale,
          });
    try {
      const screen = render(
        <JournalEntryCard {...cardProps({ accountFlow: oneToOneExpenseFlow() })} />,
      );
      layoutFlow(screen, widths[0], widths[1], widths[2]);
      const { getByTestId, queryByTestId, getByRole } = screen;
      expect(within(getByTestId('transaction-source-box')).getByText('Checking')).toBeTruthy();
      expect(within(getByTestId('transaction-destination-box')).getByText('Dining')).toBeTruthy();
      if (inline) {
        expect(getByTestId('transaction-flow-inline')).toBeTruthy();
        expect(
          getByTestId('transaction-flow-arrow', { includeHiddenElements: true }).props
            .accessibilityElementsHidden,
        ).toBe(true);
        expect(queryByTestId('transaction-flow-stacked')).toBeNull();
        expect(
          queryByTestId('transaction-destination-cue', { includeHiddenElements: true }),
        ).toBeNull();
      } else {
        expect(getByTestId('transaction-flow-stacked')).toBeTruthy();
        expect(
          within(getByTestId('transaction-destination-box')).getByTestId(
            'transaction-destination-cue',
            { includeHiddenElements: true },
          ),
        ).toBeTruthy();
        expect(queryByTestId('transaction-flow-arrow', { includeHiddenElements: true })).toBeNull();
        if (checkA11y) {
          const label = getByRole('button').props.accessibilityLabel;
          expect(label).toContain('From Checking');
          expect(label).toContain('To Dining');
        }
      }
    } finally {
      dimensions?.mockRestore();
    }
  });

  it('adapts multi-leg groups to available width and preserves every account in its role', () => {
    const screen = render(<JournalEntryCard {...splitEntry} />);
    layoutFlow(screen, 400, 165, 190);
    expect(screen.getByTestId('transaction-flow-inline')).toBeTruthy();
    layoutFlow(screen, 320, 165, 190);
    const { getByTestId, queryByTestId } = screen;
    const sources = within(getByTestId('transaction-source-box'));
    const destinations = within(getByTestId('transaction-destination-box'));
    expect(sources.getByText('Checking')).toBeTruthy();
    expect(sources.getByText('Credit Card')).toBeTruthy();
    expect(sources.queryByText('Flights')).toBeNull();
    expect(destinations.getByText('Flights')).toBeTruthy();
    expect(destinations.getByText('Hotel')).toBeTruthy();
    expect(destinations.queryByText('Checking')).toBeNull();
    expect(getByTestId('transaction-flow-stacked')).toBeTruthy();
    expect(
      destinations.getByTestId('transaction-destination-cue', { includeHiddenElements: true }).props
        .accessibilityElementsHidden,
    ).toBe(true);
    expect(
      sources.queryByTestId('transaction-destination-cue', { includeHiddenElements: true }),
    ).toBeNull();
    expect(queryByTestId('transaction-flow-arrow', { includeHiddenElements: true })).toBeNull();
  });

  it('preserves account-content width when the destination cue is clamped and the card widens', () => {
    const screen = render(
      <JournalEntryCard
        {...entry}
        accountFlow={{
          sources: [leg('HDFC Infinia', 'SOURCE'), leg('HDFC RuPay UPI', 'SOURCE')],
          destinations: [leg('Chayan', 'DESTINATION'), leg('Food & Drinks (INR)', 'DESTINATION')],
          neutral: [],
          showCurrencyCodes: false,
        }}
      />,
    );
    layoutFlow(screen, 232, 229, 219);
    // Adding the cue clamps the rendered destination box to the narrow card width.
    fireEvent(screen.getByTestId('transaction-destination-group'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 232, height: 44 } },
    });
    fireEvent(screen.getByTestId('transaction-account-flow'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 346, height: 70 } },
    });
    // The new width remounts native groups and measures their account contents again.
    layoutFlow(screen, 346, 229, 219);
    // The content needs its original 219pt plus the 24pt cue, not the shrunken width.
    expect(
      StyleSheet.flatten(screen.getByTestId('transaction-destination-group').props.style).width,
    ).toBe(243);
  });

  it('retains fitting account measurements when posting IDs refresh as a stacked card widens', () => {
    const accountFlow = {
      sources: [leg('HDFC RuPay UPI', 'SOURCE')],
      destinations: [leg('Groceries (INR)', 'DESTINATION')],
      neutral: [],
      showCurrencyCodes: false,
    };
    const screen = render(<JournalEntryCard {...entry} accountFlow={accountFlow} />);
    layoutFlow(screen, 176, 127, 149);
    expect(screen.getByTestId('transaction-flow-stacked')).toBeTruthy();

    screen.rerender(
      <JournalEntryCard
        {...entry}
        accountFlow={{
          ...accountFlow,
          sources: accountFlow.sources.map(account => ({ ...account, id: 'new-source' })),
          destinations: accountFlow.destinations.map(account => ({
            ...account,
            id: 'new-destination',
          })),
        }}
      />,
    );
    // Resizing remounts the groups, so unchanged frames also emit fresh measurements.
    fireEvent(screen.getByTestId('transaction-account-flow'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 346, height: 48 } },
    });
    layoutFlow(screen, 346, 127, 149);
    expect(screen.getByTestId('transaction-flow-inline')).toBeTruthy();
    expect(screen.queryByTestId('transaction-flow-stacked')).toBeNull();
  });

  it('rechecks shorter accounts in a recycled stacked card without another container layout event', () => {
    const screen = render(
      <JournalEntryCard
        {...entry}
        accountFlow={{
          sources: [leg('HDFC RuPay UPI Savings', 'SOURCE')],
          destinations: [leg('Food & Drinks (INR) Travel', 'DESTINATION')],
          neutral: [],
          showCurrencyCodes: false,
        }}
      />,
    );
    layoutFlow(screen, 346, 190, 214);
    expect(screen.getByTestId('transaction-flow-stacked')).toBeTruthy();

    screen.rerender(
      <JournalEntryCard
        {...entry}
        accountFlow={{
          sources: [leg('HDFC RuPay UPI', 'SOURCE')],
          destinations: [leg('Groceries (INR)', 'DESTINATION')],
          neutral: [],
          showCurrencyCodes: false,
        }}
      />,
    );
    // The container has the same frame; only the account groups change size.
    for (const [testID, width] of [
      ['transaction-source-group', 127],
      ['transaction-destination-group', 149],
    ] as const) {
      fireEvent(screen.getByTestId(testID), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width, height: 22 } },
      });
    }
    expect(screen.getByTestId('transaction-flow-inline')).toBeTruthy();
    expect(screen.queryByTestId('transaction-flow-stacked')).toBeNull();
  });

  it.each(['SOURCE', 'DESTINATION', 'NEUTRAL'] as const)(
    'does not draw a flow connector when only %s accounts exist',
    role => {
      const { queryByTestId, getByRole } = render(
        <JournalEntryCard
          {...cardProps({
            accountFlow: {
              primaryAccount: leg('Only account', role),
              sources: role === 'SOURCE' ? [leg('Peer source', role)] : [],
              destinations: role === 'DESTINATION' ? [leg('Peer destination', role)] : [],
              neutral: [],
              showCurrencyCodes: false,
            },
          })}
        />,
      );
      expect(queryByTestId('transaction-flow-arrow', { includeHiddenElements: true })).toBeNull();
      expect(
        queryByTestId('transaction-destination-cue', { includeHiddenElements: true }),
      ).toBeNull();
      expect(getByRole('button').props.accessibilityLabel).toContain('Only account');
      expect(queryByTestId('transaction-source-box') != null).toBe(role === 'SOURCE');
      expect(queryByTestId('transaction-destination-box') != null).toBe(role === 'DESTINATION');
    },
  );

  it('uses saved account colors on both source and destination names', () => {
    const { getByText, rerender } = render(
      <ThemeOverride mode="dark" themeId={ThemeIds.DEEP_SPACE}>
        <JournalEntryCard
          {...entry}
          accountFlow={{
            primaryAccount: { ...leg('Checking', 'SOURCE'), variant: 'asset', color: '#CDAA6B' },
            sources: [],
            destinations: [
              { ...leg('Savings', 'DESTINATION'), variant: 'asset', color: '#65C6AD' },
            ],
            neutral: [],
            showCurrencyCodes: false,
          }}
        />
      </ThemeOverride>,
    );
    expect(getByText('Checking')).toHaveStyle({ color: '#CDAA6B' });
    expect(getByText('Savings')).toHaveStyle({ color: '#65C6AD' });
    rerender(
      <ThemeOverride mode="dark" themeId={ThemeIds.DEEP_SPACE}>
        <JournalEntryCard
          {...entry}
          accountFlow={{
            primaryAccount: { ...leg('Checking', 'SOURCE'), variant: 'asset', color: '#C99AFF' },
            sources: [],
            destinations: [
              { ...leg('Savings', 'DESTINATION'), variant: 'asset', color: '#65C6AD' },
            ],
            neutral: [],
            showCurrencyCodes: false,
          }}
        />
      </ThemeOverride>,
    );
    expect(getByText('Checking')).toHaveStyle({ color: '#C99AFF' });
  });

  it('uses matching account-name typography for source and destination in dark mode', () => {
    const { getByText } = render(
      <ThemeOverride mode="dark" themeId={ThemeIds.DEEP_SPACE}>
        <JournalEntryCard
          {...entry}
          accountFlow={{
            sources: [leg('Checking', 'SOURCE')],
            destinations: [leg('Flights', 'DESTINATION')],
            neutral: [],
            showCurrencyCodes: false,
          }}
        />
      </ThemeOverride>,
    );
    const sourceStyle = StyleSheet.flatten(getByText('Checking').props.style);
    const destinationStyle = StyleSheet.flatten(getByText('Flights').props.style);
    expect(sourceStyle.fontSize).toBe(12);
    expect(destinationStyle.fontSize).toBe(sourceStyle.fontSize);
    expect(destinationStyle.fontFamily).toBe(sourceStyle.fontFamily);
  });

  it.each(['dark', 'light'] as const)(
    'keeps missing, invalid, and unreadable account colors readable in %s mode',
    mode => {
      const theme = getThemeColors(ThemeIds.DEEP_SPACE, mode);
      const { getByText } = render(
        <ThemeOverride mode={mode} themeId={ThemeIds.DEEP_SPACE}>
          <JournalEntryCard
            {...entry}
            accountFlow={{
              sources: [{ ...leg('Checking', 'SOURCE'), variant: 'asset' }],
              destinations: [
                { ...leg('Invalid', 'DESTINATION'), variant: 'asset', color: 'bad-color' },
                { ...leg('Unreadable', 'DESTINATION'), variant: 'asset', color: theme.surface },
              ],
              neutral: [],
              showCurrencyCodes: false,
            }}
          />
        </ThemeOverride>,
      );
      const sourceColor = StyleSheet.flatten(getByText('Checking').props.style).color;
      for (const name of ['Checking', 'Invalid', 'Unreadable']) {
        const color = StyleSheet.flatten(getByText(name).props.style).color;
        if (name !== 'Unreadable') expect(color).toBe(sourceColor);
        expect(
          getContrastRatio(getLuminance(color), getLuminance(theme.assetLight)),
        ).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it('shows every account name and only the main amount, with no legacy overflow badge', () => {
    const { getByText, getByRole, queryByText, getAllByTestId, getByTestId } = render(
      <JournalEntryCard {...splitEntry} />,
    );
    expect(getByText('Checking')).toBeTruthy();
    expect(queryByText('From: Checking')).toBeNull();
    expect(queryByText('From')).toBeNull();
    expect(queryByText('Also from')).toBeNull();
    const sourceAccounts = within(getByTestId('transaction-source-box')).getAllByTestId(
      'transaction-account-leg',
    );
    expect(within(sourceAccounts[0]).getByText('Checking')).toBeTruthy();
    expect(within(sourceAccounts[1]).getByText('Credit Card')).toBeTruthy();
    expect(getByText('Credit Card')).toBeTruthy();
    expect(queryByText('To')).toBeNull();
    expect(getByText('Flights')).toBeTruthy();
    expect(getByText('Hotel')).toBeTruthy();
    expect(getAllByTestId('transaction-account-leg')).toHaveLength(4);
    expect(queryByText('+2 more')).toBeNull();
    const label = getByRole('button').props.accessibilityLabel;
    expect(label).toContain('1,000.00');
    expect(getByText(/1,000\.00/)).toBeTruthy();
    expect(label).toContain('From Checking');
  });

  it('masks the main amount while keeping account names when privacy toggles', () => {
    const { getByRole, getAllByText, queryByText } = render(<JournalEntryCard {...splitEntry} />);
    act(() => preferences.privacy.setIsPrivacyMode(true));
    expect(getAllByText('••••')).toHaveLength(1);
    const label = getByRole('button').props.accessibilityLabel;
    expect(label).not.toContain('1,000.00');
    expect(queryByText(/1,000\.00/)).toBeNull();
    expect(label).toContain('From Checking');
    expect(label).toContain('From Credit Card');
    expect(label).toContain('To Flights');
    expect(label).toContain('To Hotel');
    act(() => preferences.privacy.setIsPrivacyMode(false));
    expect(getByRole('button').props.accessibilityLabel).toContain('1,000.00');
  });

  it('keeps account names and the scoped main amount in a destination-scoped card', () => {
    const { getByText, getByRole } = render(
      <JournalEntryCard
        {...splitEntry}
        amount={200}
        presentation={{ ...entry.presentation, amountPrefix: '+ ' }}
        accountFlow={{
          ...splitEntry.accountFlow!,
          primaryAccount: leg('Savings', 'DESTINATION'),
          sources: [leg('Checking', 'SOURCE')],
          destinations: [],
        }}
      />,
    );
    expect(getByText('Savings')).toBeTruthy();
    expect(getByText('Checking')).toBeTruthy();
    expect(getByRole('button').props.accessibilityLabel).toContain('To Savings');
  });

  it('keeps the amount and footer time when there are no account legs', () => {
    const { getByRole, getByText, queryByTestId } = render(
      <JournalEntryCard
        {...entry}
        dateDisplay="time"
        accountFlow={{ sources: [], destinations: [], neutral: [], showCurrencyCodes: false }}
      />,
    );
    expect(getByText(formatClockTime(entry.transactionDate, '12-hour'))).toBeTruthy();
    expect(getByRole('button').props.accessibilityLabel).toContain('18.50');
    expect(queryByTestId('transaction-source-box')).toBeNull();
    expect(queryByTestId('transaction-destination-box')).toBeNull();
  });

  it('renders all ten allocation legs', () => {
    const { getByTestId, getByText } = render(
      <JournalEntryCard
        {...splitEntry}
        accountFlow={{
          ...splitEntry.accountFlow!,
          sources: [],
          destinations: Array.from({ length: 10 }, (_, index) =>
            leg(`Category ${index + 1}`, 'DESTINATION'),
          ),
        }}
      />,
    );
    expect(
      within(getByTestId('transaction-destination-box')).getAllByTestId('transaction-account-leg'),
    ).toHaveLength(10);
    expect(getByText('Category 10')).toBeTruthy();
  });

  it('keeps neutral accounts separate without inventing a source or destination', () => {
    const { getByText, getByRole, queryByText } = render(
      <JournalEntryCard
        {...splitEntry}
        accountFlow={{
          primaryAccount: leg('Clearing', 'NEUTRAL'),
          sources: [],
          destinations: [],
          neutral: [leg('Adjustment', 'NEUTRAL')],
          showCurrencyCodes: false,
        }}
      />,
    );
    expect(getByText('Other accounts:')).toBeTruthy();
    expect(getByText('Clearing,')).toBeTruthy();
    expect(getByText('Adjustment')).toBeTruthy();
    expect(queryByText('From')).toBeNull();
    expect(queryByText('To')).toBeNull();
    const label = getByRole('button').props.accessibilityLabel;
    expect(label).toContain('Account Clearing');
    expect(label).toContain('Account Adjustment');
    expect(label).not.toContain('From Clearing');
  });

  it('disambiguates the main currency without restoring leg amounts or codes', () => {
    const { getByText } = render(
      <JournalEntryCard
        {...splitEntry}
        currencyCode="USD"
        accountFlow={{
          ...splitEntry.accountFlow!,
          primaryAccount: leg('Travel wallet', 'SOURCE'),
          showCurrencyCodes: true,
        }}
      />,
    );
    expect(getByText('USD')).toBeTruthy();
  });

  it('announces selection on the card and preserves gestures', () => {
    const onPress = jest.fn();
    const onLongPress = jest.fn();
    const { getByRole } = render(
      <JournalEntryCard
        {...splitEntry}
        isSelected
        isSelectionModeActive
        onPress={onPress}
        onLongPress={onLongPress}
      />,
    );
    const button = getByRole('button');
    expect(button.props.accessibilityState.selected).toBe(true);
    fireEvent.press(button);
    fireEvent(button, 'longPress');
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('gives read-only cards the same complete accessible and private context', () => {
    preferences.privacy.setIsPrivacyMode(true);
    const { getByTestId } = render(<JournalEntryCard {...splitEntry} onPress={undefined} />);
    const label = getByTestId('journal-entry-card').props.accessibilityLabel;
    expect(label).toContain('Checking');
    expect(label).toContain('Credit Card');
    expect(label).toContain('Hotel');
    expect(label).toContain('••••');
  });
});
