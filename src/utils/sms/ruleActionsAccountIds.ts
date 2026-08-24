import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import { safeParseJSON } from '@/src/utils/serialization';

type RuleActionsShape = {
  disposition?: string;
  sourceAccountId?: string;
  categoryAccountId?: string;
  journalDescription?: string;
  [key: string]: unknown;
};

export type SmsRuleDisposition = 'auto_post' | 'review' | 'ignore';

function parseRuleActions(actionsJson: string | undefined): RuleActionsShape {
  if (!actionsJson) return {};
  const parsed = safeParseJSON<RuleActionsShape>(actionsJson, null as unknown as RuleActionsShape);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return { ...parsed };
}

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
 * Columns are canonical for account IDs. Rewrite actionsJson account fields from
 * columns and demote auto_post → review when either leg is missing.
 */
export function syncRuleActionsFromColumns(
  actionsJson: string | undefined,
  columns: { sourceAccountId?: AccountId | null; categoryAccountId?: AccountId | null },
): string {
  const next = parseRuleActions(actionsJson);
  const sourceAccountId = columns.sourceAccountId || undefined;
  const categoryAccountId = columns.categoryAccountId || undefined;

  if (sourceAccountId) next.sourceAccountId = sourceAccountId;
  else delete next.sourceAccountId;
  if (categoryAccountId) next.categoryAccountId = categoryAccountId;
  else delete next.categoryAccountId;

  next.disposition = dispositionForRuleAccounts(
    next.disposition,
    sourceAccountId,
    categoryAccountId,
  );

  return JSON.stringify(next);
}

export function mapOptionalRuleAccountId(
  accountMap: Map<string, AccountId>,
  originalId: string | undefined,
): AccountId {
  if (!originalId) return EMPTY_ACCOUNT_ID;
  return accountMap.get(originalId) ?? EMPTY_ACCOUNT_ID;
}
