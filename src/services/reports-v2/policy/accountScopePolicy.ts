import { AccountSubtype, AccountType } from '@/src/types/enums';
import type { AccountId } from '@/src/types/ids';

/** Assets treated as liquid for cash-flow reporting in V2's initial policy. */
export const CASH_EQUIVALENT_ACCOUNT_SUBTYPES: readonly AccountSubtype[] = [
  AccountSubtype.CASH,
  AccountSubtype.WALLET,
  AccountSubtype.BANK_CHECKING,
  AccountSubtype.BANK_SAVINGS,
  AccountSubtype.MONEY_MARKET,
];

export interface AccountScopeDescriptor {
  readonly id: AccountId;
  readonly accountType: AccountType;
  readonly accountSubtype?: AccountSubtype;
  /** Root-to-leaf path. At minimum this should contain `id`. */
  readonly accountPath: readonly AccountId[];
  readonly isLeafAccount: boolean;
  readonly isArchived?: boolean;
  readonly isDeleted?: boolean;
}

export interface AccountScopeOptions {
  readonly accountIds?: readonly AccountId[];
  readonly accountTypes?: readonly AccountType[];
  readonly includeArchivedAccounts?: boolean;
  readonly includeDescendants?: boolean;
  readonly leafAccountsOnly?: boolean;
}

export interface AccountScopePolicy {
  readonly accountIds?: readonly AccountId[];
  readonly accountTypes?: readonly AccountType[];
  readonly includeArchivedAccounts: boolean;
  readonly includeDescendants: boolean;
  readonly leafAccountsOnly: boolean;
  readonly cashEquivalentSubtypes: readonly AccountSubtype[];
  readonly matches: (account: AccountScopeDescriptor) => boolean;
  readonly isCashEquivalent: (account: AccountScopeDescriptor) => boolean;
}

function matchesSelectedAccount(
  account: AccountScopeDescriptor,
  selectedIds: readonly AccountId[] | undefined,
  includeDescendants: boolean,
): boolean {
  if (selectedIds === undefined) return true;
  if (selectedIds.length === 0) return false;
  return includeDescendants
    ? account.accountPath.some(accountId => selectedIds.includes(accountId))
    : selectedIds.includes(account.id);
}

export function createAccountScopePolicy(options: AccountScopeOptions = {}): AccountScopePolicy {
  const accountIds = options.accountIds;
  const accountTypes = options.accountTypes;
  const includeArchivedAccounts = options.includeArchivedAccounts ?? false;
  const includeDescendants = options.includeDescendants ?? true;
  const leafAccountsOnly = options.leafAccountsOnly ?? true;
  const cashEquivalentSubtypes: readonly AccountSubtype[] = CASH_EQUIVALENT_ACCOUNT_SUBTYPES;

  const matches = (account: AccountScopeDescriptor): boolean => {
    if (account.isDeleted) return false;
    if (!includeArchivedAccounts && account.isArchived) return false;
    if (leafAccountsOnly && !account.isLeafAccount) return false;
    if (!matchesSelectedAccount(account, accountIds, includeDescendants)) return false;
    if (accountTypes !== undefined && !accountTypes.includes(account.accountType)) return false;
    return true;
  };

  return {
    accountIds,
    accountTypes,
    includeArchivedAccounts,
    includeDescendants,
    leafAccountsOnly,
    cashEquivalentSubtypes,
    matches,
    isCashEquivalent: account =>
      account.accountType === AccountType.ASSET &&
      account.accountSubtype !== undefined &&
      cashEquivalentSubtypes.includes(account.accountSubtype),
  };
}

export const DEFAULT_ACCOUNT_SCOPE_POLICY = createAccountScopePolicy();
