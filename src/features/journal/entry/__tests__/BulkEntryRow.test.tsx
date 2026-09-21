import { render } from '@/src/utils/test-utils';
import { AccountType } from '@/src/types/enums';
import { asAccountId, asWorkplaceId } from '@/src/types/ids';
import type { BulkJournalRow, BulkJournalRowActions } from '../types/bulkJournal';
import { BulkEntryRow } from '../components/BulkEntryRow';
import { Spacing } from '@/src/constants/design-tokens';
import { StyleSheet } from 'react-native';

const mockEntryTransactionCard = jest.fn((props: unknown) => {
  void props;
  return null;
});

jest.mock('../components/EntryTransactionCard', () => ({
  EntryTransactionCard: (props: unknown) => {
    mockEntryTransactionCard(props);
    return null;
  },
}));

jest.mock('@/src/components/core', () => ({
  AppIcon: () => null,
  AppText: ({ children }: { children?: React.ReactNode }) => children,
  Icon: { Delete: 'delete', Error: 'error' },
}));

jest.mock('@/src/hooks/use-theme', () => ({
  useTheme: () => ({
    theme: {
      border: '#000000',
      error: '#ff0000',
      textSecondary: '#666666',
    },
  }),
}));

jest.mock('@/src/features/journal/hooks/useJournalSuggestions', () => ({
  useJournalSuggestions: () => ({
    suggestions: [],
    suggestionState: 'idle',
    loadSuggestions: jest.fn(),
  }),
}));

const row: BulkJournalRow = {
  id: 'row-1',
  description: 'Coffee',
  notes: '',
  transactionType: 'transfer',
  amount: '4.50',
  sourceId: asAccountId('source'),
  destinationId: asAccountId('destination'),
  journalDate: 1_700_000_000_000,
  exchangeRate: '',
  isCrossCurrency: false,
  convertedAmount: 0,
  isLoadingRate: false,
};

const accounts = [
  {
    id: asAccountId('source'),
    name: 'Source',
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
  },
  {
    id: asAccountId('destination'),
    name: 'Destination',
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
  },
];

const rowActions = {} as BulkJournalRowActions;

describe('BulkEntryRow layout', () => {
  beforeEach(() => {
    mockEntryTransactionCard.mockClear();
  });

  it('keeps the compact type selector separated from the date metadata row', () => {
    render(
      <BulkEntryRow
        row={row}
        index={0}
        accounts={accounts}
        workplaceCurrency="USD"
        workplaceId={asWorkplaceId('workplace')}
        rowActions={rowActions}
        onRemove={jest.fn()}
        onDateTimePickerRequest={jest.fn()}
        accountExpansion={null}
        onToggleAccountExpansion={jest.fn()}
        onSwapAccounts={jest.fn()}
        onRefreshRate={jest.fn()}
      />,
    );

    const props = mockEntryTransactionCard.mock.calls[0]?.[0] as {
      metaContainerStyle: unknown;
    };
    expect(StyleSheet.flatten(props.metaContainerStyle)).toEqual(
      expect.objectContaining({ marginBottom: Spacing.sm }),
    );
  });
});
