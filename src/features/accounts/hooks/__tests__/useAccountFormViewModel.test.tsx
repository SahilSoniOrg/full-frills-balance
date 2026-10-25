import './useAccountFormViewModel.test.setup';
import { AppearancePickerModal } from '@/src/components/overlays/AppearancePickerModal';
import { AccountFormView } from '@/src/features/accounts/components/AccountFormView';
import { AccountTypeSheet } from '@/src/features/accounts/components/AccountTypeSheet';
import { AccountSubtypeSheet } from '@/src/features/accounts/components/AccountSubtypeSheet';
import { fireEvent, render } from '@/src/utils/test-utils';
import { act, renderHook } from '@testing-library/react-native';
import { AccountSubtype, AccountType } from '@/src/types/enums';
import { Icon } from '@/src/types/domainIcons';
import { AppConfig } from '@/src/constants/app-config';
import { asAccountId } from '@/src/types/ids';
import { useAccountFormViewModel } from '../useAccountFormViewModel';
import {
  mockAccountFormVmState,
  mockOnSave,
  resetAccountFormViewModelTestState,
} from './useAccountFormViewModel.test.state';

beforeEach(() => resetAccountFormViewModelTestState());
afterEach(() => jest.restoreAllMocks());

describe('account kind view model with the real draft reducer', () => {
  it('suggests without switching, then accepts atomically and retains the draft', () => {
    const { result } = renderHook(useAccountFormViewModel);
    act(() => {
      result.current.setAccountName('HDFC card');
      result.current.onInitialBalanceChange('100');
      result.current.metadata.setNotes('Keep this note');
    });
    expect(result.current.accountSubtype).toBe(AccountSubtype.BANK_CHECKING);
    expect(result.current.kindSuggestionMessage).toBe('Looks like a credit card.');
    act(() => result.current.acceptKindSuggestion());
    expect(result.current.kindSuggestionMessage).toBeNull();
    expect(result.current.accountType).toBe(AccountType.LIABILITY);
    expect(result.current.accountSubtype).toBe(AccountSubtype.CREDIT_CARD);
    expect(result.current.selectedKindKey).toBe('credit_card');
    expect(result.current.selectedIcon).toBe(Icon.CreditCard);
    expect(result.current.balanceLabel).toBe('Amount owed today');
    expect(result.current.submitLabel).toBe('Add credit card');
    expect(result.current.initialBalance).toBe('100');
    expect(result.current.metadata.notes).toBe('Keep this note');
  });

  it('keeps dismissal for the same kind and resets it after a different suggestion', () => {
    const { result } = renderHook(useAccountFormViewModel);
    act(() => result.current.setAccountName('HDFC card'));
    act(() => result.current.dismissKindSuggestion());
    act(() => result.current.setAccountName('Another credit card'));
    expect(result.current.kindSuggestionMessage).toBeNull();
    act(() => result.current.setAccountName('Nothing matches'));
    act(() => result.current.setAccountName('Card'));
    expect(result.current.kindSuggestionMessage).toBeNull();
    act(() => result.current.setAccountName('Savings'));
    expect(result.current.kindSuggestionMessage).toBe('Looks like a savings.');
    act(() => result.current.setAccountName('Card'));
    expect(result.current.kindSuggestionMessage).toBe('Looks like a credit card.');
  });

  it('never suggests after manual kind selection, including choosing the current kind', () => {
    const { result } = renderHook(useAccountFormViewModel);
    act(() =>
      result.current.setAccountKind({
        type: AccountType.ASSET,
        subtype: AccountSubtype.BANK_CHECKING,
      }),
    );
    act(() => result.current.setAccountName('Credit card'));
    expect(result.current.kindSuggestionMessage).toBeNull();
    act(() => result.current.acceptKindSuggestion());
    expect(result.current.accountSubtype).toBe(AccountSubtype.BANK_CHECKING);
  });

  it('marks All kinds and legacy subtype choices as touched and exposes the extra item', () => {
    const { result } = renderHook(useAccountFormViewModel);
    act(() =>
      result.current.setAccountKind({
        type: AccountType.ASSET,
        subtype: AccountSubtype.FIXED_DEPOSIT,
      }),
    );
    expect(result.current.carouselKinds[4].subtype).toBe(AccountSubtype.FIXED_DEPOSIT);
    act(() => result.current.setAccountName('Card'));
    expect(result.current.kindSuggestionMessage).toBeNull();
  });

  it('updates loan presentation and then asset presentation on manual selection', () => {
    const { result } = renderHook(useAccountFormViewModel);
    act(() =>
      result.current.setAccountKind({ type: AccountType.LIABILITY, subtype: AccountSubtype.LOAN }),
    );
    expect(result.current.submitLabel).toBe('Add loan');
    act(() =>
      result.current.setAccountKind({ type: AccountType.ASSET, subtype: AccountSubtype.WALLET }),
    );
    expect(result.current.balanceLabel).toBe('Balance right now');
    expect(result.current.selectedIcon).toBe(Icon.Wallet);
  });

  it('preserves an explicitly selected icon even when it equals the old default', () => {
    const { result } = renderHook(useAccountFormViewModel);
    act(() => result.current.setSelectedIcon(Icon.Bank));
    act(() => result.current.setAccountName('Card'));
    act(() => result.current.acceptKindSuggestion());
    expect(result.current.selectedIcon).toBe(Icon.Bank);
    expect(
      result.current.carouselKinds.find(kind => kind.key === result.current.selectedKindKey)?.icon,
    ).toBe(Icon.Bank);
  });

  it('preserves custom preview icons across kind changes', () => {
    mockAccountFormVmState.mockParams = { pIcon: Icon.Bank };
    const { result } = renderHook(useAccountFormViewModel);
    act(() =>
      result.current.setAccountKind({
        type: AccountType.LIABILITY,
        subtype: AccountSubtype.CREDIT_CARD,
      }),
    );
    expect(result.current.selectedIcon).toBe(Icon.Bank);
    expect(
      result.current.carouselKinds.find(kind => kind.key === result.current.selectedKindKey)?.icon,
    ).toBe(Icon.Bank);
  });

  it('gates a valid subtype param and counts it as touched', () => {
    mockAccountFormVmState.mockParams = { type: 'liability', subtype: 'LOAN' };
    const { result } = renderHook(useAccountFormViewModel);
    act(() => result.current.setAccountName('Card'));
    expect(result.current.accountSubtype).toBe(AccountSubtype.LOAN);
    expect(result.current.kindSuggestionMessage).toBeNull();
  });

  it('uses the default and leaves touched false for an invalid pair', () => {
    mockAccountFormVmState.mockParams = { type: 'asset', subtype: 'LOAN' };
    const { result } = renderHook(useAccountFormViewModel);
    expect(result.current.accountSubtype).toBe(AccountSubtype.BANK_CHECKING);
    act(() => result.current.setAccountName('Card'));
    expect(result.current.kindSuggestionMessage).toBeNull();
  });

  it('shows the current kind with no suggestion in edit mode and resets on returning to create', () => {
    mockAccountFormVmState.mockParams = { accountId: 'existing' };
    mockAccountFormVmState.mockExistingAccount = {
      id: asAccountId('existing'),
      name: 'Savings card',
      accountType: AccountType.ASSET,
      accountSubtype: AccountSubtype.BANK_SAVINGS,
      currencyCode: 'USD',
      icon: Icon.Safe,
      orderNum: 0,
    };
    const { result, rerender } = renderHook(useAccountFormViewModel);
    expect(result.current.selectedKindKey).toBe('savings');
    expect(result.current.kindSuggestionMessage).toBeNull();
    expect(result.current.balanceLabel).toBe('Current balance');
    expect(result.current.submitLabel).toBe('Save Changes');
    mockAccountFormVmState.mockParams = {};
    mockAccountFormVmState.mockExistingAccount = null;
    rerender({});
    expect(result.current.accountSubtype).toBe(AccountSubtype.BANK_CHECKING);
    act(() => result.current.setAccountName('Card'));
    expect(result.current.kindSuggestionMessage).toBe('Looks like a credit card.');
  });

  it('allows edit conversions across account/category types while preserving appearance and notes', () => {
    mockAccountFormVmState.mockParams = { accountId: 'existing' };
    mockAccountFormVmState.mockExistingAccount = {
      id: asAccountId('existing'),
      name: 'Savings',
      accountType: AccountType.ASSET,
      accountSubtype: AccountSubtype.BANK_SAVINGS,
      currencyCode: 'USD',
      icon: Icon.Safe,
      color: '#7DD3A8',
      parentAccountId: asAccountId('parent'),
      orderNum: 0,
    };
    const { result } = renderHook(useAccountFormViewModel);
    act(() => {
      result.current.onInitialBalanceChange('100');
      result.current.metadata.setNotes('Keep this note');
    });
    act(() =>
      result.current.setAccountKind({ type: AccountType.INCOME, subtype: AccountSubtype.SALARY }),
    );
    expect(result.current.isCategory).toBe(true);
    expect(result.current.parentAccountId).toBe('');
    expect(result.current.initialBalance).toBe('');
    expect(result.current.selectedIcon).toBe(Icon.Safe);
    expect(result.current.selectedColor).toBe('#7DD3A8');
    expect(result.current.metadata.notes).toBe('Keep this note');
    act(() =>
      result.current.setAccountKind({ type: AccountType.EQUITY, subtype: AccountSubtype.OTHER }),
    );
    expect(result.current.accountType).toBe(AccountType.EQUITY);
    expect(result.current.isCategory).toBe(false);
    expect(result.current.showInitialBalance).toBe(true);
  });

  it.each([AccountType.INCOME, AccountType.EXPENSE])('keeps category behavior for %s', type => {
    mockAccountFormVmState.mockPathname = '/category-creation';
    mockAccountFormVmState.mockParams = { type };
    const { result } = renderHook(useAccountFormViewModel);
    act(() => result.current.setAccountName('Credit card'));
    expect(result.current.isCategory).toBe(true);
    expect(result.current.selectedIcon).toBe(
      type === AccountType.INCOME ? Icon.TrendingUp : Icon.Tag,
    );
    expect(result.current.kindSuggestionMessage).toBeNull();
    expect(result.current.carouselKinds.length).toBeGreaterThan(0);
    expect(
      result.current.carouselKinds.every(
        kind => kind.type === AccountType.INCOME || kind.type === AccountType.EXPENSE,
      ),
    ).toBe(true);
    expect(result.current.submitLabel).toBe(AppConfig.strings.accounts.categoryForm.createCategory);
    act(() =>
      result.current.setAccountKind({
        type: AccountType.LIABILITY,
        subtype: AccountSubtype.CREDIT_CARD,
      }),
    );
    expect(result.current.accountType).toBe(type);
  });
});

function AccountFormHarness() {
  const vm = useAccountFormViewModel();
  return (
    <AccountFormView
      {...vm}
      chrome={{ kind: 'nav', screenTitle: vm.heroTitle, backIcon: Icon.Back, onBack: jest.fn() }}
    />
  );
}

describe('account form UI over its view model', () => {
  it('switches a name suggestion into card rows, glyph and amount label', () => {
    const screen = render(<AccountFormHarness />);
    fireEvent.changeText(screen.getByTestId('hero-name-input'), 'HDFC card');
    expect(screen.getByText('Looks like a credit card.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('account-kind-suggestion-action'));
    expect(screen.queryByTestId('account-kind-suggestion')).toBeNull();
    expect(screen.getByText('Amount owed today')).toBeTruthy();
    expect(screen.getByText('Add credit card')).toBeTruthy();
    expect(screen.getByTestId('account-statement-day')).toBeTruthy();
    expect(screen.getByTestId('account-subtype')).toHaveProp(
      'accessibilityLabel',
      'Subtype: Credit card',
    );
  });

  it('preserves the subtype and suppresses suggestions after reselecting the current type', () => {
    const screen = render(<AccountFormHarness />);
    fireEvent.press(screen.getByTestId('account-type'));
    fireEvent.press(screen.getByTestId('account-type-asset'));
    fireEvent.changeText(screen.getByTestId('hero-name-input'), 'HDFC card');
    expect(screen.queryByTestId('account-kind-suggestion')).toBeNull();
    expect(screen.getByTestId('account-subtype')).toHaveProp(
      'accessibilityLabel',
      'Subtype: Bank account',
    );
  });

  it('edits card metadata through day and finance sheets without losing the draft', () => {
    mockAccountFormVmState.mockParams = { type: 'liability', subtype: 'CREDIT_CARD' };
    const screen = render(<AccountFormHarness />);
    fireEvent.press(screen.getByTestId('account-statement-day'));
    fireEvent.press(screen.getByTestId('account-statement-day-grid-15'));
    expect(screen.getByText('15th')).toBeTruthy();
    fireEvent.press(screen.getByTestId('account-due-day'));
    fireEvent.press(screen.getByTestId('account-due-day-grid-5'));
    expect(screen.getByText('5th')).toBeTruthy();
    fireEvent.press(screen.getByTestId('account-limit-interest'));
    fireEvent.changeText(screen.getByTestId('account-credit-limit-input'), '10000');
    fireEvent.changeText(screen.getByTestId('account-apr-input'), '12');
    fireEvent.press(screen.getByTestId('account-repayment-tabs-item-MIN'));
    fireEvent.changeText(screen.getByTestId('account-minimum-percent-input'), '5');
    fireEvent.press(screen.getByTestId('account-finance-sheet-done'));
    fireEvent.press(screen.getByTestId('account-limit-interest'));
    expect(screen.getByTestId('account-credit-limit-input').props.value).toBe('10000');
    expect(screen.getByTestId('account-apr-input').props.value).toBe('12');
    expect(screen.getByTestId('account-minimum-percent-input').props.value).toBe('5');
    expect(
      screen.getByTestId('account-repayment-tabs-item-MIN').props.accessibilityState.selected,
    ).toBe(true);
  });

  it('selects a nonstandard kind and retains loan and note values across sheets', () => {
    const screen = render(<AccountFormHarness />);
    fireEvent.press(screen.getByTestId('account-type'));
    fireEvent.press(screen.getByTestId('account-type-liability'));
    fireEvent.press(screen.getByTestId('account-subtype'));
    fireEvent.press(screen.getByTestId('account-subtype-liability-mortgage'));
    expect(screen.getByTestId('account-subtype')).toHaveProp(
      'accessibilityLabel',
      'Subtype: Mortgage',
    );
    fireEvent.press(screen.getByTestId('account-emi-day'));
    fireEvent.press(screen.getByTestId('account-emi-day-grid-1'));
    expect(screen.getByText('1st')).toBeTruthy();
    fireEvent.press(screen.getByTestId('account-rate-term'));
    fireEvent.changeText(screen.getByTestId('account-apr-input'), '9.5');
    fireEvent.changeText(screen.getByTestId('account-tenure-input'), '36');
    fireEvent.changeText(screen.getByTestId('account-emi-amount-input'), '500');
    fireEvent.press(screen.getByTestId('account-finance-sheet-done'));
    fireEvent.press(screen.getByTestId('account-rate-term'));
    expect(screen.getByTestId('account-tenure-input').props.value).toBe('36');
    expect(screen.getByTestId('account-emi-amount-input').props.value).toBe('500');
    fireEvent.press(screen.getByTestId('account-finance-sheet-done'));
    fireEvent.press(screen.getByTestId('account-note'));
    fireEvent.changeText(screen.getByTestId('account-note-input'), 'Shared draft note');
    fireEvent.press(screen.getByTestId('account-note-done'));
    expect(screen.getByText('Shared draft note')).toBeTruthy();
  });

  it('renders categories through separate type and subtype controls', () => {
    mockAccountFormVmState.mockPathname = '/category-creation';
    const screen = render(<AccountFormHarness />);
    expect(screen.queryByTestId('account-type')).toBeNull();
    expect(screen.getByTestId('category-type')).toBeTruthy();
    expect(screen.getByTestId('category-subtype')).toBeTruthy();
    expect(screen.getByTestId('category-note')).toBeTruthy();
    expect(screen.queryByTestId('hero-amount-input')).toBeNull();
  });
});

describe('category create/edit regressions', () => {
  it.each([AccountType.INCOME, AccountType.EXPENSE])('retains creation controls for %s', type => {
    mockAccountFormVmState.mockPathname = '/category-creation';
    mockAccountFormVmState.mockParams = { type };
    const screen = render(<AccountFormHarness />);
    expect(screen.queryByTestId('hero-amount-input')).toBeNull();
    expect(screen.queryByTestId('account-type')).toBeNull();
    expect(screen.getByTestId('category-type')).toBeTruthy();
    expect(screen.getByTestId('category-subtype')).toBeTruthy();
    fireEvent.press(screen.getByTestId('category-type'));
    expect(screen.queryByTestId('account-type-asset')).toBeNull();
    expect(screen.queryByTestId('account-type-liability')).toBeNull();
    fireEvent.press(screen.getByTestId('account-type-close'));
    fireEvent.changeText(screen.getByTestId('hero-name-input'), 'My category');
    fireEvent.press(screen.getByTestId('category-note'));
    fireEvent.changeText(
      screen.getByPlaceholderText('Add any additional notes...'),
      'Category note',
    );
    fireEvent.press(screen.getByTestId('account-note-done'));
    fireEvent.press(screen.getByTestId('category-currency'));
    fireEvent.press(screen.getByText('Euro'));
    expect(screen.getByText('EUR')).toBeTruthy();
    fireEvent.press(screen.getByTestId('category-type'));
    fireEvent.press(
      screen.getByTestId(
        type === AccountType.INCOME ? 'account-type-expense' : 'account-type-income',
      ),
    );
    fireEvent.press(screen.getByTestId('category-subtype'));
    fireEvent.press(
      screen.getByTestId(
        type === AccountType.INCOME
          ? 'account-subtype-expense-housing'
          : 'account-subtype-income-salary',
      ),
    );
    expect(screen.getByTestId('hero-name-input').props.value).toBe('My category');
    expect(screen.getByText('Category note')).toBeTruthy();
    fireEvent.press(screen.getByTestId('category-appearance'));
    fireEvent.press(screen.getByLabelText(`Select icon ${Icon.Bank}`));
    fireEvent.press(screen.getByText('Done'));
    expect(screen.UNSAFE_getByType(AppearancePickerModal).props.selectedIcon).toBe(Icon.Bank);
    fireEvent.press(screen.getByTestId('category-type'));
    fireEvent.press(screen.getByTestId('account-type-expense'));
    fireEvent.press(screen.getByTestId('category-subtype'));
    fireEvent.press(screen.getByTestId('account-subtype-expense-food'));
    expect(screen.UNSAFE_getByType(AppearancePickerModal).props.selectedIcon).toBe(Icon.Bank);
    fireEvent.press(screen.getByTestId('submit-footer-button'));
    expect(mockOnSave).toHaveBeenCalledTimes(1);
  });

  it('keeps edit currency locked, category hierarchy, appearance and edit submission', () => {
    mockAccountFormVmState.mockHistoricalTransactionCount = 1;
    mockAccountFormVmState.mockPathname = '/category-creation';
    mockAccountFormVmState.mockParams = { accountId: 'category' };
    mockAccountFormVmState.mockExistingAccount = {
      id: asAccountId('category'),
      name: 'Salary',
      accountType: AccountType.INCOME,
      accountSubtype: AccountSubtype.SALARY,
      currencyCode: 'EUR',
      icon: Icon.Briefcase,
      orderNum: 0,
    };
    mockAccountFormVmState.mockAccounts = [
      {
        id: asAccountId('parent'),
        name: 'Parent income',
        accountType: AccountType.INCOME,
        accountSubtype: AccountSubtype.OTHER,
        currencyCode: 'EUR',
        orderNum: 0,
      },
    ];
    const screen = render(<AccountFormHarness />);
    expect(screen.getByTestId('hero-name-input').props.value).toBe('Salary');
    expect(screen.getByText('EUR')).toBeTruthy();
    expect(screen.getByTestId('category-currency')).not.toBeDisabled();
    fireEvent.press(screen.getByTestId('category-currency'));
    expect(screen.getByText(AppConfig.strings.accounts.form.currencyLockedTooltip)).toBeTruthy();
    fireEvent.press(screen.getByText('Done'));
    expect(screen.UNSAFE_getByType(AppearancePickerModal).props.selectedIcon).toBe(Icon.Briefcase);
    fireEvent.press(screen.getByTestId('category-parent'));
    fireEvent.press(screen.getByText('Parent income'));
    expect(screen.getByTestId('category-parent')).toHaveProp(
      'accessibilityLabel',
      expect.stringContaining('Parent income'),
    );
    fireEvent.changeText(screen.getByTestId('hero-name-input'), 'Updated salary');
    expect(screen.getByText(AppConfig.strings.accounts.categoryForm.saveChanges)).toBeTruthy();
    fireEvent.press(screen.getByTestId('submit-footer-button'));
    expect(mockOnSave).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('account-statement-day')).toBeNull();
    expect(screen.queryByTestId('hero-amount-input')).toBeNull();
  });

  it('lets an existing account with no transaction history choose a different currency', () => {
    mockAccountFormVmState.mockParams = { accountId: 'empty-account' };
    mockAccountFormVmState.mockExistingAccount = {
      id: asAccountId('empty-account'),
      name: 'New account',
      accountType: AccountType.ASSET,
      accountSubtype: AccountSubtype.CASH,
      currencyCode: 'USD',
      orderNum: 0,
    };
    const screen = render(<AccountFormHarness />);
    fireEvent.press(screen.getByTestId('account-currency'));
    fireEvent.press(screen.getByText('Euro'));
    expect(screen.getByText('EUR')).toBeTruthy();
  });

  it.each([null, 0, 1])('only unlocks edit currency after history resolves to zero (%s)', count => {
    mockAccountFormVmState.mockParams = { accountId: 'account' };
    mockAccountFormVmState.mockExistingAccount = {
      id: asAccountId('account'),
      name: 'Account',
      accountType: AccountType.ASSET,
      accountSubtype: AccountSubtype.CASH,
      currencyCode: 'USD',
      orderNum: 0,
    };
    mockAccountFormVmState.mockHistoricalTransactionCount = count;
    const { result } = renderHook(useAccountFormViewModel);
    expect(result.current.canEditCurrency).toBe(count === 0);
  });
});

it('keeps category type/subtype locked when editing a parent category', () => {
  mockAccountFormVmState.mockPathname = '/category-creation';
  mockAccountFormVmState.mockParams = { accountId: 'parent-category' };
  mockAccountFormVmState.mockIsParent = true;
  mockAccountFormVmState.mockExistingAccount = {
    id: asAccountId('parent-category'),
    name: 'Food parent',
    accountType: AccountType.EXPENSE,
    accountSubtype: AccountSubtype.FOOD,
    currencyCode: 'USD',
    icon: Icon.Tag,
    orderNum: 0,
  };
  const screen = render(<AccountFormHarness />);
  expect(screen.getByTestId('category-type')).toBeDisabled();
  expect(screen.getByTestId('category-subtype')).toBeDisabled();
  act(() => screen.UNSAFE_getByType(AccountTypeSheet).props.onSelect(AccountType.INCOME));
  act(() => screen.UNSAFE_getByType(AccountSubtypeSheet).props.onSelect(AccountSubtype.HOUSING));
  expect(screen.getByTestId('category-type')).toHaveProp(
    'accessibilityLabel',
    'Type: Expense category',
  );
  expect(screen.getByTestId('category-subtype')).toHaveProp('accessibilityLabel', 'Subtype: Food');
});

it('keeps a parent account kind locked while retaining appearance customization', () => {
  mockAccountFormVmState.mockParams = { accountId: 'parent-account' };
  mockAccountFormVmState.mockIsParent = true;
  mockAccountFormVmState.mockExistingAccount = {
    id: asAccountId('parent-account'),
    name: 'Bank parent',
    accountType: AccountType.ASSET,
    accountSubtype: AccountSubtype.BANK_CHECKING,
    currencyCode: 'USD',
    icon: Icon.Bank,
    orderNum: 0,
  };
  const screen = render(<AccountFormHarness />);
  expect(screen.getByTestId('account-type')).toBeDisabled();
  expect(screen.getByTestId('account-subtype')).toBeDisabled();
  expect(screen.getByTestId('account-appearance')).toBeTruthy();
});
