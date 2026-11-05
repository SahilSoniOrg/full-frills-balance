import { AccountType } from '@/src/types/enums';
import type { AccountId } from '@/src/types/ids';

interface MatcherAccount {
  id: AccountId;
  accountType: AccountType;
  parentAccountId?: AccountId;
  deletedAt?: Date | number;
}

/** Archived financial leaves remain eligible; deleted Accounts and parents do not. */
export function getEligibleMatcherAccountIds(accounts: readonly MatcherAccount[]): Set<AccountId> {
  const active = accounts.filter(account => !account.deletedAt);
  const parentIds = new Set(
    active.flatMap(account => (account.parentAccountId ? [account.parentAccountId] : [])),
  );
  return new Set(
    active
      .filter(
        account =>
          !parentIds.has(account.id) &&
          (account.accountType === AccountType.ASSET ||
            account.accountType === AccountType.LIABILITY),
      )
      .map(account => account.id),
  );
}

/** Columns that can change matcher ownership. `archivedAt` is not one of them. */
export const MATCHER_ELIGIBILITY_FIELDS = ['accountType', 'parentAccountId', 'deletedAt'] as const;

export function matcherEligibilityChanged(
  change: Partial<Record<(typeof MATCHER_ELIGIBILITY_FIELDS)[number], unknown>>,
): boolean {
  return MATCHER_ELIGIBILITY_FIELDS.some(field => change[field] !== undefined);
}
