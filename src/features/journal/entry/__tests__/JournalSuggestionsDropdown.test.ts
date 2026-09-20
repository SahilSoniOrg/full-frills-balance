import {
  filterJournalSuggestions,
  resolveSuggestionAccount,
} from '../components/JournalSuggestionsDropdown';
import { AccountType } from '@/src/types/enums';
import type { AccountFields } from '@/src/types/plainDtos';
import type { JournalAutofillSuggestion } from '@/src/data/repositories/journal/journalEnrichmentTypes';
import type { AccountId } from '@/src/types/ids';

const accounts: AccountFields[] = [
  {
    id: 'cash' as AccountId,
    name: 'Cash',
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
  },
  {
    id: 'food' as AccountId,
    name: 'Food',
    accountType: AccountType.EXPENSE,
    currencyCode: 'USD',
  },
];

const accountsMap = new Map(accounts.map(account => [account.id, account]));

function suggestion(
  description: string,
  targetAccountId?: AccountId,
  targetAccountType?: AccountType,
): JournalAutofillSuggestion {
  return { description, count: 1, targetAccountId, targetAccountType };
}

describe('JournalSuggestionsDropdown helpers', () => {
  it('deduplicates descriptions by normalized text and resolved account', () => {
    const result = filterJournalSuggestions(
      [
        suggestion(' Lunch ', 'food' as AccountId, AccountType.EXPENSE),
        suggestion('lunch', 'food' as AccountId, AccountType.EXPENSE),
        suggestion('Lunch', 'cash' as AccountId, AccountType.ASSET),
      ],
      accountsMap,
      'expense',
    );

    expect(result).toHaveLength(2);
    expect(result.map(item => item.targetAccountId)).toEqual(['food', 'cash']);
  });

  it('keeps an ineligible target suggestion while omitting its account match', () => {
    const item = suggestion('Lunch', 'cash' as AccountId, AccountType.ASSET);

    expect(resolveSuggestionAccount(item, accountsMap, 'expense')).toBeUndefined();
    expect(filterJournalSuggestions([item], accountsMap, 'expense')).toEqual([item]);
  });
});
