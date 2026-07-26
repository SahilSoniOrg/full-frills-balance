import { AccountPersistenceInput, accountRepository } from '@/src/data/repositories/AccountRepository';
import { database } from '@/src/data/database/Database';
import { AccountAuditState, AccountId, WorkplaceId } from '@/src/types/domain';

/**
 * Restores account fields from an audit `before` snapshot during revert.
 * Does not write audit logs or re-run hierarchy form policy.
 */
export async function revertAccountFromAuditState(
  workplaceId: WorkplaceId,
  accountId: AccountId,
  before: AccountAuditState,
): Promise<void> {
  const account = await accountRepository.findWithDeleted(workplaceId, accountId);
  if (!account) {
    throw new Error('Account not found');
  }

  const payload: Partial<AccountPersistenceInput> = {};
  if (before.name !== undefined) payload.name = before.name;
  if (before.accountType !== undefined) payload.accountType = before.accountType;
  if (before.accountSubtype !== undefined) payload.accountSubtype = before.accountSubtype;
  if (before.currencyCode !== undefined) payload.currencyCode = before.currencyCode;
  if (before.description !== undefined) payload.description = before.description;
  if (before.icon !== undefined) payload.icon = before.icon;
  if (before.parentAccountId !== undefined) {
    payload.parentAccountId = before.parentAccountId;
  }

  if (Object.keys(payload).length > 0) {
    await accountRepository.update(account, payload, workplaceId);
  }

  if (before.deletedAt !== undefined) {
    await database.write(async () => {
      await account.update(record => {
        record.deletedAt = before.deletedAt ?? undefined;
        record.updatedAt = new Date();
      });
    });
  }
}
