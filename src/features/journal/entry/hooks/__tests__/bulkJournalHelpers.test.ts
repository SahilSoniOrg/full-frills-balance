import { AccountType } from '@/src/types/enums';
import { asAccountId, asWorkplaceId } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';
import { buildBulkJournalEntries } from '@/src/features/journal/entry/hooks/bulkJournalHelpers';
import type { BulkJournalRow } from '@/src/features/journal/entry/types/bulkJournal';

const accounts = [
  {
    id: asAccountId('acc1'),
    name: 'Cash',
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
  },
  {
    id: asAccountId('acc2'),
    name: 'Food',
    accountType: AccountType.EXPENSE,
    currencyCode: 'USD',
  },
] as AccountFields[];

function makeRow(overrides: Partial<BulkJournalRow> = {}): BulkJournalRow {
  return {
    id: 'row-1',
    description: 'Coffee',
    notes: '',
    amount: '4.50',
    sourceId: asAccountId('acc1'),
    destinationId: asAccountId('acc2'),
    journalDate: 1_700_000_000_000,
    exchangeRate: '',
    isCrossCurrency: false,
    convertedAmount: 0,
    isLoadingRate: false,
    ...overrides,
  };
}

describe('buildBulkJournalEntries', () => {
  it('carries journal notes from each bulk row', () => {
    const entries = buildBulkJournalEntries(
      [makeRow({ notes: 'Receipt in wallet' })],
      accounts,
      'USD',
      asWorkplaceId('wp1'),
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].notes).toBe('Receipt in wallet');
    expect(entries[0].description).toBe('Coffee');
  });

  it('keeps empty notes when the row has none', () => {
    const entries = buildBulkJournalEntries([makeRow()], accounts, 'USD', asWorkplaceId('wp1'));

    expect(entries[0].notes).toBe('');
  });
});
