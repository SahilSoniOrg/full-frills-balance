import { SimpleFormAccountSections } from '../components/SimpleFormAccountSections';
import { AccountPickerNode } from '../components/AccountPickerPanel.parts';
import { ArchiveVisibilityScopeProvider } from '@/src/contexts/ArchiveVisibilityScope';
import { AppConfig } from '@/src/constants';
import { AccountType } from '@/src/types/enums';
import { asAccountId, EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';
import * as accountCategory from '@/src/utils/accountCategory';
import { act, fireEvent, render, screen, within } from '@/src/utils/test-utils';
import React from 'react';
import { StyleSheet } from 'react-native';
import type { AccountPickerListItem } from '../components/accountPickerRows';

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

function renderWithScope(ui: React.ReactElement) {
  return render(<ArchiveVisibilityScopeProvider>{ui}</ArchiveVisibilityScopeProvider>);
}

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

function pillHasWrappingAncestor(accountId: string): boolean {
  const pill = screen.getByTestId(`account-picker-option-${accountId}`);
  let ancestor: typeof pill | null = pill.parent;
  while (ancestor) {
    if (StyleSheet.flatten(ancestor.props.style)?.flexWrap === 'wrap') return true;
    ancestor = ancestor.parent;
  }
  return false;
}

describe('SimpleFormAccountSections unselection and clear', () => {
  afterEach(() => jest.restoreAllMocks());

  it('keeps the original flowing pills for a typical account list', () => {
    renderWithScope(
      <SimpleFormAccountSections
        expansionPosition="left"
        onToggleExpansion={jest.fn()}
        sourceLabel="Paid with"
        sourceAccounts={mockAccounts}
        onSelectSource={jest.fn()}
        destLabel="Spend on"
        destAccounts={mockAccounts}
        onSelectDestination={jest.fn()}
      />,
    );

    expect(screen.queryByTestId('journal-account-folder-list')).toBeNull();
    expect(pillHasWrappingAncestor('acc-cash')).toBe(true);
    expect(screen.queryByTestId('show-archived-button')).toBeNull();
  });

  it('keeps flowing pills when a large account list is recycled', () => {
    const manyAccounts = Array.from({ length: 40 }, (_, index) => ({
      ...mockAccounts[0],
      id: asAccountId(`large-${index}`),
      name: `Account ${index}`,
    }));
    renderWithScope(
      <SimpleFormAccountSections
        expansionPosition="left"
        onToggleExpansion={jest.fn()}
        sourceLabel="Paid with"
        sourceAccounts={manyAccounts}
        onSelectSource={jest.fn()}
        destLabel="Spend on"
        destAccounts={manyAccounts}
        onSelectDestination={jest.fn()}
      />,
    );

    expect(screen.getByTestId('journal-account-folder-list')).toBeTruthy();
    expect(pillHasWrappingAncestor('large-0')).toBe(true);
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

  it('toggles selection to EMPTY_ACCOUNT_ID when tapping the already-selected pill', () => {
    const onSelectSource = jest.fn();
    const onSelectDestination = jest.fn();
    const onToggleExpansion = jest.fn();

    renderWithScope(
      <SimpleFormAccountSections
        expansionPosition="left"
        onToggleExpansion={onToggleExpansion}
        sourceLabel="Paid with"
        sourceAccount={mockAccounts[0]}
        sourceAccounts={mockAccounts}
        onSelectSource={onSelectSource}
        destLabel="Spend on"
        destAccount={undefined}
        destAccounts={mockAccounts}
        onSelectDestination={onSelectDestination}
      />,
    );

    // Tapping the selected pill ('Cash Wallet') toggles it off
    const selectedPill = screen.getByTestId('account-picker-option-acc-cash');
    act(() => {
      fireEvent.press(selectedPill);
    });

    expect(onSelectSource).toHaveBeenCalledWith(EMPTY_ACCOUNT_ID);
  });

  it('renders Clear button when an account is selected and clears to EMPTY_ACCOUNT_ID on press', () => {
    const onSelectSource = jest.fn();
    const onSelectDestination = jest.fn();
    const onToggleExpansion = jest.fn();

    renderWithScope(
      <SimpleFormAccountSections
        expansionPosition="left"
        onToggleExpansion={onToggleExpansion}
        sourceLabel="Paid with"
        sourceAccount={mockAccounts[0]}
        sourceAccounts={mockAccounts}
        onSelectSource={onSelectSource}
        destLabel="Spend on"
        destAccount={undefined}
        destAccounts={mockAccounts}
        onSelectDestination={onSelectDestination}
      />,
    );

    const clearButton = screen.getByTestId('clear-selected-account-button');
    expect(clearButton).toBeTruthy();

    act(() => {
      fireEvent.press(clearButton);
    });
    expect(onSelectSource).toHaveBeenCalledWith(EMPTY_ACCOUNT_ID);
  });

  it('does not render Clear button when no account is selected', () => {
    const onSelectSource = jest.fn();
    const onSelectDestination = jest.fn();
    const onToggleExpansion = jest.fn();

    renderWithScope(
      <SimpleFormAccountSections
        expansionPosition="left"
        onToggleExpansion={onToggleExpansion}
        sourceLabel="Paid with"
        sourceAccount={undefined}
        sourceAccounts={mockAccounts}
        onSelectSource={onSelectSource}
        destLabel="Spend on"
        destAccount={undefined}
        destAccounts={mockAccounts}
        onSelectDestination={onSelectDestination}
      />,
    );

    expect(screen.queryByTestId('clear-selected-account-button')).toBeNull();
  });

  it('keeps the selected archived account visible while archived accounts are hidden', () => {
    const archivedAccount = {
      ...mockAccounts[0],
      id: asAccountId('acc-archived'),
      archivedAt: new Date(),
    } as AccountFields;

    renderWithScope(
      <SimpleFormAccountSections
        expansionPosition="left"
        onToggleExpansion={jest.fn()}
        sourceLabel="Paid with"
        sourceAccount={archivedAccount}
        sourceAccounts={[archivedAccount]}
        onSelectSource={jest.fn()}
        destLabel="Spend on"
        destAccounts={mockAccounts}
        onSelectDestination={jest.fn()}
      />,
    );

    expect(screen.getByTestId('account-picker-option-acc-archived')).toBeTruthy();
  });

  it('supports unselecting destination account as well', () => {
    const onSelectSource = jest.fn();
    const onSelectDestination = jest.fn();
    const onToggleExpansion = jest.fn();

    renderWithScope(
      <SimpleFormAccountSections
        expansionPosition="right"
        onToggleExpansion={onToggleExpansion}
        sourceLabel="Paid with"
        sourceAccount={undefined}
        sourceAccounts={mockAccounts}
        onSelectSource={onSelectSource}
        destLabel="Spend on"
        destAccount={mockAccounts[1]}
        destAccounts={mockAccounts}
        onSelectDestination={onSelectDestination}
      />,
    );

    // Tapping clear button on destination side
    const clearButton = screen.getByTestId('clear-selected-account-button');
    act(() => {
      fireEvent.press(clearButton);
    });
    expect(onSelectDestination).toHaveBeenCalledWith(EMPTY_ACCOUNT_ID);

    // Tapping already-selected pill on destination side toggles off
    const bankPill = screen.getByTestId('account-picker-option-acc-bank');
    act(() => {
      fireEvent.press(bankPill);
    });
    expect(onSelectDestination).toHaveBeenCalledWith(EMPTY_ACCOUNT_ID);
  });

  it.each([
    ['expense', AppConfig.strings.transactionFlow.simpleEntry.chooseCategory],
    ['income', AppConfig.strings.transactionFlow.simpleEntry.chooseAccount],
    ['transfer', AppConfig.strings.transactionFlow.simpleEntry.chooseAccount],
  ] as const)('uses the configured destination prompt for %s entries', (type, prompt) => {
    renderWithScope(
      <SimpleFormAccountSections
        expansionPosition="right"
        onToggleExpansion={jest.fn()}
        sourceLabel="Paid with"
        sourceAccounts={mockAccounts}
        onSelectSource={jest.fn()}
        destLabel="Spend on"
        destAccounts={mockAccounts}
        onSelectDestination={jest.fn()}
        type={type}
      />,
    );

    expect(
      within(screen.getByTestId('journal-route-destination-node')).getByText(prompt),
    ).toBeTruthy();
  });

  it.each([
    ['left', 'source'],
    ['right', 'destination'],
  ] as const)('preserves the active %s role when creating an account', (side, role) => {
    const onCreateAccountRequest = jest.fn();

    renderWithScope(
      <SimpleFormAccountSections
        expansionPosition={side}
        onToggleExpansion={jest.fn()}
        sourceLabel="Paid with"
        sourceAccounts={mockAccounts}
        onSelectSource={jest.fn()}
        destLabel="Spend on"
        destAccounts={mockAccounts}
        onSelectDestination={jest.fn()}
        onCreateAccountRequest={onCreateAccountRequest}
      />,
    );

    act(() => {
      fireEvent.press(screen.getByTestId('header-create-account-button'));
    });
    expect(onCreateAccountRequest).toHaveBeenCalledWith(role, { suggestedName: '' });
  });

  it('keeps the selected pill filled while the folder is closing', () => {
    const view = renderWithScope(
      <SimpleFormAccountSections
        expansionPosition="left"
        onToggleExpansion={jest.fn()}
        sourceLabel="Paid with"
        sourceAccount={mockAccounts[0]}
        sourceAccounts={mockAccounts}
        onSelectSource={jest.fn()}
        destLabel="Spend on"
        destAccounts={mockAccounts}
        onSelectDestination={jest.fn()}
      />,
    );

    expect(screen.getByTestId('account-picker-option-acc-cash')).toHaveProp('accessibilityState', {
      selected: true,
    });

    view.rerender(
      <ArchiveVisibilityScopeProvider>
        <SimpleFormAccountSections
          expansionPosition={null}
          onToggleExpansion={jest.fn()}
          sourceLabel="Paid with"
          sourceAccount={mockAccounts[0]}
          sourceAccounts={mockAccounts}
          onSelectSource={jest.fn()}
          destLabel="Spend on"
          destAccounts={mockAccounts}
          onSelectDestination={jest.fn()}
        />
      </ArchiveVisibilityScopeProvider>,
    );

    expect(
      screen.getByTestId('account-picker-option-acc-cash', { includeHiddenElements: true }),
    ).toHaveProp('accessibilityState', {
      selected: true,
    });
  });

  it('can lazily mount an embedded dropdown with row-specific test IDs', () => {
    const groupAccounts = jest.spyOn(accountCategory, 'getAccountSections');
    const view = renderWithScope(
      <SimpleFormAccountSections
        expansionPosition={null}
        onToggleExpansion={jest.fn()}
        sourceLabel="Money from"
        sourceAccounts={mockAccounts}
        onSelectSource={jest.fn()}
        destLabel="Money to"
        destAccounts={mockAccounts}
        onSelectDestination={jest.fn()}
        lazyDropdown
        testIDPrefix="bulk-route-row-1"
      />,
    );

    expect(screen.getByTestId('bulk-route-row-1-source-node')).toBeTruthy();
    expect(screen.queryByTestId('bulk-route-row-1-source-dropdown')).toBeNull();
    expect(groupAccounts).not.toHaveBeenCalled();

    view.rerender(
      <ArchiveVisibilityScopeProvider>
        <SimpleFormAccountSections
          expansionPosition="left"
          onToggleExpansion={jest.fn()}
          sourceLabel="Money from"
          sourceAccounts={mockAccounts}
          onSelectSource={jest.fn()}
          destLabel="Money to"
          destAccounts={mockAccounts}
          onSelectDestination={jest.fn()}
          lazyDropdown
          testIDPrefix="bulk-route-row-1"
        />
      </ArchiveVisibilityScopeProvider>,
    );

    expect(screen.getByTestId('bulk-route-row-1-source-dropdown')).toBeTruthy();
    expect(groupAccounts).toHaveBeenCalled();
  });

  it('hides compact node labels in collapsed and expanded states', () => {
    const view = renderWithScope(
      <SimpleFormAccountSections
        expansionPosition={null}
        onToggleExpansion={jest.fn()}
        sourceLabel="Send from"
        sourceAccount={mockAccounts[0]}
        sourceAccounts={mockAccounts}
        onSelectSource={jest.fn()}
        destLabel="Deposit into"
        destAccount={mockAccounts[1]}
        destAccounts={mockAccounts}
        onSelectDestination={jest.fn()}
        displayMode="compact"
        lazyDropdown
      />,
    );

    expect(
      within(screen.getByTestId('journal-route-source-node')).queryByText('Send from'),
    ).toBeNull();
    expect(
      within(screen.getByTestId('journal-route-destination-node')).queryByText('Deposit into'),
    ).toBeNull();

    view.rerender(
      <ArchiveVisibilityScopeProvider>
        <SimpleFormAccountSections
          expansionPosition="left"
          onToggleExpansion={jest.fn()}
          sourceLabel="Send from"
          sourceAccount={mockAccounts[0]}
          sourceAccounts={mockAccounts}
          onSelectSource={jest.fn()}
          destLabel="Deposit into"
          destAccount={mockAccounts[1]}
          destAccounts={mockAccounts}
          onSelectDestination={jest.fn()}
          displayMode="compact"
          lazyDropdown
        />
      </ArchiveVisibilityScopeProvider>,
    );

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
    const view = renderWithScope(
      <SimpleFormAccountSections
        expansionPosition={null}
        onToggleExpansion={jest.fn()}
        sourceLabel="Send from"
        sourceAccounts={mockAccounts}
        onSelectSource={jest.fn()}
        destLabel="Deposit into"
        destAccounts={mockAccounts}
        onSelectDestination={jest.fn()}
        type="transfer"
        onSwapAccounts={onSwapAccounts}
        displayMode="compact"
        lazyDropdown
      />,
    );

    expect(screen.getByTestId('route-flow-arrow')).toBeTruthy();
    fireEvent.press(screen.getByTestId('route-flow-arrow'));
    expect(onSwapAccounts).toHaveBeenCalledTimes(1);

    view.rerender(
      <ArchiveVisibilityScopeProvider>
        <SimpleFormAccountSections
          expansionPosition={null}
          onToggleExpansion={jest.fn()}
          sourceLabel="Paid with"
          sourceAccounts={mockAccounts}
          onSelectSource={jest.fn()}
          destLabel="Spend on"
          destAccounts={mockAccounts}
          onSelectDestination={jest.fn()}
          type="expense"
          displayMode="compact"
          lazyDropdown
        />
      </ArchiveVisibilityScopeProvider>,
    );

    expect(screen.getByTestId('route-flow-arrow')).toBeTruthy();
    expect(screen.queryByTestId('route-swap-accounts-button')).toBeNull();
  });
});
