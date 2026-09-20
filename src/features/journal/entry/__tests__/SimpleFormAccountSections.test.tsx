import { SimpleFormAccountSections } from '../components/SimpleFormAccountSections';
import { ArchiveVisibilityScopeProvider } from '@/src/contexts/ArchiveVisibilityScope';
import { AccountType } from '@/src/types/enums';
import { asAccountId, EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';
import { act, fireEvent, render, screen } from '@/src/utils/test-utils';
import React from 'react';

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

describe('SimpleFormAccountSections unselection and clear', () => {
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
});
