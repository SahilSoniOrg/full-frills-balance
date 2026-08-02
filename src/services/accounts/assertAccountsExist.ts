import Account from '@/src/data/models/Account';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { AccountId, WorkplaceId } from '@/src/types/domain';

/**
 * Fail-hard guard: every non-empty id must resolve to a live account in the workplace.
 * Soft-deleted accounts do not count (findAllByIds filters deleted_at).
 * Returns the resolved accounts so callers can avoid a second fetch.
 */
export async function assertAccountsExistInWorkplace(
  workplaceId: WorkplaceId,
  accountIds: (AccountId | string | null | undefined)[],
  context = 'Operation',
): Promise<Account[]> {
  const unique = [
    ...new Set(accountIds.filter((id): id is string => typeof id === 'string' && id.length > 0)),
  ];
  if (unique.length === 0) return [];

  const accounts = await accountRepository.findAllByIds(workplaceId, unique as AccountId[]);
  const found = new Set(accounts.map(account => account.id as string));
  const missing = unique.filter(id => !found.has(id));
  if (missing.length > 0) {
    throw new Error(`${context} references missing or deleted account(s): ${missing.join(', ')}`);
  }
  return accounts;
}
