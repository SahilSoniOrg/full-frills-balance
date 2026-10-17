/** Plain import records to the shared account-reference inventory. */
import type {
  BatchImportData,
  CanonicalAccount,
  CanonicalAccountMetadata,
  CanonicalBalanceSnapshot,
  CanonicalBudget,
  CanonicalBudgetScope,
  CanonicalPlannedPayment,
  CanonicalTransaction,
  CanonicalTransactionAutoPostRule,
} from '@/src/types/importContracts';
import {
  type AccountImportBatchDto,
  type AccountImportRef,
  type AccountImportRuleRef,
  parseFundingAccountIds,
  referenceSites,
} from '@/src/services/accounts/accountReferencePolicy';

export type NativeImportAccountSources = {
  accounts: CanonicalAccount[];
  transactions: CanonicalTransaction[];
  budgetScopes?: CanonicalBudgetScope[];
  accountMetadata?: CanonicalAccountMetadata[];
  plannedPayments?: CanonicalPlannedPayment[];
  balanceSnapshots?: CanonicalBalanceSnapshot[];
  budgets?: CanonicalBudget[];
  transactionAutoPostRules?: CanonicalTransactionAutoPostRule[];
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
  data: NativeImportAccountSources,
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
