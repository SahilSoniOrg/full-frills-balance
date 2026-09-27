import {
  filterJournalSuggestions,
  resolveSuggestionAccount,
} from '../components/JournalSuggestionsDropdown';
import { AccountType } from '@/src/types/enums';
import type { AccountFields } from '@/src/types/plainDtos';
import type { JournalSuggestion } from '@/src/types/journalSuggestions';
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
  destinationId: AccountId = 'food' as AccountId,
): JournalSuggestion {
  return {
    key: `${description}:${destinationId}`,
    description,
    route: {
      sources: [{ id: 'cash' as AccountId, name: 'Cash', type: AccountType.ASSET }],
      destinations: [
        {
          id: destinationId,
          name: destinationId === 'food' ? 'Food' : 'Cash',
          type: destinationId === 'food' ? AccountType.EXPENSE : AccountType.ASSET,
        },
      ],
    },
    history: { count: 1, lastUsedAt: 1 },
  };
}

describe('JournalSuggestionsDropdown helpers', () => {
  it('filters routes to accounts compatible with the active tab', () => {
    const result = filterJournalSuggestions(
      [suggestion('Lunch', 'food' as AccountId), suggestion('Lunch', 'cash' as AccountId)],
      accountsMap,
      'expense',
    );

    expect(result).toHaveLength(1);
    expect(result[0].route.destinations[0].id).toBe('food');
  });

  it('does not resolve an incompatible destination account', () => {
    const item = suggestion('Lunch', 'cash' as AccountId);

    expect(resolveSuggestionAccount(item, accountsMap, 'expense')).toBeUndefined();
    expect(filterJournalSuggestions([item], accountsMap, 'expense')).toEqual([]);
  });
});
