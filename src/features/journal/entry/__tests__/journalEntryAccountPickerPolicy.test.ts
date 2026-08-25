import {
  applyJournalLineAccountSelection,
  resolveJournalEntrySelectableAccounts,
  resolveJournalEntrySelectedAccountId,
} from '../journalEntryAccountPickerPolicy';
import { SPLIT_SOURCE_LINE_ID } from '@/src/services/journal/splitJournalHelpers';
import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import { type AccountFields } from '@/src/types/plainDtos';

describe('journalEntryAccountPickerPolicy', () => {
  const accounts = [
    { id: 'a1' as AccountId, accountType: 'asset', name: 'Cash' },
    { id: 'a2' as AccountId, accountType: 'expense', name: 'Food' },
  ] as unknown as AccountFields[];

  it('resolveJournalEntrySelectedAccountId reads split source and row ids', () => {
    expect(
      resolveJournalEntrySelectedAccountId({
        activeMode: 'allocation',
        activeLineId: SPLIT_SOURCE_LINE_ID,
        lines: [],
        splitSourceAccountId: 'a1' as AccountId,
        splitRows: [{ id: 'row-1', accountId: 'a2' as AccountId }],
      }),
    ).toBe('a1');

    expect(
      resolveJournalEntrySelectedAccountId({
        activeMode: 'allocation',
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
        activeMode: 'basic',
        transactionType: 'expense',
        lines: [],
      }),
    ).toHaveLength(2);
  });

  it('applyJournalLineAccountSelection patches the target line', () => {
    const updateLine = jest.fn();
    applyJournalLineAccountSelection({
      lineId: 'line-1',
      accountId: 'a2' as AccountId,
      accounts,
      updateLine,
    });

    expect(updateLine).toHaveBeenCalledWith('line-1', {
      accountId: 'a2',
      accountName: 'Food',
      accountType: 'expense',
      accountCurrency: undefined,
    });
  });
});
