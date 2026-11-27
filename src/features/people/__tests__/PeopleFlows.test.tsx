import { fireEvent, render, waitFor } from '@/src/testing/render';
import { AccountSubtype, AccountType } from '@/src/types/enums';
import type { AccountId, JournalId, OpenItemId, PersonId, WorkplaceId } from '@/src/types/ids';
import { PeopleListScreen } from '../screens/PeopleListScreen';
import { PersonCreationScreen } from '../screens/PersonCreationScreen';
import { PersonDetailsScreen } from '../screens/PersonDetailsScreen';

const mockWorkplaceId = 'wp-1' as WorkplaceId;
const mockBack = jest.fn();
const mockToPersonDetails = jest.fn();
const mockToPersonEdit = jest.fn();
const mockToSplitJournalEntry = jest.fn();
const mockToTransferRepayment = jest.fn();
const mockToSettleUp = jest.fn();
const mockCreatePerson = jest.fn(async () => ({ id: 'p-new', name: 'New Person' }));
const mockUpdatePerson = jest.fn(async () => ({ id: 'p-ari', name: 'Ari Updated' }));
const mockSetClipboard = jest.fn(async () => true);

let mockParams: Record<string, string> = {};

const mockPersonAri = {
  id: 'p-ari' as PersonId,
  name: 'Ari',
  color: '#10B981',
  defaultCurrencyCode: 'USD',
  paymentHandle: 'ari@upi',
  phone: '+91 98765 43210',
  email: 'ari@example.com',
  notes: 'Flatmate split ledger',
  isPinned: true,
  archivedAt: undefined,
  updatedAt: new Date('2026-01-01'),
};
const mockRecvAccount = {
  id: 'acc-ari-recv' as AccountId,
  name: 'Ari (Receivable)',
  accountType: AccountType.ASSET,
  accountSubtype: AccountSubtype.RECEIVABLE,
  currencyCode: 'INR',
};
const mockBankAccount = {
  id: 'acc-bank' as AccountId,
  name: 'HDFC Bank',
  accountType: AccountType.ASSET,
  accountSubtype: AccountSubtype.CASH,
  currencyCode: 'INR',
};
const mockFoodAccount = {
  id: 'acc-food' as AccountId,
  name: 'Food',
  accountType: AccountType.EXPENSE,
  accountSubtype: AccountSubtype.OTHER,
  currencyCode: 'INR',
};
const mockOpenItem = {
  id: 'oi-1' as OpenItemId,
  personId: mockPersonAri.id,
  accountId: mockRecvAccount.id,
  originatingJournalId: 'j-origin' as JournalId,
  currencyCode: 'INR',
  originalAmount: 500,
  createdAt: 1_700_000_000_000,
};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useFocusEffect: jest.fn(),
  useNavigation: () => ({ addListener: jest.fn(() => jest.fn()), dispatch: jest.fn() }),
  usePreventRemove: jest.fn(),
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissAll: jest.fn() },
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: (...args: unknown[]) =>
    (mockSetClipboard as (...a: unknown[]) => unknown)(...args),
}));

jest.mock('@/src/hooks/use-currencies', () => ({
  useCurrencies: () => ({
    currencies: [
      { id: 'c-inr', code: 'INR', name: 'Indian Rupee', symbol: '₹', precision: 2 },
      { id: 'c-usd', code: 'USD', name: 'US Dollar', symbol: '$', precision: 2 },
    ],
    isLoading: false,
  }),
}));

jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: () => ({ workplaceId: mockWorkplaceId, defaultCurrencyCode: 'INR' }),
}));

jest.mock('@/src/navigation/AppNavigation', () => ({
  AppNavigation: {
    back: () => mockBack(),
    toPersonDetails: (id: string) => mockToPersonDetails(id),
    toPersonEdit: (id: string, workplaceId?: string) => mockToPersonEdit(id, workplaceId),
    toSplitJournalEntry: (params?: Record<string, string>) => mockToSplitJournalEntry(params),
    toTransferRepayment: (params?: Record<string, string>) => mockToTransferRepayment(params),
    toSettleUp: (params?: Record<string, string>) => mockToSettleUp(params),
    toJournalDetails: jest.fn(),
  },
}));

jest.mock('@/src/hooks/useShareable', () => ({
  useShareable: () => ({ share: jest.fn(), isBusy: false, isPreparing: false }),
}));

jest.mock('@/src/services/feedback/alerts', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
  showErrorAlert: jest.fn(),
  showConfirmationAlert: jest.fn(),
}));

jest.mock('@/src/services/people', () => {
  const { of: rxOf } = jest.requireActual('rxjs') as typeof import('rxjs');
  const { TransactionType: rxTxType } = jest.requireActual(
    '@/src/types/enums',
  ) as typeof import('@/src/types/enums');
  return {
    createPerson: (...args: unknown[]) =>
      (mockCreatePerson as (...a: unknown[]) => unknown)(...args),
    updatePerson: (...args: unknown[]) =>
      (mockUpdatePerson as (...a: unknown[]) => unknown)(...args),
    renamePerson: jest.fn(),
    setPersonArchived: jest.fn(),
    softDeletePerson: jest.fn(),
    linkExistingAccount: jest.fn(),
    saveFriendPaidBill: jest.fn(),
    allocateUnassignedRepayment: jest.fn(),
    executeWeAreSettled: jest.fn(),
    peopleReadService: {
      observePeopleTick: () => rxOf(null),
      listPeopleWithBalances: async () => [
        {
          person: mockPersonAri,
          linkedAccounts: [
            {
              id: 'pa-1',
              personId: mockPersonAri.id,
              accountId: mockRecvAccount.id,
              account: mockRecvAccount,
              unassignedState: {
                accountId: mockRecvAccount.id,
                currencyCode: 'INR',
                ledgerBalanceInNormalDirection: 500,
                trackedOpenRemainderSum: 500,
                unassignedBalance: 0,
                hasNegativeUnassignedRemainder: false,
              },
            },
          ],
          balanceSummary: {
            personId: mockPersonAri.id,
            currencies: [{ currencyCode: 'INR', owedToYou: 500, youOwe: 0, net: 500 }],
          },
          currencies: [{ currencyCode: 'INR', owedToYou: 500, youOwe: 0, net: 500 }],
          openItems: [{ item: mockOpenItem, remainder: 500 }],
          hasNegativeUnassignedRemainder: false,
        },
      ],
      listLinkableAccountsForPeople: async () => [mockRecvAccount],
      listPersonPickerGroups: async () => [
        {
          personId: mockPersonAri.id,
          personName: mockPersonAri.name,
          color: mockPersonAri.color,
          defaultCurrencyCode: mockPersonAri.defaultCurrencyCode,
          isPinned: true,
          archived: false,
          accountIds: [mockRecvAccount.id],
        },
      ],
      getPersonProfile: async () => mockPersonAri,
      getPersonDetail: async () => ({
        person: mockPersonAri,
        linkedAccounts: [
          {
            id: 'pa-1',
            personId: mockPersonAri.id,
            accountId: mockRecvAccount.id,
            account: mockRecvAccount,
            unassignedState: {
              accountId: mockRecvAccount.id,
              currencyCode: 'INR',
              ledgerBalanceInNormalDirection: 500,
              trackedOpenRemainderSum: 500,
              unassignedBalance: 0,
              hasNegativeUnassignedRemainder: false,
            },
          },
        ],
        openItems: [{ item: mockOpenItem, remainder: 500 }],
        activeAllocations: [],
        balanceSummary: {
          personId: mockPersonAri.id,
          currencies: [{ currencyCode: 'INR', owedToYou: 500, youOwe: 0, net: 500 }],
        },
        unallocatedRepayments: [],
      }),
      listPersonJournalHistory: async () => [],
      listSelectableAccounts: async () => [mockBankAccount, mockFoodAccount],
      getJournalForSplit: async () => null,
      listCompatibleRepaymentJournals: async () => [
        {
          journalId: 'j-bank' as JournalId,
          journalDate: 1_700_000_200_000,
          description: 'Captured UPI',
          currencyCode: 'INR',
          cashAccountId: mockBankAccount.id,
          cashAccountName: mockBankAccount.name,
          cashAmount: 500,
          cashTransactionType: rxTxType.DEBIT,
          touchesPersonAccount: false,
        },
      ],
    },
  };
});

describe('People screens', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
  });

  it('renders PeopleListScreen and navigates to PersonDetailsScreen on press', async () => {
    const { getByText } = render(<PeopleListScreen />);
    await waitFor(() => expect(getByText('Ari')).toBeTruthy());
    fireEvent.press(getByText('Ari'));
    expect(mockToPersonDetails).toHaveBeenCalledWith(mockPersonAri.id);
  });

  it('renders PersonDetailsScreen profile attributes and copies payment handle', async () => {
    mockParams = { personId: mockPersonAri.id };
    const { getByTestId, getByText } = render(<PersonDetailsScreen />);
    await waitFor(() => expect(getByText(/Ari owes you/)).toBeTruthy());
    expect(getByText('Pinned')).toBeTruthy();
    expect(getByText('USD')).toBeTruthy();
    expect(getByText('ari@upi')).toBeTruthy();
    expect(getByText('Flatmate split ledger')).toBeTruthy();

    fireEvent.press(getByTestId('person-copy-payment-handle-button'));
    await waitFor(() => expect(mockSetClipboard).toHaveBeenCalledWith('ari@upi'));

    fireEvent.press(getByTestId('person-split-expense-button'));
    expect(mockToSplitJournalEntry).toHaveBeenCalledWith({ personId: mockPersonAri.id });
    fireEvent.press(getByTestId('person-settle-up-button'));
    expect(mockToTransferRepayment).toHaveBeenCalledWith({
      personId: mockPersonAri.id,
      openItemId: undefined,
    });
  });

  it('validates duplicate person names and creates enriched profiles in PersonCreationScreen', async () => {
    const { getAllByText, getByLabelText, getByTestId } = render(<PersonCreationScreen />);
    await waitFor(() => expect(getByTestId('person-name-input')).toBeTruthy());

    fireEvent.changeText(getByTestId('person-name-input'), 'ari');
    await waitFor(() => expect(getByTestId('person-duplicate-warning')).toBeTruthy());

    fireEvent.changeText(getByTestId('person-name-input'), 'Priya');
    fireEvent.press(getByLabelText('Select color #10B981'));
    fireEvent.changeText(getByTestId('person-payment-handle-input'), 'priya@okaxis');
    fireEvent.changeText(getByTestId('person-phone-input'), '+91 91111 22222');
    fireEvent.changeText(getByTestId('person-email-input'), 'priya@example.com');
    fireEvent.changeText(getByTestId('person-notes-input'), 'Goa trip');
    fireEvent(getByLabelText('Pin to top'), 'valueChange', true);

    const submitButtons = getAllByText('Add person');
    fireEvent.press(submitButtons[submitButtons.length - 1]!);
    await waitFor(() =>
      expect(mockCreatePerson).toHaveBeenCalledWith(mockWorkplaceId, {
        name: 'Priya',
        color: '#10B981',
        defaultCurrencyCode: undefined,
        paymentHandle: 'priya@okaxis',
        phone: '+91 91111 22222',
        email: 'priya@example.com',
        notes: 'Goa trip',
        isPinned: true,
        initialAccountId: undefined,
      }),
    );
  });

  it('loads existing profile in PersonCreationScreen edit mode and calls updatePerson', async () => {
    mockParams = { personId: mockPersonAri.id };
    const { getByDisplayValue, getByText } = render(<PersonCreationScreen />);
    await waitFor(() => expect(getByDisplayValue('Ari')).toBeTruthy());
    fireEvent.changeText(getByDisplayValue('Flatmate split ledger'), 'Updated note');
    fireEvent.press(getByText('Save changes'));
    await waitFor(() =>
      expect(mockUpdatePerson).toHaveBeenCalledWith(
        mockWorkplaceId,
        mockPersonAri.id,
        expect.objectContaining({
          name: 'Ari',
          notes: 'Updated note',
          paymentHandle: 'ari@upi',
          defaultCurrencyCode: 'USD',
          isPinned: true,
        }),
      ),
    );
  });
});
