import { AccountSubtype, AccountType } from '@/src/types/enums';
import { asAccountId } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';
import { fireEvent, render, screen } from '@/src/utils/test-utils';
import { StyleSheet } from 'react-native';
import { AccountPickerModal, MultiAccountPickerModal } from '../AccountPickerModal';

jest.mock('@/src/hooks/useAccountDisplayPrefs', () => ({
  useAccountDisplayPrefs: () => ({ useCompactAccountPicker: true }),
}));

jest.mock('@/src/hooks/use-reduced-motion', () => ({
  useReducedMotion: () => true,
}));

const accounts: AccountFields[] = [
  {
    id: asAccountId('checking'),
    name: 'Checking',
    accountType: AccountType.ASSET,
    accountSubtype: AccountSubtype.BANK_CHECKING,
    currencyCode: 'USD',
  },
  {
    id: asAccountId('cash'),
    name: 'Cash',
    accountType: AccountType.ASSET,
    accountSubtype: AccountSubtype.CASH,
    currencyCode: 'USD',
  },
];

describe('account picker modal layout', () => {
  it('gives the multi-account list the sheet height and applies a selection', () => {
    const onSelect = jest.fn();
    render(
      <MultiAccountPickerModal
        visible
        title="Choose Accounts to Pay From"
        accounts={accounts}
        selectedIds={[]}
        onClose={jest.fn()}
        onSelect={onSelect}
      />,
    );

    // The list uses flex: 1. Its immediate modal container must own the remaining
    // sheet height; otherwise native layout collapses it behind the Apply footer.
    expect(
      StyleSheet.flatten(screen.getByTestId('account-picker-modal-content').props.style),
    ).toMatchObject({ flex: 1, minHeight: 0 });
    expect(screen.getByTestId('account-picker-search-input')).toBeTruthy();
    expect(screen.getByText('Cash')).toBeTruthy();
    fireEvent.press(screen.getByTestId('account-picker-option-checking'));
    fireEvent.press(screen.getByText('Apply Selection (1)'));
    expect(onSelect).toHaveBeenCalledWith([accounts[0].id]);
  });

  it('gives the single-account list the same height and selects an account', () => {
    const onSelect = jest.fn();
    render(
      <AccountPickerModal visible accounts={accounts} onClose={jest.fn()} onSelect={onSelect} />,
    );

    expect(
      StyleSheet.flatten(screen.getByTestId('account-picker-modal-content').props.style),
    ).toMatchObject({ flex: 1, minHeight: 0 });
    fireEvent.press(screen.getByTestId('account-picker-option-cash'));
    expect(onSelect).toHaveBeenCalledWith(accounts[1].id);
  });
});
