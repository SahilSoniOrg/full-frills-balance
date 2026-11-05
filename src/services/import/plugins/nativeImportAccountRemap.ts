import { AccountSubtype, AccountType } from '@/src/types/enums';
import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/ids';

import {
  BatchImportData,
  CanonicalAccount,
  CanonicalAccountMetadata,
  CanonicalBalanceSnapshot,
  CanonicalAccountMatcher,
  CanonicalBudget,
  CanonicalBudgetScope,
  CanonicalPlannedPayment,
  CanonicalTransaction,
  CanonicalTransactionAutoPostRule,
} from '@/src/types/importContracts';
import {
  AccountImportBatchDto,
  AccountImportRef,
  AccountImportRuleRef,
  formatFundingAccountIds,
  importPlan,
  ImportPlan,
  parseFundingAccountIds,
  referenceSites,
} from '@/src/services/accounts/accountReferenceGraph';
import {
  mapOptionalRuleAccountId,
  syncRuleActionsFromColumns,
} from '@/src/utils/sms/ruleActionsAccountIds';
import { logger } from '@/src/utils/logger';
import {
  conditionsKeyFor,
  parseStoredMatcherDefinition,
  validateAccountMatcherDefinition,
} from '@/src/services/sms/recognition/accountMatcherDefinition';
import {
  unionSuppressions,
  type AccountMatcherSuppression,
} from '@/src/services/preferences/workplaceTypes';

export type NativeImportAccountSources = {
  accounts: CanonicalAccount[];
  transactions: CanonicalTransaction[];
  budgetScopes?: CanonicalBudgetScope[];
  accountMetadata?: CanonicalAccountMetadata[];
  plannedPayments?: CanonicalPlannedPayment[];
  balanceSnapshots?: CanonicalBalanceSnapshot[];
  budgets?: CanonicalBudget[];
  transactionAutoPostRules?: CanonicalTransactionAutoPostRule[];
  accountMatchers?: CanonicalAccountMatcher[];
  smsAutoPostRules?: CanonicalTransactionAutoPostRule[];
  sms_auto_post_rules?: CanonicalTransactionAutoPostRule[];
};

function addRef(
  refs: AccountImportRef[],
  siteKey: AccountImportRef['siteKey'],
  accountId: string | undefined | null,
  recordId?: string,
): void {
  if (typeof accountId === 'string' && accountId.length > 0) {
    refs.push({ siteKey, accountId, recordId });
  }
}

export function autoPostRulesFromData(
  data: Pick<
    NativeImportAccountSources,
    'transactionAutoPostRules' | 'smsAutoPostRules' | 'sms_auto_post_rules'
  >,
): CanonicalTransactionAutoPostRule[] {
  return data.transactionAutoPostRules || data.smsAutoPostRules || data.sms_auto_post_rules || [];
}

/**
 * Maps native/plugin bags (or post-remap BatchImportData) onto the narrow
 * Account reference graph import DTO. Soft-deleted transactions should already
 * be filtered by the caller when building salvage plans.
 */
export function accountImportBatchFromSources(
  data: NativeImportAccountSources | BatchImportData,
): AccountImportBatchDto {
  const refs: AccountImportRef[] = [];
  const rules: AccountImportRuleRef[] = [];

  for (const site of referenceSites()) {
    if (site.importPolicy === 'sanitize') continue;

    switch (site.key) {
      case 'account.parentAccountId':
        for (const account of data.accounts) {
          addRef(refs, site.key, account.parentAccountId, account.id);
        }
        break;
      case 'transaction.accountId':
        for (const transaction of data.transactions) {
          if (transaction.deletedAt != null) continue;
          addRef(refs, site.key, transaction.accountId, transaction.id);
        }
        break;
      case 'budgetScope.accountId':
        for (const scope of data.budgetScopes || []) {
          addRef(refs, site.key, scope.accountId, scope.id);
        }
        break;
      case 'budget.assetAccountIds':
        for (const budget of data.budgets || []) {
          for (const id of parseFundingAccountIds(budget.assetAccountIds)) {
            addRef(refs, site.key, id, budget.id);
          }
        }
        break;
      case 'accountMetadata.accountId':
        for (const metadata of data.accountMetadata || []) {
          addRef(refs, site.key, metadata.accountId, metadata.id);
        }
        break;
      case 'accountMetadata.payFromAccountId':
        for (const metadata of data.accountMetadata || []) {
          addRef(refs, site.key, metadata.payFromAccountId, metadata.id);
        }
        break;
      case 'plannedPayment.fromAccountId':
        for (const payment of data.plannedPayments || []) {
          addRef(refs, site.key, payment.fromAccountId, payment.id);
        }
        break;
      case 'plannedPayment.toAccountId':
        for (const payment of data.plannedPayments || []) {
          addRef(refs, site.key, payment.toAccountId, payment.id);
        }
        break;
      case 'balanceSnapshot.accountId':
        for (const snapshot of data.balanceSnapshots || []) {
          addRef(refs, site.key, snapshot.accountId, snapshot.id);
        }
        break;
      case 'accountMatcher.accountId':
        for (const matcher of data.accountMatchers || []) {
          addRef(refs, site.key, matcher.accountId, matcher.id);
        }
        break;
      default:
        break;
    }
  }

  for (const rule of autoPostRulesFromData(data)) {
    rules.push({
      ruleKey: rule.id,
      sourceAccountId: rule.sourceAccountId,
      categoryAccountId: rule.categoryAccountId,
    });
  }

  return {
    accountIds: data.accounts.map(account => account.id),
    refs,
    rules,
  };
}

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

export function remapAccountMatchersForImport(
  matchers: unknown,
  accountMap: Map<string, AccountId>,
  nextId: () => string,
  parseTimestamp: (value?: number | string) => number | undefined,
): {
  matchers: CanonicalAccountMatcher[];
  skippedItems: { id: string; reason: string }[];
  idMap: Map<string, string>;
} {
  const imported: CanonicalAccountMatcher[] = [];
  const skippedItems: { id: string; reason: string }[] = [];
  const idMap = new Map<string, string>();
  if (!Array.isArray(matchers)) {
    if (matchers !== undefined) {
      skippedItems.push({ id: 'accountMatchers', reason: 'matcher section is invalid' });
      logger.warn('[NativePlugin] Dropped invalid account matcher section');
    }
    return { matchers: imported, skippedItems, idMap };
  }

  for (const row of matchers) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      skippedItems.push({ id: 'unknown', reason: 'account matcher row is invalid' });
      logger.warn('[NativePlugin] Dropped invalid account matcher row');
      continue;
    }
    const matcher = row as CanonicalAccountMatcher;
    const matcherId = typeof matcher.id === 'string' ? matcher.id : 'unknown';
    const accountId =
      typeof matcher.accountId === 'string' ? accountMap.get(matcher.accountId) : undefined;
    if (!accountId) {
      skippedItems.push({ id: matcherId, reason: 'owner account was not present in backup' });
      logger.warn('[NativePlugin] Dropped account matcher with unmapped owner', {
        matcherId,
      });
      continue;
    }

    const rawDefinition =
      matcher.definition !== undefined
        ? matcher.definition
        : parseStoredMatcherDefinition(matcher.definitionJson);
    const result = validateAccountMatcherDefinition(rawDefinition);
    if (!result.valid || !result.definition || typeof matcher.isEnabled !== 'boolean') {
      skippedItems.push({
        id: matcherId,
        reason: 'account matcher definition or state is invalid',
      });
      logger.warn('[NativePlugin] Dropped account matcher with invalid definition', {
        matcherId,
      });
      continue;
    }

    const id = nextId();
    idMap.set(matcherId, id);
    imported.push({
      id,
      accountId,
      definitionJson: JSON.stringify(result.definition),
      conditionsKey: conditionsKeyFor(result.definition),
      isEnabled: matcher.isEnabled,
      provenance: matcher.provenance || 'manual',
      createdAt: parseTimestamp(matcher.createdAt),
      updatedAt: parseTimestamp(matcher.updatedAt),
    });
  }

  return { matchers: imported, skippedItems, idMap };
}

export function remapAccountMatcherSuppressions(
  suppressions: unknown,
  accountMap: Map<string, AccountId>,
): AccountMatcherSuppression[] {
  if (!Array.isArray(suppressions)) return [];
  const mapped: AccountMatcherSuppression[] = [];
  for (const row of suppressions) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const suppression = row as AccountMatcherSuppression;
    if (
      typeof suppression.accountId !== 'string' ||
      typeof suppression.conditionsKey !== 'string' ||
      suppression.conditionsKey.length === 0 ||
      (suppression.reason !== 'dismissed' && suppression.reason !== 'forgotten')
    ) {
      continue;
    }
    const accountId = accountMap.get(suppression.accountId);
    if (!accountId) {
      logger.warn('[NativePlugin] Dropped account matcher suppression with unmapped owner', {
        accountId: suppression.accountId,
      });
      continue;
    }
    mapped.push({ ...suppression, accountId });
  }
  return unionSuppressions(mapped);
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
