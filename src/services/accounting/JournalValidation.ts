/**
 * Non-sign journal scaffolding helpers (distinct accounts, simple 2-line construction).
 * Balance/sign logic lives in BalanceEffects (`checkJournal`, `effect`).
 */
export function validateDistinctAccounts(accountIds: string[]): {
  isValid: boolean;
  uniqueCount: number;
} {
  const uniqueAccounts = new Set(accountIds.filter(id => !!id));
  return {
    isValid: uniqueAccounts.size >= 2,
    uniqueCount: uniqueAccounts.size,
  };
}
