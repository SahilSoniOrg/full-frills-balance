import {
  resolveJournalEntrySelectableAccounts,
  resolveJournalEntrySelectedAccountId,
} from '../journalEntryAccountPickerPolicy';
import { SPLIT_SOURCE_LINE_ID } from '@/src/services/journal/splitJournalHelpers';
import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/domain';

describe('journalEntryAccountPickerPolicy', () => {
  const accounts = [
    { id: 'a1' as AccountId, accountType: 'asset', name: 'Cash' },
    { id: 'a2' as AccountId, accountType: 'expense', name: 'Food' },
  ];

  it('resolveJournalEntrySelectedAccountId reads split source and row ids', () => {
    expect(
      resolveJournalEntrySelectedAccountId({
        activeMode: 'split',
        activeLineId: SPLIT_SOURCE_LINE_ID,
        lines: [],
        splitSourceAccountId: 'a1' as AccountId,
        splitRows: [{ id: 'row-1', accountId: 'a2' as AccountId }],
      }),
    ).toBe('a1');

    expect(
      resolveJournalEntrySelectedAccountId({
        activeMode: 'split',
        activeLineId: 'row-1',
        lines: [],
        splitSourceAccountId: EMPTY_ACCOUNT_ID,
        splitRows: [{ id: 'row-1', accountId: 'a2' as AccountId }],
      }),
    ).toBe('a2');
  });

  it('resolveJournalEntrySelectableAccounts returns all accounts when no active line', () => {
    expect(
      resolveJournalEntrySelectableAccounts({
        accounts,
        activeLineId: null,
        activeMode: 'guided',
        transactionType: 'expense',
        lines: [],
      }),
    ).toHaveLength(2);
  });
});
