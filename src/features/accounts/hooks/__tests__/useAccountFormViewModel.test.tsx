import { AppearancePickerModal } from '@/src/components/overlays/AppearancePickerModal';
import { Keyboard } from 'react-native';
import EventEmitter from 'react-native/Libraries/vendor/emitter/EventEmitter';
import { AccountFormView } from '@/src/features/accounts/components/AccountFormView';
import { GlyphCarousel } from '@/src/components/forms';
import { fireEvent, render } from '@/src/utils/test-utils';
import { act, renderHook } from '@testing-library/react-native';
import { AccountSubtype, AccountType } from '@/src/types/enums';
import { Icon } from '@/src/types/domainIcons';
import { AppConfig } from '@/src/constants/app-config';
import type { AccountFields } from '@/src/types/plainDtos';
import { asAccountId } from '@/src/types/ids';
import { useAccountFormViewModel } from '../useAccountFormViewModel';

let mockParams: { type?: string; subtype?: string; accountId?: string; pIcon?: string } = {};
let mockExistingAccount: AccountFields | null = null;
const mockOnSave = jest.fn();
let mockAccounts: AccountFields[] = [];
let mockIsParent = false;
let mockPathname = '/account-creation';

jest.mock('react-native/Libraries/Animated/NativeAnimatedModule', () => {
  const { NativeModules } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: {
      ...NativeModules.NativeAnimatedModule,
      connectAnimatedNodeToShadowNodeFamily: jest.fn(),
    },
  };
});

jest.mock('react-native/Libraries/Modal/Modal', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: ({ visible, children }: import('react-native').ModalProps) =>
      visible ? React.createElement(React.Fragment, null, children) : null,
  };
});

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  usePathname: () => mockPathname,
}));
jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: () => ({ workplaceId: 'workplace', defaultCurrencyCode: 'USD' }),
}));
jest.mock('@/src/hooks/useAccounts', () => ({
  useAccount: () => ({ account: mockExistingAccount, isLoading: false }),
  useAccountBalance: () => ({ balanceData: null, isLoading: false }),
  useAccountBalances: () => ({
    balancesByAccountId: new Map(
      mockAccounts.map(account => [account.id, { directTransactionCount: 0 }]),
    ),
  }),
  useAccounts: () => ({ accounts: mockAccounts }),
}));
jest.mock('@/src/hooks/use-currencies', () => ({
  useCurrencies: () => ({
    currencies: [
      { id: 'usd', code: 'USD', symbol: '$', name: 'US Dollar', precision: 2 },
      { id: 'eur', code: 'EUR', symbol: '€', name: 'Euro', precision: 2 },
    ],
  }),
}));
jest.mock('@/src/hooks/useObservable', () => ({
  useObservable: (_factory: unknown, _deps: unknown, initial: unknown) => ({
    data: typeof initial === 'boolean' ? mockIsParent : initial,
    isLoading: false,
  }),
}));
jest.mock('@/src/services/accounts/accountQueries', () => ({ accountQueries: {} }));
jest.mock('@/src/features/accounts/hooks/useAccountActions', () => ({
  useAccountActions: () => ({}),
}));
jest.mock('@/src/features/accounts/hooks/useAccountPersistence', () => ({
  useAccountPersistence: () => ({
    isCreating: false,
    handleCancel: jest.fn(),
    handleSave: jest.fn(),
  }),
}));
jest.mock('@/src/features/accounts/hooks/useAccountValidation', () => ({
  useAccountValidation: () => ({ formError: null }),
}));
jest.mock('@/src/features/accounts/hooks/useAccountArchiveAction', () => ({
  useAccountArchiveAction: () => ({ headerActionItems: [], archiveCascadeModal: null }),
}));
jest.mock('@/src/features/accounts/hooks/useAccountDeleteMergeActions', () => ({
  useAccountDeleteMergeActions: () => ({ headerActionItems: [], mergePickerModal: null }),
}));
jest.mock('@/src/features/accounts/hooks/form/useAccountFormBalanceClassify', () => ({
  useAccountFormBalanceClassify: () => ({ balanceClassify: null, onSave: mockOnSave }),
}));

jest.mock('@/src/hooks/use-reduced-motion', () => ({ useReducedMotion: () => true }));

beforeEach(() => {
  const keyboardEmitter = new EventEmitter();
  jest
    .spyOn(Keyboard, 'addListener')
    .mockImplementation((event, listener) => keyboardEmitter.addListener(event, listener));
  mockParams = {};
  mockExistingAccount = null;
  mockAccounts = [];
  mockIsParent = false;
  mockOnSave.mockClear();
  mockPathname = '/account-creation';
});

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
    mockParams = { pIcon: Icon.Bank };
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
    mockParams = { type: 'liability', subtype: 'LOAN' };
    const { result } = renderHook(useAccountFormViewModel);
    act(() => result.current.setAccountName('Card'));
    expect(result.current.accountSubtype).toBe(AccountSubtype.LOAN);
    expect(result.current.kindSuggestionMessage).toBeNull();
  });

  it('uses the default and leaves touched false for an invalid pair', () => {
    mockParams = { type: 'asset', subtype: 'LOAN' };
    const { result } = renderHook(useAccountFormViewModel);
    expect(result.current.accountSubtype).toBe(AccountSubtype.BANK_CHECKING);
    act(() => result.current.setAccountName('Card'));
    expect(result.current.kindSuggestionMessage).toBeNull();
  });

  it('shows the current kind with no suggestion in edit mode and resets on returning to create', () => {
    mockParams = { accountId: 'existing' };
    mockExistingAccount = {
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
    mockParams = {};
    mockExistingAccount = null;
    rerender({});
    expect(result.current.accountSubtype).toBe(AccountSubtype.BANK_CHECKING);
    act(() => result.current.setAccountName('Card'));
    expect(result.current.kindSuggestionMessage).toBe('Looks like a credit card.');
  });

  it.each([AccountType.INCOME, AccountType.EXPENSE])('keeps category behavior for %s', type => {
    mockPathname = '/category-creation';
    mockParams = { type };
    const { result } = renderHook(useAccountFormViewModel);
    act(() => result.current.setAccountName('Credit card'));
    expect(result.current.isCategory).toBe(true);
    expect(result.current.selectedIcon).toBe(
      type === AccountType.INCOME ? Icon.Briefcase : Icon.Coffee,
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
      chrome={{ screenTitle: vm.heroTitle, showBack: true, backIcon: Icon.Back, onBack: jest.fn() }}
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
    expect(screen.UNSAFE_getByType(GlyphCarousel).props.selectedKey).toBe('credit_card');
  });

  it('suppresses later suggestions after a manual drag that snaps back to bank', () => {
    const screen = render(<AccountFormHarness />);
    fireEvent(screen.getByTestId('account-kind-list'), 'scrollBeginDrag');
    fireEvent.changeText(screen.getByTestId('hero-name-input'), 'HDFC card');
    expect(screen.queryByTestId('account-kind-suggestion')).toBeNull();
    expect(screen.UNSAFE_getByType(GlyphCarousel).props.selectedKey).toBe('bank');
  });

  it('edits card metadata through day and finance sheets without losing the draft', () => {
    mockParams = { type: 'liability', subtype: 'CREDIT_CARD' };
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
    fireEvent.press(screen.getByTestId('account-kind-caption-action'));
    fireEvent.press(screen.getByTestId('account-all-kinds-LIABILITY-MORTGAGE'));
    expect(screen.UNSAFE_getByType(GlyphCarousel).props.selectedKey).toBe('liability_mortgage');
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

  it('renders categories through the shared carousel and compact form rows', () => {
    mockPathname = '/category-creation';
    const screen = render(<AccountFormHarness />);
    expect(screen.queryByTestId('account-kind')).toBeNull();
    expect(screen.getByTestId('category-kind')).toBeTruthy();
    expect(screen.getByTestId('category-note')).toBeTruthy();
    expect(screen.queryByTestId('hero-amount-input')).toBeNull();
  });
});

describe('category create/edit regressions', () => {
  it.each([AccountType.INCOME, AccountType.EXPENSE])('retains creation controls for %s', type => {
    mockPathname = '/category-creation';
    mockParams = { type };
    const screen = render(<AccountFormHarness />);
    expect(screen.queryByTestId('hero-amount-input')).toBeNull();
    expect(screen.queryByTestId('account-kind')).toBeNull();
    expect(screen.getByTestId('category-kind')).toBeTruthy();
    expect(
      screen
        .UNSAFE_getByType(GlyphCarousel)
        .props.items.every(
          (kind: { type: AccountType }) =>
            kind.type === AccountType.INCOME || kind.type === AccountType.EXPENSE,
        ),
    ).toBe(true);
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
    fireEvent.press(screen.getByTestId('category-kind-caption-action'));
    fireEvent.press(
      screen.getByTestId(
        type === AccountType.INCOME
          ? 'account-all-kinds-EXPENSE-HOUSING'
          : 'account-all-kinds-INCOME-SALARY',
      ),
    );
    expect(screen.getByTestId('hero-name-input').props.value).toBe('My category');
    expect(screen.getByText('Category note')).toBeTruthy();
    fireEvent.press(screen.getByTestId('category-appearance'));
    fireEvent.press(screen.getByLabelText(`Select icon ${Icon.Bank}`));
    fireEvent.press(screen.getByText('Done'));
    expect(screen.UNSAFE_getByType(AppearancePickerModal).props.selectedIcon).toBe(Icon.Bank);
    act(() => screen.UNSAFE_getByType(GlyphCarousel).props.onSelect('expense_food'));
    expect(screen.UNSAFE_getByType(AppearancePickerModal).props.selectedIcon).toBe(Icon.Bank);
    fireEvent.press(screen.getByTestId('submit-footer-button'));
    expect(mockOnSave).toHaveBeenCalledTimes(1);
  });

  it('keeps edit currency locked, category hierarchy, appearance and edit submission', () => {
    mockPathname = '/category-creation';
    mockParams = { accountId: 'category' };
    mockExistingAccount = {
      id: asAccountId('category'),
      name: 'Salary',
      accountType: AccountType.INCOME,
      accountSubtype: AccountSubtype.SALARY,
      currencyCode: 'EUR',
      icon: Icon.Briefcase,
      orderNum: 0,
    };
    mockAccounts = [
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
});

it('keeps category type/subtype locked when editing a parent category', () => {
  mockPathname = '/category-creation';
  mockParams = { accountId: 'parent-category' };
  mockIsParent = true;
  mockExistingAccount = {
    id: asAccountId('parent-category'),
    name: 'Food parent',
    accountType: AccountType.EXPENSE,
    accountSubtype: AccountSubtype.FOOD,
    currencyCode: 'USD',
    icon: Icon.Tag,
    orderNum: 0,
  };
  const screen = render(<AccountFormHarness />);
  expect(
    screen.UNSAFE_getByType(GlyphCarousel).props.items.map((kind: { key: string }) => kind.key),
  ).toEqual(['expense_food']);
  expect(screen.queryByTestId('category-kind-caption-action')).toBeNull();
  act(() => screen.UNSAFE_getByType(GlyphCarousel).props.onSelect('income_salary'));
  expect(screen.UNSAFE_getByType(GlyphCarousel).props.selectedKey).toBe('expense_food');
});

it('keeps a parent account kind locked while retaining appearance customization', () => {
  mockParams = { accountId: 'parent-account' };
  mockIsParent = true;
  mockExistingAccount = {
    id: asAccountId('parent-account'),
    name: 'Bank parent',
    accountType: AccountType.ASSET,
    accountSubtype: AccountSubtype.BANK_CHECKING,
    currencyCode: 'USD',
    icon: Icon.Bank,
    orderNum: 0,
  };
  const screen = render(<AccountFormHarness />);
  expect(screen.UNSAFE_getByType(GlyphCarousel).props.items).toHaveLength(1);
  expect(screen.queryByTestId('account-kind-caption-action')).toBeNull();
  expect(screen.getByTestId('account-appearance')).toBeTruthy();
});
