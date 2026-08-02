import { AccountType, AccountSubtype } from '@/src/data/models/Account';
import {
  BatchImportData,
  ImportedAccount,
  ImportedAccountMetadata,
  ImportedBalanceSnapshot,
  ImportedBudget,
  ImportedBudgetScope,
  ImportedPlannedPayment,
  ImportedTransaction,
  ImportedTransactionAutoPostRule,
} from '@/src/data/repositories/ImportRepository';
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
} from '@/src/services/sms/ruleActionsAccountIds';
import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';

export type NativeImportAccountSources = {
  accounts: ImportedAccount[];
  transactions: ImportedTransaction[];
  budgetScopes?: ImportedBudgetScope[];
  accountMetadata?: ImportedAccountMetadata[];
  plannedPayments?: ImportedPlannedPayment[];
  balanceSnapshots?: ImportedBalanceSnapshot[];
  budgets?: ImportedBudget[];
  transactionAutoPostRules?: ImportedTransactionAutoPostRule[];
  smsAutoPostRules?: ImportedTransactionAutoPostRule[];
  sms_auto_post_rules?: ImportedTransactionAutoPostRule[];
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
  data: NativeImportAccountSources,
): ImportedTransactionAutoPostRule[] {
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
    if (site.importPolicy !== 'salvage') continue;

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
}): { placeholderAccounts: ImportedAccount[]; plan: ImportPlan } {
  const { data, accountMap, accountCurrencyMap, defaultCurrencyCode, nextId } = args;
  const plan = importPlan(accountImportBatchFromSources(data));
  const placeholderAccounts: ImportedAccount[] = [];

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
  rules: ImportedTransactionAutoPostRule[],
  accountMap: Map<string, AccountId>,
  nextId: () => string,
  parseTimestamp: (value?: number | string) => number | undefined,
  plan?: ImportPlan,
): ImportedTransactionAutoPostRule[] {
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
      id: nextId(),
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
