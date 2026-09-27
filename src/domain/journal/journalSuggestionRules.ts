import type {
  JournalSuggestionAccount,
  JournalSuggestionPage,
} from '@/src/types/journalSuggestions';
import type { TabType } from '@/src/types/domainJournal';
import { AccountType } from '@/src/types/enums';

export type JournalSuggestionRoute = {
  sources: JournalSuggestionAccount[];
  destinations: JournalSuggestionAccount[];
};

export function isSuggestionPageCompatible(
  route: JournalSuggestionRoute,
  page: JournalSuggestionPage,
): boolean {
  const { sources, destinations } = route;
  if (page === 'split') return sources.length === 1 && destinations.length >= 1;
  if (page === 'advanced') return sources.length >= 1 && destinations.length >= 1;
  return sources.length === 1 && destinations.length === 1;
}

export function isSuggestionTransactionCompatible(
  route: JournalSuggestionRoute,
  transactionType?: TabType,
): boolean {
  if (!transactionType || transactionType === 'transfer') return true;
  const balanceTypes: AccountType[] = [AccountType.ASSET, AccountType.LIABILITY];
  if (transactionType === 'expense') {
    return (
      route.destinations.every(account => account.type === AccountType.EXPENSE) &&
      route.sources.every(account => balanceTypes.includes(account.type))
    );
  }
  return (
    route.sources.every(account => account.type === AccountType.INCOME) &&
    route.destinations.every(account => balanceTypes.includes(account.type))
  );
}
