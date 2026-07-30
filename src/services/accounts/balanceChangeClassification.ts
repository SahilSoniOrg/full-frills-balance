import { AccountType } from '@/src/data/models/Account';
import { AccountId } from '@/src/types/domain';

export type BalanceChangeCounterparty =
  { kind: 'adjustment' } | { kind: 'account'; accountId: AccountId };

export type BalanceChangeAccountShape = {
  id: string;
  accountType: AccountType;
  currencyCode: string;
  parentAccountId?: string | null;
};

/** Asset / Liability / Equity balance edits need a classify step before save. */
export function needsBalanceChangeClassification(accountType: AccountType): boolean {
  return (
    accountType === AccountType.ASSET ||
    accountType === AccountType.LIABILITY ||
    accountType === AccountType.EQUITY
  );
}

/**
 * Suggested counterparty account types for a balance delta (target − current).
 * Equity always suggests Asset/Liability regardless of direction.
 */
export function getSuggestedCounterpartyTypes(
  accountType: AccountType,
  discrepancy: number,
): AccountType[] {
  if (discrepancy === 0) return [];

  const up = discrepancy > 0;

  switch (accountType) {
    case AccountType.ASSET:
      return up ? [AccountType.INCOME] : [AccountType.EXPENSE];
    case AccountType.LIABILITY:
      return up ? [AccountType.EXPENSE] : [AccountType.ASSET];
    case AccountType.EQUITY:
      return [AccountType.ASSET, AccountType.LIABILITY];
    default:
      return [];
  }
}

export function isBalanceChangedBeyondEpsilon(
  targetBalance: number,
  currentBalance: number,
  epsilon = 0.001,
): boolean {
  if (Number.isNaN(targetBalance)) return false;
  return Math.abs(targetBalance - currentBalance) > epsilon;
}

/**
 * When a non-category account balance changed, a counterparty (or Adjustment)
 * must be supplied. Returns true if a journal should be posted.
 */
export function resolveBalanceChangeRequirement(input: {
  canAdjustBalance: boolean;
  targetBalance: number;
  currentBalance: number | undefined;
  balanceChange?: BalanceChangeCounterparty;
}): { shouldAdjust: false } | { shouldAdjust: true; balanceChange: BalanceChangeCounterparty } {
  if (
    !input.canAdjustBalance ||
    input.currentBalance === undefined ||
    !isBalanceChangedBeyondEpsilon(input.targetBalance, input.currentBalance)
  ) {
    return { shouldAdjust: false };
  }

  if (!input.balanceChange) {
    throw new Error('Balance change requires classifying the update before save.');
  }

  return { shouldAdjust: true, balanceChange: input.balanceChange };
}

function parentAccountIds(accounts: BalanceChangeAccountShape[]): Set<string> {
  return new Set(accounts.map(a => a.parentAccountId).filter(Boolean) as string[]);
}

/** Leaf accounts, same currency, excluding the edited account. */
export function filterEligibleCounterparties(
  accounts: BalanceChangeAccountShape[],
  input: { excludeAccountId: string; currencyCode: string },
): BalanceChangeAccountShape[] {
  const parents = parentAccountIds(accounts);
  return accounts.filter(
    a =>
      a.id !== input.excludeAccountId &&
      a.currencyCode === input.currencyCode &&
      !parents.has(a.id),
  );
}

export function filterSuggestedCounterparties(
  accounts: BalanceChangeAccountShape[],
  input: {
    accountType: AccountType;
    discrepancy: number;
    excludeAccountId: string;
    currencyCode: string;
  },
): BalanceChangeAccountShape[] {
  const suggestedTypes = new Set(
    getSuggestedCounterpartyTypes(input.accountType, input.discrepancy),
  );
  if (suggestedTypes.size === 0) return [];

  return filterEligibleCounterparties(accounts, input).filter(a =>
    suggestedTypes.has(a.accountType),
  );
}
