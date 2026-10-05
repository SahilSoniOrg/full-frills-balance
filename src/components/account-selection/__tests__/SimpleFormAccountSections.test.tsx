import { SimpleFormAccountSections } from '../SimpleFormAccountSections';
import { AccountPickerNode } from '../AccountPickerPanel.parts';
import { ArchiveVisibilityScopeProvider } from '@/src/contexts/ArchiveVisibilityScope';
import { AppConfig } from '@/src/constants';
import { AccountType } from '@/src/types/enums';
import { asAccountId, EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';
import * as accountCategory from '@/src/utils/accountCategory';
import { act, fireEvent, render, screen, within } from '@/src/utils/test-utils';
import React from 'react';
import { StyleSheet } from 'react-native';
import type { AccountPickerListItem } from '../accountPickerRows';

jest.mock('@shopify/flash-list', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native') as typeof import('react-native');
  return {
    FlashList: ({
      data,
      renderItem,
      testID,
    }: {
      data: AccountPickerListItem[];
      renderItem: (info: { item: AccountPickerListItem; index: number }) => React.ReactNode;
      testID?: string;
    }) => (
      <View testID={testID}>
        {data.map((item, index) => (
          <View key={item.key}>{renderItem({ item, index })}</View>
        ))}
      </View>
    ),
  };
});

jest.mock('@/src/hooks/use-reduced-motion', () => ({
  useReducedMotion: () => true,
}));

const mockAccounts: AccountFields[] = [
  {
    id: asAccountId('acc-cash'),
    name: 'Cash Wallet',
    accountType: AccountType.ASSET,
    currencyCode: 'INR',
  } as AccountFields,
  {
    id: asAccountId('acc-bank'),
    name: 'HDFC Bank',
    accountType: AccountType.ASSET,
    currencyCode: 'INR',
  } as AccountFields,
];

type SectionsProps = React.ComponentProps<typeof SimpleFormAccountSections>;

function renderWithScope(ui: React.ReactElement) {
  return render(<ArchiveVisibilityScopeProvider>{ui}</ArchiveVisibilityScopeProvider>);
}

function renderSections(overrides: Partial<SectionsProps> = {}) {
  const onSelectSource = overrides.onSelectSource ?? jest.fn();
  const onSelectDestination = overrides.onSelectDestination ?? jest.fn();
  const onToggleExpansion = overrides.onToggleExpansion ?? jest.fn();
  return renderWithScope(
    <SimpleFormAccountSections
      expansionPosition="left"
      onToggleExpansion={onToggleExpansion}
      sourceLabel="Paid with"
      sourceAccounts={mockAccounts}
      onSelectSource={onSelectSource}
      destLabel="Spend on"
      destAccounts={mockAccounts}
      onSelectDestination={onSelectDestination}
      {...overrides}
    />,
  );
}

function rerenderSections(
  view: ReturnType<typeof renderWithScope>,
  overrides: Partial<SectionsProps> = {},
) {
  const onSelectSource = overrides.onSelectSource ?? jest.fn();
  const onSelectDestination = overrides.onSelectDestination ?? jest.fn();
  const onToggleExpansion = overrides.onToggleExpansion ?? jest.fn();
  view.rerender(
    <ArchiveVisibilityScopeProvider>
      <SimpleFormAccountSections
        expansionPosition="left"
        onToggleExpansion={onToggleExpansion}
        sourceLabel="Paid with"
        sourceAccounts={mockAccounts}
        onSelectSource={onSelectSource}
        destLabel="Spend on"
        destAccounts={mockAccounts}
        onSelectDestination={onSelectDestination}
        {...overrides}
      />
    </ArchiveVisibilityScopeProvider>,
  );
}

function pillHasWrappingAncestor(accountId: string): boolean {
  const pill = screen.getByTestId(`account-picker-option-${accountId}`);
  let ancestor: typeof pill | null = pill.parent;
  while (ancestor) {
    if (StyleSheet.flatten(ancestor.props.style)?.flexWrap === 'wrap') return true;
    ancestor = ancestor.parent;
  }
  return false;
}

describe('SimpleFormAccountSections selection and clear', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['typical list', mockAccounts, 'acc-cash', false],
    [
      'large recycled list',
      Array.from({ length: 40 }, (_, index) => ({
        ...mockAccounts[0],
        id: asAccountId(`large-${index}`),
        name: `Account ${index}`,
      })),
      'large-0',
      true,
    ],
  ] as const)('keeps flowing pills for a %s', (_label, accounts, sampleId, recycled) => {
    renderSections({ sourceAccounts: accounts, destAccounts: accounts });
    if (recycled) {
      expect(screen.getByTestId('journal-account-folder-list')).toBeTruthy();
    } else {
      expect(screen.queryByTestId('journal-account-folder-list')).toBeNull();
      expect(screen.queryByTestId('show-archived-button')).toBeNull();
    }
    expect(pillHasWrappingAncestor(sampleId)).toBe(true);
  });

  it('keeps the chevron in the standard header and removes it in compact mode', () => {
    const view = renderWithScope(
      <AccountPickerNode
        account={mockAccounts[0]}
        emptyPrompt="Choose account"
        isExpanded={false}
        label="Paid from"
        onPress={jest.fn()}
        testID="standard-account-node"
      />,
    );

    expect(
      within(screen.getByTestId('standard-account-node')).getByTestId('account-node-chevron'),
    ).toBeTruthy();

    view.rerender(
      <ArchiveVisibilityScopeProvider>
        <AccountPickerNode
          account={mockAccounts[0]}
          emptyPrompt="Choose account"
          isExpanded={false}
          label="Paid from"
          showLabel={false}
          onPress={jest.fn()}
          testID="compact-account-node"
        />
      </ArchiveVisibilityScopeProvider>,
    );

    expect(
      within(screen.getByTestId('compact-account-node')).queryByTestId('account-node-chevron'),
    ).toBeNull();
  });

  it('keeps the original selection when tapping the already-selected pill', () => {
    const onSelectSource = jest.fn();
    renderSections({ sourceAccount: mockAccounts[0], onSelectSource });

    act(() => {
      fireEvent.press(screen.getByTestId('account-picker-option-acc-cash'));
    });

    expect(onSelectSource).toHaveBeenCalledWith(mockAccounts[0].id);
  });

  it.each([
    ['selected', mockAccounts[0], true],
    ['unselected', undefined, false],
  ] as const)('renders Clear only when an account is %s', (_label, sourceAccount, visible) => {
    const onSelectSource = jest.fn();
    renderSections({ sourceAccount, onSelectSource });

    if (visible) {
      act(() => {
        fireEvent.press(screen.getByTestId('clear-selected-account-button'));
      });
      expect(onSelectSource).toHaveBeenCalledWith(EMPTY_ACCOUNT_ID);
    } else {
      expect(screen.queryByTestId('clear-selected-account-button')).toBeNull();
    }
  });

  it('keeps the selected archived account visible while archived accounts are hidden', () => {
    const archivedAccount = {
      ...mockAccounts[0],
      id: asAccountId('acc-archived'),
      archivedAt: new Date(),
    } as AccountFields;

    renderSections({
      sourceAccount: archivedAccount,
      sourceAccounts: [archivedAccount],
    });

    expect(screen.getByTestId('account-picker-option-acc-archived')).toBeTruthy();
  });

  it('clears the destination explicitly and keeps it selected when reconfirmed', () => {
    const onSelectDestination = jest.fn();
    renderSections({
      expansionPosition: 'right',
      destAccount: mockAccounts[1],
      onSelectDestination,
    });

    act(() => {
      fireEvent.press(screen.getByTestId('clear-selected-account-button'));
    });
    expect(onSelectDestination).toHaveBeenCalledWith(EMPTY_ACCOUNT_ID);

    act(() => {
      fireEvent.press(screen.getByTestId('account-picker-option-acc-bank'));
    });
    expect(onSelectDestination).toHaveBeenLastCalledWith(mockAccounts[1].id);
  });

  it.each([
    ['expense', AppConfig.strings.transactionFlow.simpleEntry.chooseCategory],
    ['income', AppConfig.strings.transactionFlow.simpleEntry.chooseAccount],
    ['transfer', AppConfig.strings.transactionFlow.simpleEntry.chooseAccount],
  ] as const)('uses the configured destination prompt for %s entries', (type, prompt) => {
    renderSections({ expansionPosition: 'right', type });

    expect(
      within(screen.getByTestId('journal-route-destination-node')).getByText(prompt),
    ).toBeTruthy();
  });

  it.each([
    ['left', 'source'],
    ['right', 'destination'],
  ] as const)('preserves the active %s role when creating an account', (side, role) => {
    const onCreateAccountRequest = jest.fn();
    renderSections({ expansionPosition: side, onCreateAccountRequest });

    act(() => {
      fireEvent.press(screen.getByTestId('header-create-account-button'));
    });
    expect(onCreateAccountRequest).toHaveBeenCalledWith(role, { suggestedName: '' });
  });

  it('keeps the selected pill filled while the folder is closing', () => {
    const view = renderSections({ sourceAccount: mockAccounts[0] });

    expect(screen.getByTestId('account-picker-option-acc-cash')).toHaveProp('accessibilityState', {
      selected: true,
    });

    rerenderSections(view, { expansionPosition: null, sourceAccount: mockAccounts[0] });

    expect(
      screen.getByTestId('account-picker-option-acc-cash', { includeHiddenElements: true }),
    ).toHaveProp('accessibilityState', {
      selected: true,
    });
  });

  it('can lazily mount an embedded dropdown with row-specific test IDs', () => {
    const groupAccounts = jest.spyOn(accountCategory, 'getAccountSections');
    const view = renderSections({
      expansionPosition: null,
      sourceLabel: 'Money from',
      destLabel: 'Money to',
      lazyDropdown: true,
      testIDPrefix: 'bulk-route-row-1',
    });

    expect(screen.getByTestId('bulk-route-row-1-source-node')).toBeTruthy();
    expect(screen.queryByTestId('bulk-route-row-1-source-dropdown')).toBeNull();
    expect(groupAccounts).not.toHaveBeenCalled();

    rerenderSections(view, {
      expansionPosition: 'left',
      sourceLabel: 'Money from',
      destLabel: 'Money to',
      lazyDropdown: true,
      testIDPrefix: 'bulk-route-row-1',
    });

    expect(screen.getByTestId('bulk-route-row-1-source-dropdown')).toBeTruthy();
    expect(groupAccounts).toHaveBeenCalled();
  });

  it('hides compact node labels in collapsed and expanded states', () => {
    const view = renderSections({
      expansionPosition: null,
      sourceLabel: 'Send from',
      sourceAccount: mockAccounts[0],
      destLabel: 'Deposit into',
      destAccount: mockAccounts[1],
      displayMode: 'compact',
      lazyDropdown: true,
    });

    expect(
      within(screen.getByTestId('journal-route-source-node')).queryByText('Send from'),
    ).toBeNull();
    expect(
      within(screen.getByTestId('journal-route-destination-node')).queryByText('Deposit into'),
    ).toBeNull();

    rerenderSections(view, {
      expansionPosition: 'left',
      sourceLabel: 'Send from',
      sourceAccount: mockAccounts[0],
      destLabel: 'Deposit into',
      destAccount: mockAccounts[1],
      displayMode: 'compact',
      lazyDropdown: true,
    });

    expect(
      within(screen.getByTestId('journal-route-source-node')).queryByText('Send from'),
    ).toBeNull();
    expect(
      within(screen.getByTestId('journal-route-destination-node')).queryByText('Deposit into'),
    ).toBeNull();
    expect(screen.getByText('SEND FROM')).toBeTruthy();
  });

  it('uses the transfer flow arrow as the swap action', () => {
    const onSwapAccounts = jest.fn();
    const view = renderSections({
      expansionPosition: null,
      sourceLabel: 'Send from',
      destLabel: 'Deposit into',
      type: 'transfer',
      onSwapAccounts,
      displayMode: 'compact',
      lazyDropdown: true,
    });

    expect(screen.getByTestId('route-flow-arrow')).toBeTruthy();
    fireEvent.press(screen.getByTestId('route-flow-arrow'));
    expect(onSwapAccounts).toHaveBeenCalledTimes(1);

    rerenderSections(view, {
      expansionPosition: null,
      sourceLabel: 'Paid with',
      destLabel: 'Spend on',
      type: 'expense',
      displayMode: 'compact',
      lazyDropdown: true,
    });

    expect(screen.getByTestId('route-flow-arrow')).toBeTruthy();
    expect(screen.queryByTestId('route-swap-accounts-button')).toBeNull();
  });
});
