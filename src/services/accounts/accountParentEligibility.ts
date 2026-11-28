import type Account from '@/src/data/models/Account';
import type { AccountId, WorkplaceId } from '@/src/types/ids';
import { personQueryRepository } from '@/src/data/repositories/people';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { assertParentHasNoTransactions } from '@/src/services/accounts/accountRules';

/** A parent must be an ordinary container: no People ownership and no direct ledger legs. */
export async function assertEligibleAccountParents(
  workplaceId: WorkplaceId,
  accounts: readonly Account[],
  parentIds: readonly (AccountId | null | undefined)[],
): Promise<void> {
  const ids = [...new Set(parentIds.filter((id): id is AccountId => Boolean(id)))];
  if (!ids.length) return;
  const linked = await personQueryRepository.listPersonAccountsForAccounts(workplaceId, ids);
  const peopleOwned = new Set(linked.map(link => link.accountId));
  const byId = new Map(accounts.map(account => [account.id, account] as const));
  for (const id of ids) {
    const parent = byId.get(id);
    if (!parent) throw new Error('Parent account references missing or deleted account(s)');
    if (peopleOwned.has(id)) throw new Error('A People account cannot have child accounts');
  }
  const withTransactions = await Promise.all(
    ids.map(async id =>
      (await transactionQueryRepository.hasTransactions(workplaceId, id)) ? id : undefined,
    ),
  );
  for (const id of withTransactions) {
    if (id) {
      const parent = byId.get(id)!;
      assertParentHasNoTransactions(parent.name);
    }
  }
}
