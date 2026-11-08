import { asAccountId, type AccountId } from '@/src/types/ids';

/** A deliberate standing instruction, scoped to a particular financial account. */
export interface CaptureCategoryDefault {
  merchant: string;
  financialAccountId: AccountId;
  kind: 'expense' | 'income';
  currencyCode: string;
  categoryAccountId: AccountId;
  /** Present when an account merge made previously distinct defaults collide. */
  conflictingCategoryAccountIds?: AccountId[];
}

export function categoryDefaultKey(
  value: Pick<CaptureCategoryDefault, 'merchant' | 'financialAccountId' | 'kind' | 'currencyCode'>,
): string {
  return JSON.stringify([
    value.merchant.trim().toLowerCase(),
    value.financialAccountId,
    value.kind,
    value.currencyCode,
  ]);
}

function mergeChoices(
  current: CaptureCategoryDefault,
  incoming: CaptureCategoryDefault,
): CaptureCategoryDefault {
  const choices = [
    current.categoryAccountId,
    ...(current.conflictingCategoryAccountIds ?? []),
    incoming.categoryAccountId,
    ...(incoming.conflictingCategoryAccountIds ?? []),
  ];
  const distinct = [...new Set(choices)];
  return {
    ...current,
    ...(distinct.length > 1 ? { conflictingCategoryAccountIds: distinct.slice(1) } : {}),
  };
}

/** Reject malformed values and preserve duplicate-scope choices for explicit resolution. */
export function parseCategoryDefaults(input: unknown): CaptureCategoryDefault[] {
  if (!Array.isArray(input)) return [];
  const values = new Map<string, CaptureCategoryDefault>();
  for (const item of input) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const value = item as Record<string, unknown>;
    if (
      typeof value.merchant !== 'string' ||
      !value.merchant.trim() ||
      value.merchant.length > 200 ||
      typeof value.financialAccountId !== 'string' ||
      !value.financialAccountId ||
      typeof value.categoryAccountId !== 'string' ||
      !value.categoryAccountId ||
      (value.kind !== 'expense' && value.kind !== 'income') ||
      typeof value.currencyCode !== 'string' ||
      !/^[A-Z]{3}$/.test(value.currencyCode)
    )
      continue;
    const conflicts = Array.isArray(value.conflictingCategoryAccountIds)
      ? value.conflictingCategoryAccountIds.filter(
          (id): id is string => typeof id === 'string' && !!id,
        )
      : [];
    const parsed: CaptureCategoryDefault = {
      merchant: value.merchant.trim().toLowerCase(),
      financialAccountId: asAccountId(value.financialAccountId),
      categoryAccountId: asAccountId(value.categoryAccountId),
      ...(conflicts.length > 0
        ? {
            conflictingCategoryAccountIds: [...new Set(conflicts)]
              .filter(id => id !== value.categoryAccountId)
              .map(asAccountId),
          }
        : {}),
      kind: value.kind,
      currencyCode: value.currencyCode,
    };
    const key = categoryDefaultKey(parsed);
    const existing = values.get(key);
    values.set(key, existing ? mergeChoices(existing, parsed) : parsed);
  }
  return [...values.values()];
}

export function remapCategoryDefaultsForAccountMerge(
  defaults: readonly CaptureCategoryDefault[],
  sourceIds: ReadonlySet<AccountId>,
  targetAccountId: AccountId,
): CaptureCategoryDefault[] {
  return parseCategoryDefaults(
    defaults.map(value => ({
      ...value,
      financialAccountId: sourceIds.has(value.financialAccountId)
        ? targetAccountId
        : value.financialAccountId,
      categoryAccountId: sourceIds.has(value.categoryAccountId)
        ? targetAccountId
        : value.categoryAccountId,
      conflictingCategoryAccountIds: value.conflictingCategoryAccountIds?.map(accountId =>
        sourceIds.has(accountId) ? targetAccountId : accountId,
      ),
    })),
  );
}
