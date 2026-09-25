import { AccountType } from '@/src/types/enums';
import { asAccountId, asWorkplaceId } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';
import {
  buildBulkJournalEntries,
  DUPLICATE_ACCOUNT_ERROR,
  getBulkJournalDuplicateAccountError,
  getBulkJournalRowError,
  validateBulkJournalRow,
} from '@/src/features/journal/entry/hooks/bulkJournalHelpers';
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
    transactionType: 'transfer',
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

  it('preserves the destination currency precision in converted entries', () => {
    const kwdAccounts = [accounts[0], { ...accounts[1], currencyCode: 'KWD' }] as AccountFields[];
    const entries = buildBulkJournalEntries(
      [
        makeRow({
          isCrossCurrency: true,
          convertedAmount: 1.234,
          sourceBaseRate: 1,
          destBaseRate: 3.282,
        }),
      ],
      kwdAccounts,
      'USD',
      asWorkplaceId('wp1'),
    );

    expect(entries[0].lines[0].amount).toBe('1.234');
  });
});

describe('validateBulkJournalRow', () => {
  it('rejects a partially edited row even before its display error is populated', () => {
    expect(validateBulkJournalRow(makeRow({ description: '' }))).toBe('Description is required');
    expect(
      validateBulkJournalRow(makeRow({ destinationId: '' as BulkJournalRow['destinationId'] })),
    ).toBe('Destination account is required');
  });

  it('accepts a complete row', () => {
    expect(validateBulkJournalRow(makeRow())).toBeUndefined();
  });

  it('uses one canonical duplicate-account message and helper', () => {
    expect(
      getBulkJournalDuplicateAccountError(
        'acc1' as BulkJournalRow['sourceId'],
        'acc1' as BulkJournalRow['destinationId'],
      ),
    ).toBe(DUPLICATE_ACCOUNT_ERROR);
    expect(validateBulkJournalRow(makeRow({ destinationId: makeRow().sourceId }))).toBe(
      DUPLICATE_ACCOUNT_ERROR,
    );
  });
});

describe('getBulkJournalRowError', () => {
  it('does not validate a pristine row', () => {
    expect(
      getBulkJournalRowError(
        makeRow({
          description: '',
          notes: '',
          amount: '',
          sourceId: asAccountId(''),
          destinationId: asAccountId(''),
        }),
      ),
    ).toBeUndefined();
  });

  it('does not validate until the editor persists a debounced error', () => {
    expect(getBulkJournalRowError(makeRow({ description: '' }))).toBeUndefined();
  });

  it('keeps rate errors ahead of validation errors', () => {
    expect(
      getBulkJournalRowError(
        makeRow({
          description: '',
          validationError: 'Saved validation error',
          rateError: 'Rate unavailable',
        }),
      ),
    ).toBe('Rate unavailable');
  });
});
