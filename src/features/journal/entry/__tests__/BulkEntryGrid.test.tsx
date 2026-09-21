import { render, screen } from '@/src/utils/test-utils';
import { AppConfig } from '@/src/constants';
import { AccountType } from '@/src/types/enums';
import { asAccountId, asWorkplaceId } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';
import type { BulkJournalRow, BulkJournalRowActions } from '../types/bulkJournal';
import { BulkEntryGrid } from '../components/BulkEntryGrid';
import type { ReactNode } from 'react';

jest.mock('@shopify/flash-list', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native') as typeof import('react-native');

  return {
    FlashList: ({
      data,
      renderItem,
      ListHeaderComponent,
      ListFooterComponent,
    }: {
      data: BulkJournalRow[];
      renderItem: (info: { item: BulkJournalRow; index: number }) => ReactNode;
      ListHeaderComponent?: ReactNode;
      ListFooterComponent?: ReactNode;
    }) => (
      <View>
        {ListHeaderComponent}
        {data.map((item, index) => renderItem({ item, index }))}
        {ListFooterComponent}
      </View>
    ),
  };
});

jest.mock('@/src/components/core', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react') as typeof import('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text } = require('react-native') as typeof import('react-native');
  const TextContent = ({ children }: { children?: ReactNode }) =>
    React.createElement(Text, null, children);

  return {
    AppButton: TextContent,
    AppIcon: () => null,
    AppText: TextContent,
    Icon: { Info: 'info' },
  };
});

jest.mock('../components/BulkEntryRow', () => ({
  BulkEntryRow: () => null,
}));

jest.mock('@/src/components/filters/DateTimePickerModal', () => ({
  DateTimePickerModal: () => null,
}));

jest.mock('@/src/hooks/use-theme', () => ({
  useTheme: () => ({
    theme: {
      border: '#000000',
      error: '#ff0000',
      surfaceSecondary: '#ffffff',
      success: '#00ff00',
      textTertiary: '#666666',
    },
  }),
}));

const accounts: AccountFields[] = [
  {
    id: asAccountId('source'),
    name: 'Source',
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
  } as AccountFields,
  {
    id: asAccountId('destination'),
    name: 'Destination',
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
  } as AccountFields,
];

const rowActions: BulkJournalRowActions = {
  setDescription: jest.fn(),
  setNotes: jest.fn(),
  setAmount: jest.fn(),
  setJournalDate: jest.fn(),
  setTransactionType: jest.fn(),
  setSourceAccount: jest.fn(),
  setDestinationAccount: jest.fn(),
  setConvertedAmount: jest.fn(),
  setManualBaseRate: jest.fn(),
  applySuggestion: jest.fn(),
};

function makeRow(overrides: Partial<BulkJournalRow> = {}): BulkJournalRow {
  return {
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
    ...overrides,
  };
}

function renderGrid(rows: BulkJournalRow[]) {
  return render(
    <BulkEntryGrid
      rows={rows}
      submitError={null}
      accounts={accounts}
      workplaceCurrency="USD"
      workplaceId={asWorkplaceId('workplace')}
      addRow={jest.fn()}
      removeRow={jest.fn()}
      clearRows={jest.fn()}
      rowActions={rowActions}
      swapRowAccounts={jest.fn()}
      refreshRowRate={jest.fn()}
      isAtMaxRows={false}
    />,
  );
}

describe('BulkEntryGrid validation summary', () => {
  it('does not render All valid for a partially edited invalid row', () => {
    renderGrid([
      makeRow({
        destinationId: asAccountId(''),
        validationError: 'Destination account is required',
      }),
    ]);

    expect(screen.getByText('1 need attention')).toBeTruthy();
    expect(screen.queryByText('All valid')).toBeNull();
  });

  it('renders All valid for a fully valid row', () => {
    renderGrid([makeRow()]);

    expect(screen.getByText('All valid')).toBeTruthy();
    expect(screen.queryByText('need attention')).toBeNull();
    expect(screen.queryByText(AppConfig.strings.transactionFlow.bulkEntryHint)).toBeNull();
  });
});
