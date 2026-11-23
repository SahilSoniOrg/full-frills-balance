import type { AccountId } from '@/src/types/ids';

function uniqueTrimmedIds(ids: readonly string[]): string[] {
  return [...new Set(ids.map(id => id.trim()).filter(id => id.length > 0))];
}

/**
 * Read the persisted funding ID collection.
 * Accepts JSON arrays and legacy CSV. Empty persist form is '' (also treat '[]' as empty).
 */
export function parseFundingAccountIds(
  raw: string | readonly string[] | null | undefined,
): string[] {
  if (raw == null) return [];
  if (typeof raw !== 'string') {
    return uniqueTrimmedIds(raw.filter((id): id is string => typeof id === 'string'));
  }
  const text = raw.trim();
  if (text.length === 0 || text === '[]') return [];

  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return uniqueTrimmedIds(parsed.filter((id): id is string => typeof id === 'string'));
    }
    // Valid JSON that is not a collection — do not CSV-split the JSON text.
    return [];
  } catch {
    /* Legacy CSV */
  }

  return uniqueTrimmedIds(text.split(','));
}

/** Serialize funding IDs; empty collection persists as ''. */
export function formatFundingAccountIds(ids: readonly string[]): string {
  const next = uniqueTrimmedIds(ids);
  return next.length === 0 ? '' : JSON.stringify(next);
}

/** Persist funding IDs as JSON; empty clears the column to ''. */
export function persistFundingAccountIds(ids: readonly string[]): string {
  return formatFundingAccountIds(ids);
}

/** Budgets persist funding accounts as a JSON collection (legacy CSV still readable). */
export function parseBudgetAssetAccountIds(raw: string | null | undefined): AccountId[] {
  return parseFundingAccountIds(raw) as AccountId[];
}

/** True when the persisted funding field names at least one account. */
export function hasFundingAccountIds(raw: string | readonly string[] | null | undefined): boolean {
  return parseFundingAccountIds(raw).length > 0;
}
