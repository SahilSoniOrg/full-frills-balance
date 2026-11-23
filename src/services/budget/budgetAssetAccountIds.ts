import type { AccountId } from '@/src/types/ids';

/** Read the persisted funding ID collection; accept legacy CSV during migration. */
export function parseFundingAccountIds(
  raw: string | readonly string[] | null | undefined,
): string[] {
  if (raw == null || raw.length === 0) return [];
  if (Array.isArray(raw)) {
    return [...new Set(raw.filter(id => typeof id === 'string' && id.trim()).map(id => id.trim()))];
  }
  try {
    const parsed: unknown = JSON.parse(raw as string);
    if (Array.isArray(parsed)) {
      return [
        ...new Set(
          parsed
            .filter((id): id is string => typeof id === 'string' && id.trim())
            .map(id => id.trim()),
        ),
      ];
    }
  } catch {
    /* Legacy CSV */
  }
  return [
    ...new Set(
      (raw as string)
        .split(',')
        .map(id => id.trim())
        .filter(Boolean),
    ),
  ];
}

/** Serialize funding IDs as an unambiguous JSON collection. */
export function formatFundingAccountIds(ids: readonly string[]): string {
  return JSON.stringify([...new Set(ids.map(id => id.trim()).filter(Boolean))]);
}

/** Persist funding IDs as JSON; empty clears the column to ''. */
export function persistFundingAccountIds(ids: readonly string[]): string {
  return ids.length === 0 ? '' : formatFundingAccountIds(ids);
}

/** Budgets persist funding accounts as a JSON collection (legacy CSV still readable). */
export function parseBudgetAssetAccountIds(raw: string | null | undefined): AccountId[] {
  return parseFundingAccountIds(raw) as AccountId[];
}
