import Account from '@/src/data/models/Account';
import {
  TransactionType,
  AccountId,
  EMPTY_ACCOUNT_ID,
  TabType,
  AccountType,
} from '@/src/types/domain';

import { getAllowedAccountTypes, isBalanceSheetAccount } from '@/src/utils/accountCategory';

/** Postable accounts only — excludes parents that have child accounts. */
export function filterToLeafAccounts(accounts: Account[]): Account[] {
  const parentIds = new Set(accounts.map(a => a.parentAccountId).filter(Boolean) as string[]);
  return accounts.filter(a => !parentIds.has(a.id));
}

/** Accounts eligible for one guided leg, aligned with full account browse policy. */
export function filterGuidedLegAccounts(
  leafAccounts: Account[],
  tab: TabType,
  side: TransactionType,
): Account[] {
  const allowedTypes = getAllowedAccountTypes(tab, side);
  return leafAccounts.filter(a => allowedTypes.includes(a.accountType));
}

export function isCategoryAccountType(accountType: AccountType): boolean {
  return accountType === AccountType.EXPENSE || accountType === AccountType.INCOME;
}

export function isAccountAllowedOnGuidedLeg(
  account: Account,
  tab: TabType,
  side: TransactionType,
): boolean {
  return getAllowedAccountTypes(tab, side).includes(account.accountType);
}

/**
 * When changing guided tab type: drop categories; keep balance-sheet picks on the same leg when
 * still valid; otherwise try to place a remembered balance-sheet account on an empty leg.
 */
export function resolveGuidedAccountsAfterTabChange(
  newType: TabType,
  accountsById: Map<string, Account>,
  sourceAccountId: AccountId,
  destinationAccountId: AccountId,
): { sourceAccountId: AccountId; destinationAccountId: AccountId } {
  const balanceSheetPool: AccountId[] = [];

  const considerLine = (accountId: AccountId) => {
    if (!accountId) return;
    const account = accountsById.get(accountId);
    if (!account) return;
    if (isCategoryAccountType(account.accountType)) return;
    if (isBalanceSheetAccount(account.accountType)) {
      balanceSheetPool.push(accountId);
    }
  };

  considerLine(sourceAccountId);
  considerLine(destinationAccountId);

  const uniquePool = [...new Set(balanceSheetPool)];

  let nextSource = sourceAccountId;
  let nextDest = destinationAccountId;

  const sourceAccount = accountsById.get(sourceAccountId);
  if (
    !sourceAccount ||
    isCategoryAccountType(sourceAccount.accountType) ||
    !isAccountAllowedOnGuidedLeg(sourceAccount, newType, TransactionType.CREDIT)
  ) {
    nextSource = EMPTY_ACCOUNT_ID;
  }

  const destAccount = accountsById.get(destinationAccountId);
  if (
    !destAccount ||
    isCategoryAccountType(destAccount.accountType) ||
    !isAccountAllowedOnGuidedLeg(destAccount, newType, TransactionType.DEBIT)
  ) {
    nextDest = EMPTY_ACCOUNT_ID;
  }

  const tryFill = (side: TransactionType, current: AccountId): AccountId => {
    if (current) return current;
    for (const id of uniquePool) {
      const account = accountsById.get(id);
      if (!account) continue;
      if (!isAccountAllowedOnGuidedLeg(account, newType, side)) continue;
      if (side === TransactionType.CREDIT && id === nextDest) continue;
      if (side === TransactionType.DEBIT && id === nextSource) continue;
      return id;
    }
    return current;
  };

  nextSource = tryFill(TransactionType.CREDIT, nextSource);
  nextDest = tryFill(TransactionType.DEBIT, nextDest);

  return { sourceAccountId: nextSource, destinationAccountId: nextDest };
}
