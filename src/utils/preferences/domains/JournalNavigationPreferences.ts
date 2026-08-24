import { AccountId } from '@/src/types/ids';
import type { PreferencesStore } from '../PreferencesStore';

/** Last-used journal account ids for simple entry defaults. */
export class JournalNavigationPreferences {
  constructor(private readonly store: PreferencesStore) {}

  get lastUsedSourceAccountId(): AccountId | undefined {
    return this.store.getSnapshot().lastUsedSourceAccountId;
  }

  setLastUsedSourceAccountId(accountId: AccountId | undefined): void {
    this.store.update({ lastUsedSourceAccountId: accountId });
  }

  get lastUsedDestinationAccountId(): AccountId | undefined {
    return this.store.getSnapshot().lastUsedDestinationAccountId;
  }

  setLastUsedDestinationAccountId(accountId: AccountId | undefined): void {
    this.store.update({ lastUsedDestinationAccountId: accountId });
  }
}
