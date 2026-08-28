import { database } from '@/src/data/database/Database';
import Budget from '@/src/data/models/Budget';
import BudgetScope from '@/src/data/models/BudgetScope';
import { AccountType } from '@/src/types/enums';
import { AccountId, BudgetId, WorkplaceId } from '@/src/types/ids';

import { accountWriteRepository } from '@/src/data/repositories/account';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { Q } from '@nozbe/watermelondb';

describe('BudgetRepository', () => {
  let accountId1: string;
  let accountId2: string;

  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
    const a1 = await accountWriteRepository.create({
      name: 'Groceries',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
      workplaceId: 'wp-1' as WorkplaceId,
    });
    accountId1 = a1.id;

    const a2 = await accountWriteRepository.create({
      name: 'Dining Out',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
      workplaceId: 'wp-1' as WorkplaceId,
    });
    accountId2 = a2.id;
  });

  describe('CRUD operations', () => {
    it('should create a budget with scopes', async () => {
      const budget = await budgetRepository.create(
        'wp-1' as WorkplaceId,
        {
          name: 'Food',
          amount: 500,
          currencyCode: 'USD',
          startMonth: '2023-10',
        },
        [accountId1 as AccountId, accountId2 as AccountId],
      );

      expect(budget.id).toBeTruthy();
      expect(budget.name).toBe('Food');
      expect(budget.amount).toBe(500);

      const scopes = await budgetRepository.getScopes('wp-1' as WorkplaceId, budget.id as BudgetId);
      expect(scopes).toHaveLength(2);
      const scopeIds = scopes.map(s => s.accountId);
      expect(scopeIds).toContain(accountId1);
      expect(scopeIds).toContain(accountId2);
    });

    it('should update a budget and its scopes', async () => {
      const budget = await budgetRepository.create(
        'wp-1' as WorkplaceId,
        {
          name: 'Monthly Gas',
          amount: 500,
          startMonth: '2023-10',
          currencyCode: 'USD',
        },
        [accountId1 as AccountId],
      );

      await budgetRepository.update('wp-1' as WorkplaceId, budget, { amount: 600 }, [
        accountId2 as AccountId,
      ]);

      const updated = await budgetRepository.find('wp-1' as WorkplaceId, budget.id as BudgetId);
      expect(updated?.amount).toBe(600);

      const scopes = await budgetRepository.getScopes('wp-1' as WorkplaceId, budget.id as BudgetId);
      expect(scopes).toHaveLength(1);
      expect(scopes[0].accountId).toBe(accountId2);
    });

    it('should delete a budget and its scopes', async () => {
      const budget = await budgetRepository.create(
        'wp-1' as WorkplaceId,
        {
          name: 'Food',
          amount: 500,
          currencyCode: 'USD',
          startMonth: '2023-10',
        },
        [accountId1 as AccountId],
      );

      await budgetRepository.delete('wp-1' as WorkplaceId, budget);

      const deleted = await budgetRepository.find('wp-1' as WorkplaceId, budget.id as BudgetId);
      expect(deleted).toBeNull();

      const scopes = await budgetRepository.getScopes('wp-1' as WorkplaceId, budget.id as BudgetId);
      expect(scopes).toHaveLength(0);
    });

    it("does not delete another workplace's scope for the same budget id", async () => {
      const budget = await budgetRepository.create(
        'wp-1' as WorkplaceId,
        {
          name: 'Food',
          amount: 500,
          currencyCode: 'USD',
          startMonth: '2023-10',
        },
        [accountId1 as AccountId],
      );
      const budgetScopes = database.collections.get<BudgetScope>('budget_scopes');

      await database.write(async () => {
        await budgetScopes.create(scope => {
          scope.workplaceId = 'wp-2' as WorkplaceId;
          scope.budget.set(budget);
          scope.accountId = 'foreign-account' as AccountId;
          scope.createdAt = new Date();
          scope.updatedAt = new Date();
        });
      });

      await budgetRepository.delete('wp-1' as WorkplaceId, budget);

      const foreignScopes = await budgetScopes
        .query(Q.where('workplace_id', 'wp-2'), Q.where('budget_id', budget.id))
        .fetch();
      expect(foreignScopes).toHaveLength(1);
    });

    it('should allow removing all source accounts', async () => {
      const budget = await budgetRepository.create(
        'wp-1' as WorkplaceId,
        {
          name: 'Food',
          amount: 500,
          currencyCode: 'USD',
          startMonth: '2023-10',
          assetAccountIds: [accountId1 as AccountId],
        },
        [accountId1 as AccountId],
      );

      expect(budget.assetAccountIds).toBe(accountId1);

      await budgetRepository.update('wp-1' as WorkplaceId, budget, { assetAccountIds: [] }, [
        accountId1 as AccountId,
      ]);

      const updated = await budgetRepository.find('wp-1' as WorkplaceId, budget.id as BudgetId);
      expect(updated?.assetAccountIds).toBe('');
    });

    it('finds exact funding-account references without substring collisions', async () => {
      await budgetRepository.create(
        'wp-1' as WorkplaceId,
        {
          name: 'Source budget',
          amount: 100,
          currencyCode: 'USD',
          startMonth: '2023-10',
          assetAccountIds: ['acc-1' as AccountId],
        },
        [],
      );
      await budgetRepository.create(
        'wp-1' as WorkplaceId,
        {
          name: 'Prefix collision budget',
          amount: 100,
          currencyCode: 'USD',
          startMonth: '2023-10',
          assetAccountIds: ['acc-10' as AccountId],
        },
        [],
      );

      const matches = await budgetRepository.findAllReferencingAssetAccountId(
        'wp-1' as WorkplaceId,
        'acc-1' as AccountId,
      );

      expect(matches).toHaveLength(1);
      expect(matches[0].name).toBe('Source budget');
    });
  });

  describe('prepareMergeOperations', () => {
    it('retargets scoped references, deduplicates funding ids, and keeps scope operations first', async () => {
      const workplaceId = 'wp-1' as WorkplaceId;
      const foreignWorkplaceId = 'wp-2' as WorkplaceId;
      const sourceAccountId = accountId1 as AccountId;
      const targetAccountId = accountId2 as AccountId;

      const localBudget = await budgetRepository.create(
        workplaceId,
        {
          name: 'Local Food',
          amount: 500,
          currencyCode: 'USD',
          startMonth: '2023-10',
          assetAccountIds: [sourceAccountId, targetAccountId],
        },
        [sourceAccountId],
      );
      const foreignBudget = await budgetRepository.create(
        foreignWorkplaceId,
        {
          name: 'Foreign Food',
          amount: 500,
          currencyCode: 'USD',
          startMonth: '2023-10',
          assetAccountIds: [sourceAccountId],
        },
        [sourceAccountId],
      );

      const operations = await budgetRepository.prepareMergeOperations(
        workplaceId,
        [sourceAccountId, sourceAccountId],
        targetAccountId,
      );

      expect(operations).toHaveLength(2);
      expect(operations[0]).toBeInstanceOf(BudgetScope);
      expect(operations[1]).toBeInstanceOf(Budget);

      await database.write(async () => {
        await database.batch(operations);
      });

      const localScopes = await budgetRepository.getScopes(workplaceId, localBudget.id as BudgetId);
      expect(localScopes[0].accountId).toBe(targetAccountId);
      expect((await budgetRepository.find(workplaceId, localBudget.id))?.assetAccountIds).toBe(
        targetAccountId,
      );

      const foreignScopes = await budgetRepository.getScopes(
        foreignWorkplaceId,
        foreignBudget.id as BudgetId,
      );
      expect(foreignScopes[0].accountId).toBe(sourceAccountId);
      expect(
        (await budgetRepository.find(foreignWorkplaceId, foreignBudget.id))?.assetAccountIds,
      ).toBe(sourceAccountId);
    });
  });
});
