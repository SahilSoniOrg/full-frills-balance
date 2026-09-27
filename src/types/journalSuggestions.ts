import type { AccountId } from '@/src/types/ids';
import type { AccountType } from '@/src/types/enums';

export type JournalSuggestionPage = 'simple' | 'split' | 'advanced';

export type JournalSuggestionAccount = {
  id: AccountId;
  name: string;
  type: AccountType;
};

/** An exact historical account route, deduplicated only against identical routes. */
export type JournalSuggestion = {
  key: string;
  description: string;
  route: {
    sources: JournalSuggestionAccount[];
    destinations: JournalSuggestionAccount[];
  };
  history: {
    count: number;
    lastUsedAt: number;
  };
};
