import { AccountType } from '@/src/types/enums';
import { AccountId } from '@/src/types/ids';
import { DisplayCounterAccount, EnrichedJournal } from '@/src/types/domainReadModels';

/** Counterparty accounts on a journal row, excluding the ledger line account. */
export function counterAccountsFromJournalPeers(
  accounts: EnrichedJournal['accounts'],
  currentAccountId: AccountId,
): DisplayCounterAccount[] {
  const seen = new Set<AccountId>();
  const counterAccounts: DisplayCounterAccount[] = [];

  for (const peer of accounts) {
    if (peer.id === currentAccountId || seen.has(peer.id)) continue;
    seen.add(peer.id);
    counterAccounts.push({
      id: peer.id,
      name: peer.name,
      accountType: peer.accountType as AccountType,
      icon: peer.icon,
    });
  }

  return counterAccounts;
}
