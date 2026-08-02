import {
  formatFundingAccountIds,
  parseFundingAccountIds,
  referenceSites,
} from '@/src/services/accounts/accountReferenceGraph';

describe('Account reference graph', () => {
  describe('referenceSites', () => {
    it('inventories all 11 WatermelonDB Account FK sites from research', () => {
      const sites = referenceSites();
      expect(sites).toHaveLength(11);
      expect(sites.map(site => site.key)).toEqual([
        'account.parentAccountId',
        'transaction.accountId',
        'budgetScope.accountId',
        'budget.assetAccountIds',
        'accountMetadata.accountId',
        'accountMetadata.payFromAccountId',
        'plannedPayment.fromAccountId',
        'plannedPayment.toAccountId',
        'balanceSnapshot.accountId',
        'transactionAutoPostRule.sourceAccountId',
        'transactionAutoPostRule.categoryAccountId',
      ]);
    });

    it('marks funding list as CSV and SMS rules as dual storage', () => {
      const byKey = Object.fromEntries(referenceSites().map(site => [site.key, site]));
      expect(byKey['budget.assetAccountIds'].cardinality).toBe('csv');
      expect(byKey['transactionAutoPostRule.sourceAccountId'].cardinality).toBe('dual');
      expect(byKey['transactionAutoPostRule.categoryAccountId'].cardinality).toBe('dual');
      expect(byKey['transaction.accountId'].cardinality).toBe('scalar');
    });

    it('exposes merge behavior for retarget vs destroy vs none sites', () => {
      const byKey = Object.fromEntries(referenceSites().map(site => [site.key, site]));
      expect(byKey['transaction.accountId'].mergeBehavior).toBe('retarget');
      expect(byKey['balanceSnapshot.accountId'].mergeBehavior).toBe('destroy');
      expect(byKey['accountMetadata.accountId'].mergeBehavior).toBe('none');
    });
  });

  describe('funding Account-id CSV helpers', () => {
    it('parses comma-separated ids with trim and empty-token drop', () => {
      expect(parseFundingAccountIds('acc-1, acc-2,,acc-3 ,')).toEqual([
        'acc-1',
        'acc-2',
        'acc-3',
      ]);
      expect(parseFundingAccountIds(undefined)).toEqual([]);
      expect(parseFundingAccountIds(null)).toEqual([]);
      expect(parseFundingAccountIds('')).toEqual([]);
      expect(parseFundingAccountIds('   ')).toEqual([]);
    });

    it('formats ids as CSV and round-trips with parse', () => {
      expect(formatFundingAccountIds(['acc-1', 'acc-2'])).toBe('acc-1,acc-2');
      expect(formatFundingAccountIds([])).toBe('');
      expect(parseFundingAccountIds(formatFundingAccountIds(['a', 'b', 'c']))).toEqual([
        'a',
        'b',
        'c',
      ]);
    });
  });
});
