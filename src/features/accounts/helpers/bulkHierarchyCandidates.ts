import { createAccountTreeSnapshot } from '@/src/domain/accounts/accountTree';
import type { IconName } from '@/src/types/domainIcons';
import { AccountId } from '@/src/types/ids';
import { AccountType } from '@/src/types/enums';

export interface HierarchyCandidateAccount {
  id: AccountId;
  name: string;
  icon?: IconName;
  accountType: AccountType;
}

type HierarchyAccount = {
  id: AccountId;
  name: string;
  icon?: IconName;
  accountType: AccountType;
  parentAccountId?: AccountId | null;
};

export function getBulkHierarchyCandidates(
  accounts: HierarchyAccount[],
  selectedIds: ReadonlySet<AccountId>,
): HierarchyCandidateAccount[] {
  if (selectedIds.size === 0) return [];
  const selected = accounts.filter(account => selectedIds.has(account.id));
  const selectedTypes = new Set(selected.map(account => account.accountType));
  if (selectedTypes.size !== 1) return [];
  const targetType = selected[0].accountType;

  const tree = createAccountTreeSnapshot(accounts);
  const descendants = new Set([...selectedIds].flatMap(id => [...tree.getDescendants(id)]));

  return accounts
    .filter(
      account =>
        !selectedIds.has(account.id) &&
        !descendants.has(account.id) &&
        account.accountType === targetType,
    )
    .map(account => ({
      id: account.id,
      name: account.name,
      icon: account.icon,
      accountType: account.accountType,
    }));
}
