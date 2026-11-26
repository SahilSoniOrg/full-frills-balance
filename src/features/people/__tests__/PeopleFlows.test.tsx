import { fireEvent, render, waitFor } from '@/src/testing/render';
import { AccountSubtype, AccountType } from '@/src/types/enums';
import type { AccountId, JournalId, OpenItemId, PersonId, WorkplaceId } from '@/src/types/ids';
import { PeopleListScreen } from '../screens/PeopleListScreen';
import { PersonDetailsScreen } from '../screens/PersonDetailsScreen';

const mockWorkplaceId = 'wp-1' as WorkplaceId;
const mockBack = jest.fn();
const mockToPersonDetails = jest.fn();
const mockToSplitJournalEntry = jest.fn();
const mockToTransferRepayment = jest.fn();
const mockToSettleUp = jest.fn();
const mockCreatePerson = jest.fn(async () => ({ id: 'p-new', name: 'New Person' }));

let mockParams: Record<string, string> = {};

const mockPersonAri = {
  id: 'p-ari' as PersonId,
  name: 'Ari',
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
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissAll: jest.fn() },
}));

jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: () => ({ workplaceId: mockWorkplaceId, defaultCurrencyCode: 'INR' }),
}));

jest.mock('@/src/navigation/AppNavigation', () => ({
  AppNavigation: {
    back: () => mockBack(),
    toPersonDetails: (id: string) => mockToPersonDetails(id),
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
      listLinkableAccountsForPeople: async () => [],
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

  it('renders PersonDetailsScreen with open item and action buttons', async () => {
    mockParams = { personId: mockPersonAri.id };
    const { getByTestId, getByText } = render(<PersonDetailsScreen />);
    await waitFor(() => expect(getByText(/Ari owes you/)).toBeTruthy());
    fireEvent.press(getByTestId('person-split-expense-button'));
    expect(mockToSplitJournalEntry).toHaveBeenCalledWith({ personId: mockPersonAri.id });
    fireEvent.press(getByTestId('person-settle-up-button'));
    expect(mockToTransferRepayment).toHaveBeenCalledWith({
      personId: mockPersonAri.id,
      openItemId: undefined,
    });
  });
});
