import { AccountType, AccountSubtype } from '@/src/data/models/Account';
import {
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

function addAccountId(target: Set<string>, value?: string | null): void {
  if (typeof value === 'string' && value.length > 0) {
    target.add(value);
  }
}

export function autoPostRulesFromData(
  data: NativeImportAccountSources,
): ImportedTransactionAutoPostRule[] {
  return data.transactionAutoPostRules || data.smsAutoPostRules || data.sms_auto_post_rules || [];
}

/** Account IDs referenced by transactions/scopes/etc that must exist after remap. */
export function collectReferencedAccountIds(data: NativeImportAccountSources): Set<string> {
  const ids = new Set<string>();

  for (const account of data.accounts) {
    addAccountId(ids, account.parentAccountId);
  }
  for (const transaction of data.transactions) {
    addAccountId(ids, transaction.accountId);
  }
  for (const scope of data.budgetScopes || []) {
    addAccountId(ids, scope.accountId);
  }
  for (const metadata of data.accountMetadata || []) {
    addAccountId(ids, metadata.accountId);
    addAccountId(ids, metadata.payFromAccountId);
  }
  for (const payment of data.plannedPayments || []) {
    addAccountId(ids, payment.fromAccountId);
    addAccountId(ids, payment.toAccountId);
  }
  for (const snapshot of data.balanceSnapshots || []) {
    addAccountId(ids, snapshot.accountId);
  }
  for (const budget of data.budgets || []) {
    if (!budget.assetAccountIds) continue;
    for (const id of budget.assetAccountIds.split(',')) {
      addAccountId(ids, id.trim());
    }
  }
  // SMS auto-post rules are sanitized separately: stale account refs are cleared,
  // not recovered as placeholder accounts.

  return ids;
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

export function buildPlaceholderAccountsForOrphans(args: {
  data: NativeImportAccountSources;
  accountMap: Map<string, AccountId>;
  accountCurrencyMap?: Map<string, string>;
  defaultCurrencyCode: string;
  nextId: () => AccountId;
}): ImportedAccount[] {
  const { data, accountMap, accountCurrencyMap, defaultCurrencyCode, nextId } = args;
  const placeholderAccounts: ImportedAccount[] = [];
  const recoveredOriginalIds: string[] = [];

  for (const originalId of collectReferencedAccountIds(data)) {
    if (accountMap.has(originalId)) continue;
    const recoveredId = nextId();
    accountMap.set(originalId, recoveredId);
    accountCurrencyMap?.set(originalId, defaultCurrencyCode);
    recoveredOriginalIds.push(originalId);
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
      { originalIds: recoveredOriginalIds },
    );
  }

  return placeholderAccounts;
}

export function remapAutoPostRulesForImport(
  rules: ImportedTransactionAutoPostRule[],
  accountMap: Map<string, AccountId>,
  nextId: () => string,
  parseTimestamp: (value?: number | string) => number | undefined,
): ImportedTransactionAutoPostRule[] {
  return rules.map(rule => {
    const sourceAccountId = mapOptionalRuleAccountId(accountMap, rule.sourceAccountId);
    const categoryAccountId = mapOptionalRuleAccountId(accountMap, rule.categoryAccountId);
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
