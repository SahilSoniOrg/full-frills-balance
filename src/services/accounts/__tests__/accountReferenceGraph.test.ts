import { accountQueryRepository } from '@/src/data/repositories/account';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { transactionAutoPostRuleRepository } from '@/src/data/repositories/TransactionAutoPostRuleRepository';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import {
  assertWritable,
  deleteBlockers,
  formatFundingAccountIds,
  importPlan,
  parseFundingAccountIds,
  referenceSites,
} from '@/src/services/accounts/accountReferenceGraph';
import { AccountId, EMPTY_ACCOUNT_ID, WorkplaceId } from '@/src/types/domain';

jest.mock('@/src/data/repositories/account', () => ({
  ...jest.requireActual('@/src/data/repositories/account'),

  accountQueryRepository: {
    findAllByIds: jest.fn(),
    queryByParentId: jest.fn(),
    findMetadataByPayFromAccountIds: jest.fn(),
  },
}));

jest.mock('@/src/data/repositories/BudgetRepository', () => ({
  budgetRepository: {
    findAllScopesByAccountIds: jest.fn(),
    findAllReferencingAssetAccountId: jest.fn(),
  },
}));

jest.mock('@/src/data/repositories/PlannedPaymentRepository', () => ({
  plannedPaymentRepository: {
    findAllByFromAccountIds: jest.fn(),
    findAllByToAccountIds: jest.fn(),
  },
}));

jest.mock('@/src/data/repositories/TransactionAutoPostRuleRepository', () => ({
  transactionAutoPostRuleRepository: {
    findAllReferencingAccountIds: jest.fn(),
  },
}));

jest.mock('@/src/data/repositories/transaction', () => ({
  ...jest.requireActual('@/src/data/repositories/transaction'),

  transactionQueryRepository: {
    findAllByAccountIds: jest.fn(),
  },
}));

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

    it('marks SMS dual sites as sanitize and other FK sites as salvage', () => {
      const byKey = Object.fromEntries(referenceSites().map(site => [site.key, site]));
      expect(byKey['transactionAutoPostRule.sourceAccountId'].importPolicy).toBe('sanitize');
      expect(byKey['transactionAutoPostRule.categoryAccountId'].importPolicy).toBe('sanitize');
      expect(byKey['transaction.accountId'].importPolicy).toBe('salvage');
      expect(byKey['budget.assetAccountIds'].importPolicy).toBe('salvage');
    });
  });

  describe('funding Account-id CSV helpers', () => {
    it('parses comma-separated ids with trim and empty-token drop', () => {
      expect(parseFundingAccountIds('acc-1, acc-2,,acc-3 ,')).toEqual(['acc-1', 'acc-2', 'acc-3']);
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

  describe('assertWritable', () => {
    const workplaceId = 'wp-1' as WorkplaceId;

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('no-ops when all ids are empty', async () => {
      await expect(assertWritable(workplaceId, [undefined, null, ''])).resolves.toEqual([]);
      expect(accountQueryRepository.findAllByIds).not.toHaveBeenCalled();
    });

    it('throws when any id is missing or soft-deleted', async () => {
      (accountQueryRepository.findAllByIds as jest.Mock).mockResolvedValue([{ id: 'acc-1' }]);

      await expect(
        assertWritable(workplaceId, ['acc-1' as AccountId, 'acc-gone' as AccountId], 'Budget'),
      ).rejects.toThrow('Budget references missing or deleted account(s): acc-gone');
    });

    it('returns resolved accounts when every id is live', async () => {
      (accountQueryRepository.findAllByIds as jest.Mock).mockResolvedValue([
        { id: 'acc-1' },
        { id: 'acc-2' },
      ]);

      await expect(
        assertWritable(workplaceId, ['acc-1' as AccountId, 'acc-2' as AccountId]),
      ).resolves.toEqual([{ id: 'acc-1' }, { id: 'acc-2' }]);
    });
  });

  describe('deleteBlockers', () => {
    const workplaceId = 'wp-1' as WorkplaceId;
    const accountId = 'acc-1' as AccountId;

    beforeEach(() => {
      jest.clearAllMocks();
      (accountQueryRepository.queryByParentId as jest.Mock).mockReturnValue({
        fetch: jest.fn().mockResolvedValue([]),
      });
      (budgetRepository.findAllScopesByAccountIds as jest.Mock).mockResolvedValue([]);
      (budgetRepository.findAllReferencingAssetAccountId as jest.Mock).mockResolvedValue([]);
      (plannedPaymentRepository.findAllByFromAccountIds as jest.Mock).mockResolvedValue([]);
      (plannedPaymentRepository.findAllByToAccountIds as jest.Mock).mockResolvedValue([]);
      (accountQueryRepository.findMetadataByPayFromAccountIds as jest.Mock).mockResolvedValue([]);
      (
        transactionAutoPostRuleRepository.findAllReferencingAccountIds as jest.Mock
      ).mockResolvedValue([]);
      (transactionQueryRepository.findAllByAccountIds as jest.Mock).mockResolvedValue([]);
    });

    it('returns empty when nothing blocks delete', async () => {
      await expect(deleteBlockers(workplaceId, accountId)).resolves.toEqual([]);
    });

    it('returns structured blockers including transactions with closed codes', async () => {
      (transactionQueryRepository.findAllByAccountIds as jest.Mock).mockResolvedValue([
        { id: 'tx1' },
        { id: 'tx2' },
      ]);
      (accountQueryRepository.queryByParentId as jest.Mock).mockReturnValue({
        fetch: jest.fn().mockResolvedValue([{ id: 'child' }]),
      });
      (budgetRepository.findAllScopesByAccountIds as jest.Mock).mockResolvedValue([
        { id: 'scope' },
      ]);
      (budgetRepository.findAllReferencingAssetAccountId as jest.Mock).mockResolvedValue([
        { id: 'b1', assetAccountIds: 'acc-1,acc-2' },
      ]);
      (plannedPaymentRepository.findAllByFromAccountIds as jest.Mock).mockResolvedValue([
        { id: 'pp1' },
      ]);
      (plannedPaymentRepository.findAllByToAccountIds as jest.Mock).mockResolvedValue([
        { id: 'pp1' },
      ]);
      (accountQueryRepository.findMetadataByPayFromAccountIds as jest.Mock).mockResolvedValue([
        { id: 'meta' },
      ]);
      (
        transactionAutoPostRuleRepository.findAllReferencingAccountIds as jest.Mock
      ).mockResolvedValue([{ id: 'rule' }]);

      const blockers = await deleteBlockers(workplaceId, accountId);
      expect(blockers).toEqual([
        { code: 'transactions', count: 2, label: 'transaction(s)' },
        { code: 'child_accounts', count: 1, label: 'child account(s)' },
        { code: 'budget_scopes', count: 1, label: 'budget scope(s)' },
        { code: 'budget_funding_accounts', count: 1, label: 'budget funding account list(s)' },
        { code: 'planned_payments', count: 1, label: 'planned payment(s)' },
        { code: 'pay_from_metadata', count: 1, label: 'pay-from metadata reference(s)' },
        { code: 'sms_auto_post_rules', count: 1, label: 'SMS auto-post rule(s)' },
      ]);
    });

    it('does not treat balance snapshots as delete blockers', async () => {
      // Snapshots are allow-delete; deleteBlockers must not invent a snapshot code.
      const blockers = await deleteBlockers(workplaceId, accountId);
      expect(blockers.map(b => b.code)).not.toContain('balance_snapshots');
      expect(referenceSites().find(s => s.key === 'balanceSnapshot.accountId')?.deletePolicy).toBe(
        'allow',
      );
    });
  });

  describe('importPlan', () => {
    it('lists missing salvage refs and clears rule refs that stay missing after salvage', () => {
      const plan = importPlan({
        accountIds: ['acc-live', 'acc-tombstone'],
        refs: [
          { siteKey: 'transaction.accountId', accountId: 'acc-live' },
          { siteKey: 'transaction.accountId', accountId: 'orphan-tx' },
          { siteKey: 'budget.assetAccountIds', accountId: 'orphan-funding' },
          { siteKey: 'account.parentAccountId', accountId: 'acc-tombstone' },
        ],
        rules: [
          {
            ruleKey: 'rule-ok',
            sourceAccountId: 'acc-live',
            categoryAccountId: 'orphan-tx',
          },
          {
            ruleKey: 'rule-stale',
            sourceAccountId: 'ghost-source',
            categoryAccountId: 'acc-live',
          },
        ],
      });

      expect(plan.missingAccountIds.sort()).toEqual(['orphan-funding', 'orphan-tx']);
      expect(plan.rulePatches).toEqual([
        { ruleKey: 'rule-stale', sourceAccountId: EMPTY_ACCOUNT_ID },
      ]);
    });

    it('treats soft-deleted batch accounts as present (no salvage placeholder)', () => {
      const plan = importPlan({
        accountIds: ['soft-deleted-acc'],
        refs: [{ siteKey: 'transaction.accountId', accountId: 'soft-deleted-acc' }],
        rules: [
          {
            ruleKey: 'rule-1',
            sourceAccountId: 'soft-deleted-acc',
            categoryAccountId: 'soft-deleted-acc',
          },
        ],
      });

      expect(plan.missingAccountIds).toEqual([]);
      expect(plan.rulePatches).toEqual([]);
    });

    it('does not salvage SMS rule-only orphans (sanitize via rulePatches)', () => {
      const plan = importPlan({
        accountIds: ['acc-1'],
        refs: [],
        rules: [
          {
            ruleKey: 'rule-only',
            sourceAccountId: 'rule-orphan',
            categoryAccountId: 'acc-1',
          },
        ],
      });

      expect(plan.missingAccountIds).toEqual([]);
      expect(plan.rulePatches).toEqual([
        { ruleKey: 'rule-only', sourceAccountId: EMPTY_ACCOUNT_ID },
      ]);
    });
  });
});
