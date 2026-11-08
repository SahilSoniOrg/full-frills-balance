import {
  readCaptureMetadata,
  withCaptureMetadata,
  retargetCaptureAccounts,
  updateCaptureAllocations,
  type CaptureCategoryLine,
} from '@/src/domain/transaction-intelligence/captureMetadata';
import type { AutomaticTransactionCapturePreferences } from '@/src/services/preferences/workplaceTypes';
import type { AccountId } from '@/src/types/ids';
import {
  parseCategoryDefaults,
  type CaptureCategoryDefault,
} from '@/src/domain/transaction-intelligence/categoryDefaults';

/** Restore source identity even when supplemental account references cannot be resolved. */
export function remapCaptureMetadataForImport(
  json: string | undefined,
  accountMap: ReadonlyMap<string, AccountId>,
  restoredLines: readonly CaptureCategoryLine[],
): string | undefined {
  const capture = readCaptureMetadata(json);
  if (!capture) return json;

  // A missing role alone does not invalidate mapped category confirmations.
  // If any allocation is unmapped, discard the whole allocation set so a
  // partial set cannot be mistaken for a confirmed journal classification.
  const allocationsMapped = capture.allocations.every(allocation =>
    accountMap.has(allocation.accountId),
  );
  const remappable = {
    ...capture,
    allocations: allocationsMapped ? capture.allocations : [],
    uncategorizedAccountIds: capture.uncategorizedAccountIds?.filter(id => accountMap.has(id)),
  };
  const mapped = retargetCaptureAccounts(remappable, id => accountMap.get(id)!);
  // Keep the restored journal's current lines as unconfirmed baseline evidence.
  // Otherwise a later description-only edit could accidentally confirm them.
  return withCaptureMetadata(
    json,
    allocationsMapped ? mapped : updateCaptureAllocations(mapped, restoredLines, false, 0),
  );
}

/** Backup settings describe roles, not consent to automatic writes on this install. */
export function remapCapturePreferencesForImport(
  input: AutomaticTransactionCapturePreferences | undefined,
  accountMap: ReadonlyMap<string, AccountId>,
): AutomaticTransactionCapturePreferences | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const roles = input.uncategorizedAccountIds;
  const uncategorizedAccountIds: Record<string, AccountId> = {};
  if (roles && typeof roles === 'object' && !Array.isArray(roles)) {
    for (const [role, originalId] of Object.entries(roles)) {
      if (!/^(expense|income):[^:]+$/.test(role) || typeof originalId !== 'string') continue;
      const mapped = accountMap.get(originalId);
      if (mapped) uncategorizedAccountIds[role] = mapped;
    }
  }
  return { enabled: false, uncategorizedAccountIds };
}

/** Drop defaults unless every account choice can be restored; never resolve conflicts by omission. */
export function remapCategoryDefaultsForImport(
  input: unknown,
  accountMap: ReadonlyMap<string, AccountId>,
): CaptureCategoryDefault[] {
  return parseCategoryDefaults(input).flatMap(value => {
    const financialAccountId = accountMap.get(value.financialAccountId);
    const categoryAccountId = accountMap.get(value.categoryAccountId);
    const conflictingCategoryAccountIds: AccountId[] = [];
    for (const originalId of value.conflictingCategoryAccountIds ?? []) {
      const mapped = accountMap.get(originalId);
      if (!mapped) return [];
      conflictingCategoryAccountIds.push(mapped);
    }
    return financialAccountId && categoryAccountId
      ? [
          {
            ...value,
            financialAccountId,
            categoryAccountId,
            conflictingCategoryAccountIds: value.conflictingCategoryAccountIds
              ? conflictingCategoryAccountIds
              : undefined,
          },
        ]
      : [];
  });
}
