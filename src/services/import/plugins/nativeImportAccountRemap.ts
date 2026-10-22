import { AccountSubtype, AccountType } from '@/src/types/enums';
import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/ids';

import { CanonicalAccount, CanonicalTransactionAutoPostRule } from '@/src/types/importContracts';
import {
  formatFundingAccountIds,
  importPlan,
  ImportPlan,
  parseFundingAccountIds,
} from '@/src/services/accounts/accountReferencePolicy';
import {
  mapOptionalRuleAccountId,
  syncRuleActionsFromColumns,
} from '@/src/utils/sms/ruleActionsAccountIds';
import { logger } from '@/src/utils/logger';
import {
  accountImportBatchFromSources,
  type NativeImportAccountSources,
} from '../importAccountReferences';

export {
  accountImportBatchFromSources,
  autoPostRulesFromData,
  type NativeImportAccountSources,
} from '../importAccountReferences';

export function requireMappedAccountId(
  accountMap: Map<string, AccountId>,
  originalId: string | undefined,
  context: string,
): AccountId {
  if (!originalId) {
    throw new Error(`Import mapping failed: ${context} is missing an account id`);
  }
  const mapped = accountMap.get(originalId);
  if (!mapped) {
    throw new Error(`Import mapping failed: ${context} references missing account "${originalId}"`);
  }
  return mapped;
}

/**
 * Plans salvage/sanitize via the Account reference graph, then materializes
 * placeholder Accounts for missing salvage ids. Rule patches are applied later
 * during remap (see remapAutoPostRulesForImport).
 */
export function buildPlaceholderAccountsForOrphans(args: {
  data: NativeImportAccountSources;
  accountMap: Map<string, AccountId>;
  accountCurrencyMap?: Map<string, string>;
  defaultCurrencyCode: string;
  nextId: () => AccountId;
}): { placeholderAccounts: CanonicalAccount[]; plan: ImportPlan } {
  const { data, accountMap, accountCurrencyMap, defaultCurrencyCode, nextId } = args;
  const plan = importPlan(accountImportBatchFromSources(data));
  const placeholderAccounts: CanonicalAccount[] = [];

  for (const originalId of plan.missingAccountIds) {
    if (accountMap.has(originalId)) continue;
    const recoveredId = nextId();
    accountMap.set(originalId, recoveredId);
    accountCurrencyMap?.set(originalId, defaultCurrencyCode);
    placeholderAccounts.push({
      id: recoveredId,
      name: `Recovered account (${originalId.slice(0, 8)})`,
      accountType: AccountType.ASSET,
      accountSubtype: AccountSubtype.OTHER,
      currencyCode: defaultCurrencyCode,
      description:
        'Placeholder created during import for transactions or rules that referenced a missing account.',
    });
  }

  if (placeholderAccounts.length > 0) {
    logger.warn(
      `[NativePlugin] Created ${placeholderAccounts.length} placeholder account(s) for orphaned references`,
      { originalIds: plan.missingAccountIds },
    );
  }

  return { placeholderAccounts, plan };
}

export function remapAutoPostRulesForImport(
  rules: CanonicalTransactionAutoPostRule[],
  accountMap: Map<string, AccountId>,
  nextId: () => string,
  parseTimestamp: (value?: number | string) => number | undefined,
  plan?: ImportPlan,
  ruleIdMap?: ReadonlyMap<string, string>,
): CanonicalTransactionAutoPostRule[] {
  const patchesByKey = new Map((plan?.rulePatches ?? []).map(patch => [patch.ruleKey, patch]));

  return rules.map(rule => {
    const patch = patchesByKey.get(rule.id);
    const sourceOriginal =
      patch && 'sourceAccountId' in patch ? patch.sourceAccountId : rule.sourceAccountId;
    const categoryOriginal =
      patch && 'categoryAccountId' in patch ? patch.categoryAccountId : rule.categoryAccountId;

    const sourceAccountId = mapOptionalRuleAccountId(accountMap, sourceOriginal);
    const categoryAccountId = mapOptionalRuleAccountId(accountMap, categoryOriginal);
    const clearedBadRef =
      (Boolean(rule.sourceAccountId) && sourceAccountId === EMPTY_ACCOUNT_ID) ||
      (Boolean(rule.categoryAccountId) && categoryAccountId === EMPTY_ACCOUNT_ID);

    if (clearedBadRef) {
      logger.warn(`[NativePlugin] Cleared missing account refs on auto-post rule "${rule.id}"`, {
        sourceAccountId: rule.sourceAccountId,
        categoryAccountId: rule.categoryAccountId,
      });
    }

    return {
      id: ruleIdMap?.get(rule.id) ?? nextId(),
      channelsJson: rule.channelsJson,
      senderMatch: rule.senderMatch,
      bodyMatch: rule.bodyMatch,
      conditionsJson: rule.conditionsJson,
      actionsJson: syncRuleActionsFromColumns(rule.actionsJson, {
        sourceAccountId,
        categoryAccountId,
      }),
      priority: rule.priority,
      sourceAccountId,
      categoryAccountId,
      isActive: rule.isActive,
      createdAt: parseTimestamp(rule.createdAt),
      updatedAt: parseTimestamp(rule.updatedAt),
    };
  });
}

/** Remap funding CSV via graph parse/format helpers. */
export function remapFundingAccountIdsCsv(
  csv: string | undefined,
  accountMap: Map<string, AccountId>,
  context: string,
): string {
  const remapped = parseFundingAccountIds(csv).map(id =>
    requireMappedAccountId(accountMap, id, context),
  );
  return formatFundingAccountIds(remapped);
}
