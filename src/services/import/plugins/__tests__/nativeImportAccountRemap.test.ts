import { AccountType, AccountSubtype } from '@/src/data/models/Account';
import {
  importPlan,
  referenceSites,
} from '@/src/services/accounts/accountReferenceGraph';
import {
  accountImportBatchFromSources,
  buildPlaceholderAccountsForOrphans,
  NativeImportAccountSources,
} from '@/src/services/import/plugins/nativeImportAccountRemap';
import {
  AccountId,
  BudgetId,
  EMPTY_ACCOUNT_ID,
  JournalId,
  TransactionId,
} from '@/src/types/domain';

describe('native import Account reference adapter', () => {
  const baseData = (): NativeImportAccountSources => ({
    accounts: [
      {
        id: 'a1',
        name: 'Cash',
        accountType: AccountType.ASSET,
        accountSubtype: AccountSubtype.BANK_CHECKING,
        currencyCode: 'USD',
      },
    ],
    transactions: [
      {
        id: 't1',
        journalId: 'j1' as JournalId,
        accountId: 'missing-tx' as AccountId,
        amount: 10,
        transactionType: 'DEBIT',
        currencyCode: 'USD',
        transactionDate: Date.now(),
      },
    ],
    transactionAutoPostRules: [
      {
        id: 'rule-stale',
        sourceAccountId: 'ghost' as AccountId,
        categoryAccountId: 'a1' as AccountId,
        isActive: true,
      },
      {
        id: 'rule-salvaged',
        sourceAccountId: 'missing-tx' as AccountId,
        categoryAccountId: 'a1' as AccountId,
        isActive: true,
      },
    ],
  });

  it('maps plugin bags → DTO → importPlan (salvage + sanitize)', () => {
    const batch = accountImportBatchFromSources(baseData());
    expect(batch.accountIds).toEqual(['a1']);
    expect(batch.refs.some(ref => ref.accountId === 'missing-tx')).toBe(true);
    expect(batch.rules).toHaveLength(2);

    const plan = importPlan(batch);
    expect(plan.missingAccountIds).toEqual(['missing-tx']);
    expect(plan.rulePatches).toEqual([
      { ruleKey: 'rule-stale', sourceAccountId: EMPTY_ACCOUNT_ID },
    ]);
  });

  it('materializes placeholders only for plan.missingAccountIds', () => {
    const accountMap = new Map<string, AccountId>([['a1', 'mapped-a1' as AccountId]]);
    let n = 0;
    const { placeholderAccounts, plan } = buildPlaceholderAccountsForOrphans({
      data: baseData(),
      accountMap,
      defaultCurrencyCode: 'USD',
      nextId: () => `ph-${++n}` as AccountId,
    });

    expect(plan.missingAccountIds).toEqual(['missing-tx']);
    expect(placeholderAccounts).toHaveLength(1);
    expect(accountMap.get('missing-tx')).toBe('ph-1');
    expect(accountMap.has('ghost')).toBe(false);
  });

  it('walks salvage sites from referenceSites rather than a hard-coded list', () => {
    const salvageKeys = referenceSites()
      .filter(site => site.importPolicy === 'salvage')
      .map(site => site.key);
    const batch = accountImportBatchFromSources({
      accounts: [
        {
          id: 'a1',
          name: 'Cash',
          accountType: AccountType.ASSET,
          currencyCode: 'USD',
          parentAccountId: 'parent-missing' as AccountId,
        },
      ],
      transactions: [
        {
          id: 't1',
          journalId: 'j1' as JournalId,
          accountId: 'tx-missing' as AccountId,
          amount: 1,
          transactionType: 'DEBIT',
          currencyCode: 'USD',
          transactionDate: Date.now(),
        },
      ],
      budgets: [
        {
          id: 'b1',
          name: 'Food',
          amount: 1,
          currencyCode: 'USD',
          startMonth: '2024-01',
          active: true,
          assetAccountIds: 'fund-missing',
        },
      ],
      budgetScopes: [
        {
          id: 's1',
          budgetId: 'b1' as BudgetId,
          accountId: 'scope-missing' as AccountId,
        },
      ],
      accountMetadata: [
        {
          id: 'm1',
          accountId: 'meta-owner-missing' as AccountId,
          payFromAccountId: 'pay-missing' as AccountId,
        },
      ],
      plannedPayments: [
        {
          id: 'p1',
          name: 'Rent',
          amount: 1,
          currencyCode: 'USD',
          fromAccountId: 'from-missing' as AccountId,
          toAccountId: 'to-missing' as AccountId,
          intervalN: 1,
          intervalType: 'MONTH',
          startDate: Date.now(),
          nextOccurrence: Date.now(),
          status: 'ACTIVE',
          isAutoPost: false,
        },
      ],
      balanceSnapshots: [
        {
          id: 'snap1',
          accountId: 'snap-missing' as AccountId,
          transactionId: 't1' as TransactionId,
          transactionDate: Date.now(),
          absoluteBalance: 0,
          transactionCount: 1,
        },
      ],
    });

    const refKeys = new Set(batch.refs.map(ref => ref.siteKey));
    expect([...refKeys].sort()).toEqual([...salvageKeys].sort());
  });
});
