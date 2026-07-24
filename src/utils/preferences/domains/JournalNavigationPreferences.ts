import { AccountId } from '@/src/types/domain';
import type { PreferencesStore } from '../PreferencesStore';

/** Last-used journal account ids for simple entry defaults. */
export class JournalNavigationPreferences {
  constructor(private readonly store: PreferencesStore) {}

  get lastUsedSourceAccountId(): AccountId | undefined {
    return this.store.lastUsedSourceAccountId;
  }

  setLastUsedSourceAccountId(accountId: AccountId | undefined): void {
    this.store.setLastUsedSourceAccountId(accountId);
  }

  get lastUsedDestinationAccountId(): AccountId | undefined {
    return this.store.lastUsedDestinationAccountId;
  }

  setLastUsedDestinationAccountId(accountId: AccountId | undefined): void {
    this.store.setLastUsedDestinationAccountId(accountId);
  }
}
