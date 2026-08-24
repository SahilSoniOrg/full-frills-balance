import { accountQueryRepository, accountWriteRepository } from '@/src/data/repositories/account';
import type { AccountPersistenceInput } from '@/src/data/repositories/account/types';
import { normalizeAccountAuditState } from '@/src/services/accounts/accountAuditState';
import { AccountAuditState } from '@/src/types/audit';
import { AccountId, WorkplaceId } from '@/src/types/ids';

/**
 * Restores account fields from an audit `before` snapshot during revert.
 * Does not write audit logs or re-run hierarchy form policy.
 */
export async function revertAccountFromAuditState(
  workplaceId: WorkplaceId,
  accountId: AccountId,
  beforeRaw: AccountAuditState | Record<string, unknown>,
): Promise<void> {
  const before = normalizeAccountAuditState(beforeRaw);
  const account = await accountQueryRepository.findWithDeleted(workplaceId, accountId);
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
  if (before.deletedAt !== undefined) {
    payload.deletedAt = before.deletedAt ?? null;
  }
  if ('archivedAt' in before) {
    payload.archivedAt = before.archivedAt ?? null;
  }

  if (Object.keys(payload).length === 0) return;

  await accountWriteRepository.update(account, payload, workplaceId);
}
