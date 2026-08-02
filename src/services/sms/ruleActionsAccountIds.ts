import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/domain';
import { safeParseJSON } from '@/src/utils/serialization';

type RuleActionsShape = {
  disposition?: string;
  sourceAccountId?: string;
  categoryAccountId?: string;
  [key: string]: unknown;
};

export type SmsRuleDisposition = 'auto_post' | 'review' | 'ignore';

/** Auto-post needs both account legs; otherwise force inbox review. */
export function dispositionForRuleAccounts(
  disposition: SmsRuleDisposition | string | undefined,
  sourceAccountId?: string | null,
  categoryAccountId?: string | null,
): SmsRuleDisposition {
  const normalized: SmsRuleDisposition =
    disposition === 'ignore' || disposition === 'review' || disposition === 'auto_post'
      ? disposition
      : 'auto_post';

  if (normalized === 'ignore') return 'ignore';

  const hasSource = typeof sourceAccountId === 'string' && sourceAccountId.length > 0;
  const hasCategory = typeof categoryAccountId === 'string' && categoryAccountId.length > 0;
  if (!hasSource || !hasCategory) return 'review';

  return normalized;
}

/**
 * Remaps account IDs embedded in SMS rule `actionsJson`.
 * Drops IDs that are not present in the account map (stale post-restore junk).
 */
export function remapRuleActionsJson(
  actionsJson: string | undefined,
  accountMap: Map<string, AccountId>,
): string | undefined {
  if (!actionsJson) return actionsJson;

  const parsed = safeParseJSON<RuleActionsShape>(actionsJson, null as unknown as RuleActionsShape);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return actionsJson;
  }

  let changed = false;
  const next: RuleActionsShape = { ...parsed };

  for (const key of ['sourceAccountId', 'categoryAccountId'] as const) {
    const raw = next[key];
    if (typeof raw !== 'string' || raw.length === 0) continue;
    const mapped = accountMap.get(raw);
    if (mapped && mapped !== raw) {
      next[key] = mapped;
      changed = true;
    } else if (!mapped) {
      delete next[key];
      changed = true;
    }
  }

  return changed ? JSON.stringify(next) : actionsJson;
}

/**
 * Aligns actionsJson account fields with remapped rule columns and demotes
 * auto_post → review when either account is missing. Ignores bad SMS rule data
 * instead of inventing placeholder accounts.
 */
export function sanitizeRuleActionsForImport(
  actionsJson: string | undefined,
  columns: { sourceAccountId: AccountId; categoryAccountId: AccountId },
): string | undefined {
  const parsed = actionsJson
    ? safeParseJSON<RuleActionsShape>(actionsJson, null as unknown as RuleActionsShape)
    : null;
  const base: RuleActionsShape =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? { ...parsed } : {};

  const sourceAccountId = columns.sourceAccountId || undefined;
  const categoryAccountId = columns.categoryAccountId || undefined;

  const next: RuleActionsShape = { ...base };
  if (sourceAccountId) next.sourceAccountId = sourceAccountId;
  else delete next.sourceAccountId;
  if (categoryAccountId) next.categoryAccountId = categoryAccountId;
  else delete next.categoryAccountId;

  next.disposition = dispositionForRuleAccounts(
    base.disposition,
    sourceAccountId,
    categoryAccountId,
  );

  return JSON.stringify(next);
}

/**
 * Rewrites account IDs inside actionsJson during account merge.
 * Keeps the JSON blob aligned with the remapped column FKs.
 */
export function rewriteRuleActionsAccountIds(
  actionsJson: string | undefined,
  updates: { sourceAccountId?: AccountId; categoryAccountId?: AccountId },
): string | undefined {
  if (!actionsJson) return actionsJson;
  if (!updates.sourceAccountId && !updates.categoryAccountId) return actionsJson;

  const parsed = safeParseJSON<RuleActionsShape>(actionsJson, null as unknown as RuleActionsShape);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return actionsJson;
  }

  const next: RuleActionsShape = { ...parsed };
  if (updates.sourceAccountId && next.sourceAccountId) {
    next.sourceAccountId = updates.sourceAccountId;
  }
  if (updates.categoryAccountId && next.categoryAccountId) {
    next.categoryAccountId = updates.categoryAccountId;
  }
  return JSON.stringify(next);
}

/** Collects account IDs referenced by a rule's actionsJson blob. */
export function accountIdsFromRuleActionsJson(actionsJson: string | undefined): string[] {
  if (!actionsJson) return [];
  const parsed = safeParseJSON<RuleActionsShape>(actionsJson, null as unknown as RuleActionsShape);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];

  const ids: string[] = [];
  if (typeof parsed.sourceAccountId === 'string' && parsed.sourceAccountId) {
    ids.push(parsed.sourceAccountId);
  }
  if (typeof parsed.categoryAccountId === 'string' && parsed.categoryAccountId) {
    ids.push(parsed.categoryAccountId);
  }
  return ids;
}

export function mapOptionalRuleAccountId(
  accountMap: Map<string, AccountId>,
  originalId: string | undefined,
): AccountId {
  if (!originalId) return EMPTY_ACCOUNT_ID;
  return accountMap.get(originalId) ?? EMPTY_ACCOUNT_ID;
}
