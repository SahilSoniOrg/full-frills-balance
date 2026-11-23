import { database } from '@/src/data/database/Database';
import Account from '@/src/data/models/Account';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { accountQueryRepository } from './AccountQueryRepository';

/**
 * Touches the requested live accounts in one write so observers refresh.
 * Account lookup is workplace-scoped and ignores deleted rows.
 */
export async function refreshAccounts(
  workplaceId: WorkplaceId,
  accountIds: AccountId[],
): Promise<void> {
  await database.write(async () => {
    const accounts = await accountQueryRepository.findAllByIds(workplaceId, accountIds);
    if (accounts.length === 0) return;
    const now = new Date();
    await database.batch(
      accounts.map(account =>
        account.prepareUpdate(record => {
          record.updatedAt = now;
        }),
      ),
    );
  });
}

/**
 * Prepares a reactive refresh for an account owned by the workplace.
 * The caller owns the write and is responsible for batching the prepared operation.
 */
export function prepareAccountRefresh(workplaceId: WorkplaceId, account: Account): Account {
  if (account.workplaceId !== workplaceId) {
    throw new Error('Account does not belong to the specified workplace');
  }

  return account.prepareUpdate(record => {
    record.updatedAt = new Date();
  });
}
