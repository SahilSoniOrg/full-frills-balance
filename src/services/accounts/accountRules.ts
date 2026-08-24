import { getDefaultSubtypeForType } from '@/src/types/accountSubtype';
import { TransactionType, AccountSubtype, AccountType } from '@/src/types/enums';
import { AccountId, WorkplaceId } from '@/src/types/ids';

import { isDebitNormalAccountType } from '@/src/utils/accountCategory';
import { getEpsilon } from '@/src/utils/money';

export type AccountHierarchyShape = {
  accountType: AccountType;
  name: string;
};

export type AccountMergeShape = {
  id: string;
  name: string;
  workplaceId: WorkplaceId;
  accountType: AccountType;
  accountSubtype?: AccountSubtype;
  currencyCode: string;
};

export function resolveAccountSubtype(
  accountType: AccountType,
  accountSubtype?: AccountSubtype,
): AccountSubtype {
  return accountSubtype ?? getDefaultSubtypeForType(accountType);
}

export function assertParentMatchesChildType(
  childType: AccountType,
  parent: AccountHierarchyShape,
): void {
  if (parent.accountType !== childType) {
    throw new Error('Parent account must be of the same type');
  }
}

export function assertNotSelfParent(accountId: AccountId, parentAccountId: AccountId): void {
  if (parentAccountId === accountId) {
    throw new Error('An account cannot be its own parent');
  }
}

export function assertParentHasNoTransactions(parentName: string): void {
  throw new Error(`Account "${parentName}" has transactions and cannot be used as a parent.`);
}

export function shouldPostInitialBalance(
  initialBalance: number | undefined,
  precision: number,
): boolean {
  return !!initialBalance && Math.abs(initialBalance) > getEpsilon(precision);
}

export function journalLegTypesForSignedAmount(
  accountType: AccountType,
  signedAmount: number,
): { accountTxType: TransactionType; balancingTxType: TransactionType } {
  const isIncreaseDR = isDebitNormalAccountType(accountType);
  const accountTxType =
    signedAmount > 0
      ? isIncreaseDR
        ? TransactionType.DEBIT
        : TransactionType.CREDIT
      : isIncreaseDR
        ? TransactionType.CREDIT
        : TransactionType.DEBIT;

  const balancingTxType =
    accountTxType === TransactionType.DEBIT ? TransactionType.CREDIT : TransactionType.DEBIT;

  return { accountTxType, balancingTxType };
}

export function isBalanceAdjustmentNeeded(discrepancy: number, precision: number): boolean {
  return Math.abs(discrepancy) >= getEpsilon(precision);
}

export function dedupeMergeSourceAccountIds(
  targetAccountId: AccountId,
  sourceAccountIds: AccountId[],
): AccountId[] {
  return [...new Set(sourceAccountIds)].filter(id => id !== targetAccountId);
}

export function assertMergeAccountsCompatible(
  workplaceId: WorkplaceId,
  targetAccountId: AccountId,
  target: AccountMergeShape | null | undefined,
  sources: AccountMergeShape[],
  requestedSourceCount: number,
): void {
  if (!target) throw new Error('Target account not found or deleted');
  if (target.workplaceId !== workplaceId) throw new Error('Target account workplace mismatch');

  if (sources.length !== requestedSourceCount) {
    throw new Error('One or more source accounts not found or deleted');
  }

  for (const source of sources) {
    if (source.id === targetAccountId) {
      throw new Error('Cannot merge an account into itself');
    }
    if (source.workplaceId !== workplaceId) {
      throw new Error(`Source account "${source.name}" workplace mismatch`);
    }
    if (source.accountType !== target.accountType) {
      throw new Error(
        `Cannot merge accounts of different categories: ${source.name} and ${target.name}`,
      );
    }
    if (source.accountSubtype !== target.accountSubtype) {
      throw new Error(
        `Cannot merge accounts of different sub-categories: ${source.name} and ${target.name}`,
      );
    }
    if (source.currencyCode !== target.currencyCode) {
      throw new Error(
        `Cannot merge accounts with different currencies: ${source.name} (${source.currencyCode}) and ${target.name} (${target.currencyCode})`,
      );
    }
  }
}
