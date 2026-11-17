import type Account from '@/src/data/models/Account';
import type { AccountDisplay } from '@/src/types/plainDtos';
import type { AccountId } from '@/src/types/ids';

/** Presentation fields for compact account labels on capture suggestion rows. */
export function toCaptureAccountDisplay(account: Account): AccountDisplay {
  return {
    id: account.id,
    name: account.name,
    accountType: account.accountType,
    color: account.color,
    icon: account.icon,
    archivedAt: account.archivedAt,
  };
}

export function captureAccountDisplayForId(
  accountsById: ReadonlyMap<AccountId, Account>,
  accountId?: AccountId,
): AccountDisplay | undefined {
  const account = accountId ? accountsById.get(accountId) : undefined;
  return account ? toCaptureAccountDisplay(account) : undefined;
}
