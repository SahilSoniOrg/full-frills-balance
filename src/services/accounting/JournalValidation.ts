/**
 * Non-sign journal scaffolding helpers (distinct accounts, simple 2-line construction).
 * Journal balance logic lives in `evaluateJournalBalance`; this module owns
 * distinct-account validation only.
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
