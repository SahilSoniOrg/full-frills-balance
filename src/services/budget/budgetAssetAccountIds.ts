import type { AccountId } from '@/src/types/ids';

/** Budgets persist funding accounts as a comma-separated column. */
export function parseBudgetAssetAccountIds(raw: string | null | undefined): AccountId[] {
  return (raw ?? '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean) as AccountId[];
}
