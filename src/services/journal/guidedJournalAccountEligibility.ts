import type { AccountFields } from '@/src/types/plainDtos';
import { TransactionType } from '@/src/types/enums';
import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import { TabType } from '@/src/types/domainJournal';

import {
  getAllowedAccountTypes,
  isBalanceSheetAccount,
  isCategoryAccountType,
} from '@/src/utils/accountCategory';

/** Postable accounts only — excludes parents that have child accounts. */
export function filterToLeafAccounts(accounts: AccountFields[]): AccountFields[] {
  const parentIds = new Set(accounts.map(a => a.parentAccountId).filter(Boolean) as string[]);
  return accounts.filter(a => !parentIds.has(a.id));
}

/** Accounts eligible for one guided leg, aligned with full account browse policy. */
export function filterGuidedLegAccounts(
  leafAccounts: AccountFields[],
  tab: TabType,
  side: TransactionType,
): AccountFields[] {
  const allowedTypes = getAllowedAccountTypes(tab, side);
  return leafAccounts.filter(a => allowedTypes.includes(a.accountType));
}

export function isAccountAllowedOnGuidedLeg(
  account: AccountFields,
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
  accountsById: Map<string, AccountFields>,
  sourceAccountId: AccountId,
  destinationAccountId: AccountId,
): { sourceAccountId: AccountId; destinationAccountId: AccountId } {
  const balanceSheetPool = [...new Set([sourceAccountId, destinationAccountId])].filter(id => {
    const account = accountsById.get(id);
    return id && account && isBalanceSheetAccount(account.accountType);
  });
  const canKeep = (id: AccountId, side: TransactionType) => {
    const account = accountsById.get(id);
    return (
      account &&
      !isCategoryAccountType(account.accountType) &&
      isAccountAllowedOnGuidedLeg(account, newType, side)
    );
  };
  const tryFill = (side: TransactionType, current: AccountId, opposite: AccountId): AccountId =>
    current ||
    balanceSheetPool.find(id => id !== opposite && canKeep(id, side)) ||
    EMPTY_ACCOUNT_ID;

  let nextSource = canKeep(sourceAccountId, TransactionType.CREDIT)
    ? sourceAccountId
    : EMPTY_ACCOUNT_ID;
  let nextDest = canKeep(destinationAccountId, TransactionType.DEBIT)
    ? destinationAccountId
    : EMPTY_ACCOUNT_ID;
  nextSource = tryFill(TransactionType.CREDIT, nextSource, nextDest);
  nextDest = tryFill(TransactionType.DEBIT, nextDest, nextSource);

  return { sourceAccountId: nextSource, destinationAccountId: nextDest };
}
