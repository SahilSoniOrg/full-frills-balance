import { database } from '@/src/data/database/Database';
import { AccountType } from '@/src/data/models/Account';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { AccountId, BudgetId, WorkplaceId } from '@/src/types/domain';

describe('BudgetRepository', () => {
  let accountId1: string;
  let accountId2: string;

  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
    const a1 = await accountRepository.create({
      name: 'Groceries',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
      workplaceId: 'wp-1' as WorkplaceId,
    });
    accountId1 = a1.id;

    const a2 = await accountRepository.create({
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

    it('should fetch only active budgets for specified workplace', async () => {
      const b1 = await budgetRepository.create(
        'wp-1' as WorkplaceId,
        {
          name: 'Active Budget',
          amount: 500,
          currencyCode: 'USD',
          startMonth: '2023-10',
          active: true,
        },
        [accountId1 as AccountId],
      );

      await budgetRepository.create(
        'wp-1' as WorkplaceId,
        {
          name: 'Inactive Budget',
          amount: 300,
          currencyCode: 'USD',
          startMonth: '2023-10',
          active: false,
        },
        [accountId1 as AccountId],
      );

      await budgetRepository.create(
        'wp-2' as WorkplaceId,
        {
          name: 'Other Workplace Active Budget',
          amount: 400,
          currencyCode: 'USD',
          startMonth: '2023-10',
          active: true,
        },
        [accountId1 as AccountId],
      );

      const activeBudgetsWp1 = await budgetRepository.fetchActive('wp-1' as WorkplaceId);
      expect(activeBudgetsWp1).toHaveLength(1);
      expect(activeBudgetsWp1[0].id).toBe(b1.id);
      expect(activeBudgetsWp1[0].name).toBe('Active Budget');
    });
  });
});
