import { act, renderHook, waitFor } from '@testing-library/react-native';
import AccountCreationScreen from '../AccountCreationScreen';
import { useAccountPersistence } from '@/src/features/accounts/hooks/useAccountPersistence';
import { AccountSubtype, AccountType } from '@/src/types/enums';
import { asAccountId, asWorkplaceId } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';
import type { AccountSavePayload } from '@/src/features/accounts/services/accountFormService';
import { Icon } from '@/src/types/domainIcons';
import { confirm, showErrorAlert } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import { AllTheProviders } from '@/src/utils/test-utils';
import type { AccountFormViewModel } from '@/src/features/accounts/hooks/useAccountFormViewModel';
import { createDefaultAccountMetadataValues } from '@/src/features/accounts/services/accountMetadataDomain';

type DraftFields = Pick<
  AccountFormViewModel,
  | 'accountType'
  | 'accountSubtype'
  | 'parentAccountId'
  | 'selectedCurrency'
  | 'selectedIcon'
  | 'selectedColor'
  | 'initialBalance'
> & { metadata: ReturnType<typeof createDefaultAccountMetadataValues> };

const mockCreateAccount = jest.fn();
const mockWorkplaceId = asWorkplaceId('workplace');
const mockSaveAccount = jest.fn();
const mockAdjustBalance = jest.fn();
const mockDispatch = jest.fn();
const mockGetState = jest.fn();
let mockPersistence: ReturnType<typeof useAccountPersistence>;
let mockSetName: (name: string) => void;
let mockPatchDraft: (patch: Partial<DraftFields>) => void;
let mockExistingAccount: AccountFields | undefined;
let mockHasExistingAccounts = true;
let mockReturnTarget: string | undefined;
let mockPreventRemove = false;
let mockPreventRemoveCallback: (event: { data: { action: { type: string } } }) => void;
let mockQueuedLeave: (() => void) | undefined;
const mockLeft = jest.fn();
const mockGuardAtNavigationRequest = jest.fn();

// Expo Router queues back/replace. Deliver removal only after the save's
// promise settles and React commits, rather than treating back() as immediate.
function mockQueueLeave() {
  mockGuardAtNavigationRequest(mockPreventRemove);
  mockQueuedLeave = () => {
    if (mockPreventRemove) {
      mockPreventRemoveCallback({ data: { action: { type: 'GO_BACK' } } });
    } else {
      mockLeft();
    }
  };
}

jest.mock('expo-router', () => ({
  useNavigation: () => ({ dispatch: mockDispatch, getState: mockGetState }),
  usePreventRemove: (enabled: boolean, callback: typeof mockPreventRemoveCallback) => {
    const React = jest.requireActual<typeof import('react')>('react');
    React.useEffect(() => {
      mockPreventRemove = enabled;
      mockPreventRemoveCallback = callback;
    }, [enabled, callback]);
  },
}));
jest.mock('@/src/utils/navigation', () => ({
  AppNavigation: {
    back: jest.fn(() => mockQueueLeave()),
    toAccounts: jest.fn(() => mockQueueLeave()),
  },
}));
jest.mock('@/src/utils/alerts', () => ({
  confirm: { show: jest.fn() },
  showErrorAlert: jest.fn(),
  toast: { success: jest.fn() },
}));
jest.mock('@/src/services/analytics', () => ({ analytics: { trackFeatureUsage: jest.fn() } }));
jest.mock('@/src/features/accounts/hooks/useAccountActions', () => ({
  useAccountActions: () => ({
    createAccount: mockCreateAccount,
    saveAccount: mockSaveAccount,
    adjustBalance: mockAdjustBalance,
  }),
}));
jest.mock('@/src/features/accounts/components/AccountFormView', () => ({
  AccountFormView: () => null,
}));
jest.mock('@/src/features/accounts/hooks/useAccountFormViewModel', () => ({
  useAccountFormViewModel: () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { AccountSubtype, AccountType } =
      jest.requireActual<typeof import('@/src/types/enums')>('@/src/types/enums');
    const { asAccountId } = jest.requireActual<typeof import('@/src/types/ids')>('@/src/types/ids');
    const { Icon } =
      jest.requireActual<typeof import('@/src/types/domainIcons')>('@/src/types/domainIcons');
    const { createDefaultAccountMetadataValues } = jest.requireActual<
      typeof import('@/src/features/accounts/services/accountMetadataDomain')
    >('@/src/features/accounts/services/accountMetadataDomain');
    const { useAccountPersistence: usePersistence } = jest.requireActual<
      typeof import('@/src/features/accounts/hooks/useAccountPersistence')
    >('@/src/features/accounts/hooks/useAccountPersistence');
    const [accountName, setAccountName] = React.useState('');
    const [fields, setFields] = React.useState<DraftFields>(() => ({
      accountType: AccountType.ASSET,
      accountSubtype: AccountSubtype.BANK_CHECKING,
      parentAccountId: asAccountId(''),
      selectedCurrency: 'USD',
      selectedIcon: Icon.Wallet,
      selectedColor: '',
      initialBalance: '',
      metadata: createDefaultAccountMetadataValues(),
    }));
    mockSetName = setAccountName;
    mockPatchDraft = patch => setFields(previous => ({ ...previous, ...patch }));
    mockPersistence = usePersistence(
      mockWorkplaceId,
      mockExistingAccount,
      mockExistingAccount?.id,
      mockHasExistingAccounts,
      mockReturnTarget,
    );
    return {
      ...mockPersistence,
      ...fields,
      accountName,
      isEditMode: Boolean(mockExistingAccount),
      isCategory:
        fields.accountType === AccountType.INCOME || fields.accountType === AccountType.EXPENSE,
      isLoading: false,
      formChrome: { managementActions: [] },
      heroTitle: 'New account',
    };
  },
}));

const account: AccountFields = {
  id: asAccountId('created-card'),
  name: 'HDFC card',
  accountType: AccountType.LIABILITY,
  accountSubtype: AccountSubtype.CREDIT_CARD,
  currencyCode: 'USD',
};
const payload: AccountSavePayload = {
  accountName: account.name,
  accountType: account.accountType,
  accountSubtype: AccountSubtype.CREDIT_CARD,
  selectedCurrency: 'USD',
  selectedIcon: Icon.CreditCard,
  selectedColor: '',
  initialBalance: '',
};

async function renderDirtyScreen() {
  renderHook(AccountCreationScreen, { wrapper: AllTheProviders });
  await waitFor(() => expect(mockPreventRemove).toBe(false));
  // Wait for the shared guard's deferred baseline to capture the empty draft.
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  act(() => mockSetName(account.name));
  await waitFor(() => expect(mockPreventRemove).toBe(true));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateAccount.mockResolvedValue(account);
  mockSaveAccount.mockResolvedValue(account);
  mockAdjustBalance.mockResolvedValue(undefined);
  mockExistingAccount = undefined;
  mockHasExistingAccounts = true;
  mockReturnTarget = undefined;
  mockPreventRemove = false;
  mockQueuedLeave = undefined;
  mockGetState.mockReturnValue(undefined);
});

it.each([AccountType.ASSET, AccountType.EXPENSE])(
  'does not guard a blank new %s draft after selector changes or clearing content',
  async accountType => {
    await renderDirtyScreen();
    act(() => {
      mockSetName('');
      mockPatchDraft({
        accountType,
        parentAccountId: asAccountId('parent'),
        selectedCurrency: 'EUR',
        selectedIcon: Icon.Tag,
        selectedColor: '#123456',
      });
    });
    expect(mockPreventRemove).toBe(false);
    act(() => mockPreventRemoveCallback({ data: { action: { type: 'GO_BACK' } } }));
    expect(confirm.show).not.toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalled();
    act(() => mockSetName('Custom name'));
    expect(mockPreventRemove).toBe(true);
    act(() => mockSetName('   '));
    expect(mockPreventRemove).toBe(false);
  },
);

it.each([
  { initialBalance: '0' },
  { metadata: { ...createDefaultAccountMetadataValues(), notes: 'Keep this note' } },
  { metadata: { ...createDefaultAccountMetadataValues(), creditLimitAmount: '500' } },
  { metadata: { ...createDefaultAccountMetadataValues(), statementDay: '15' } },
])('protects entered content without a name: %j', async patch => {
  await renderDirtyScreen();
  act(() => {
    mockSetName('');
    mockPatchDraft(patch);
  });
  expect(mockPreventRemove).toBe(true);
  act(() => mockPreventRemoveCallback({ data: { action: { type: 'GO_BACK' } } }));
  expect(confirm.show).toHaveBeenCalledTimes(1);
});

it('still protects selector-only changes when editing an account', async () => {
  mockExistingAccount = account;
  renderHook(AccountCreationScreen, { wrapper: AllTheProviders });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  act(() => mockPatchDraft({ parentAccountId: asAccountId('parent') }));
  expect(mockPreventRemove).toBe(true);
});

it.each([true, false])(
  'allows queued navigation after creation (existing accounts: %s)',
  async existing => {
    mockHasExistingAccounts = existing;
    await renderDirtyScreen();
    await act(async () => mockPersistence.handleSave({ payload }));
    expect(mockQueuedLeave).toBeDefined();
    expect(mockPreventRemove).toBe(false);
    expect(mockGuardAtNavigationRequest).toHaveBeenCalledWith(false);
    act(() => mockQueuedLeave?.());
    expect(confirm.show).not.toHaveBeenCalled();
    expect(mockLeft).toHaveBeenCalledTimes(1);
    expect(existing ? AppNavigation.back : AppNavigation.toAccounts).toHaveBeenCalledTimes(1);
  },
);

it('does not create a second account while successful navigation is pending', async () => {
  await renderDirtyScreen();
  await act(async () => mockPersistence.handleSave({ payload }));
  await act(async () => mockPersistence.handleSave({ payload }));
  expect(mockCreateAccount).toHaveBeenCalledTimes(1);
});

it('returns the created account to its journal slot before leaving without prompting', async () => {
  mockHasExistingAccounts = false;
  mockReturnTarget = 'line:line-1';
  mockGetState.mockReturnValue({
    index: 1,
    routes: [
      { key: 'journal', name: 'journal-entry' },
      { key: 'form', name: 'account-creation' },
    ],
  });
  await renderDirtyScreen();
  await act(async () => mockPersistence.handleSave({ payload }));
  expect(mockDispatch).toHaveBeenCalledWith({
    type: 'SET_PARAMS',
    source: 'journal',
    payload: { params: { createdAccountId: account.id, createdAccountTarget: mockReturnTarget } },
  });
  expect(mockGuardAtNavigationRequest).toHaveBeenCalledWith(false);
  act(() => mockQueuedLeave?.());
  expect(confirm.show).not.toHaveBeenCalled();
  expect(mockLeft).toHaveBeenCalledTimes(1);
  expect(AppNavigation.toAccounts).not.toHaveBeenCalled();
});

it('allows queued navigation after an edit and balance adjustment complete', async () => {
  mockExistingAccount = account;
  await renderDirtyScreen();
  await act(async () =>
    mockPersistence.handleSave({
      payload: { ...payload, initialBalance: '10', balanceData: { balance: 0 } },
      balanceChange: { kind: 'adjustment' },
    }),
  );
  expect(mockSaveAccount).toHaveBeenCalledTimes(1);
  expect(mockAdjustBalance).toHaveBeenCalledTimes(1);
  expect(mockGuardAtNavigationRequest).toHaveBeenCalledWith(false);
  act(() => mockQueuedLeave?.());
  expect(confirm.show).not.toHaveBeenCalled();
  expect(mockLeft).toHaveBeenCalledTimes(1);
});

it('includes the selected currency when saving an existing account', async () => {
  mockExistingAccount = account;
  await renderDirtyScreen();
  await act(async () =>
    mockPersistence.handleSave({
      payload: { ...payload, selectedCurrency: 'EUR' },
    }),
  );
  expect(mockSaveAccount).toHaveBeenCalledWith(
    account,
    expect.objectContaining({
      currencyCode: 'EUR',
    }),
  );
});

it('keeps failed saves dirty and retryable', async () => {
  mockCreateAccount.mockRejectedValueOnce(new Error('write failed'));
  await renderDirtyScreen();
  await act(async () => mockPersistence.handleSave({ payload }));
  expect(showErrorAlert).toHaveBeenCalled();
  expect(mockPersistence.isCreating).toBe(false);
  expect(mockQueuedLeave).toBeUndefined();
  act(() => mockPreventRemoveCallback({ data: { action: { type: 'GO_BACK' } } }));
  expect(confirm.show).toHaveBeenCalledTimes(1);
  await act(async () => mockPersistence.handleSave({ payload }));
  expect(mockCreateAccount).toHaveBeenCalledTimes(2);
});

it('retains the guard if an edit balance adjustment fails', async () => {
  mockExistingAccount = account;
  mockAdjustBalance.mockRejectedValueOnce(new Error('adjustment failed'));
  await renderDirtyScreen();
  await act(async () =>
    mockPersistence.handleSave({
      payload: { ...payload, initialBalance: '10', balanceData: { balance: 0 } },
      balanceChange: { kind: 'adjustment' },
    }),
  );
  expect(mockPersistence.isCreating).toBe(false);
  expect(mockPreventRemove).toBe(true);
  expect(mockQueuedLeave).toBeUndefined();
  expect(showErrorAlert).toHaveBeenCalled();
});
