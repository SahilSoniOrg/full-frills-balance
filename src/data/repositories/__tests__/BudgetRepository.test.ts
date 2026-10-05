import { database } from '@/src/data/database/Database';
import BudgetScope from '@/src/data/models/BudgetScope';
import { AccountType } from '@/src/types/enums';
import { AccountId, BudgetId, WorkplaceId } from '@/src/types/ids';

import { accountWriteRepository } from '@/src/data/repositories/account';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { Q } from '@nozbe/watermelondb';
import { map } from 'rxjs/operators';
import { observeAfterInitial } from '@/src/testing/observeAfterInitial';
import { deleteAccount } from '@/src/services/accounts/accountDeleteCommands';
import { assertWritable } from '@/src/services/accounts/accountReferenceGraph';
import { budgetWriteService } from '@/src/services/budget/budgetWriteService';
import { resetDatabase } from '@/src/testing/resetDatabase';

describe('BudgetRepository', () => {
  let accountId1: string;
  let accountId2: string;

  beforeEach(async () => {
    await resetDatabase();
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
    it('publishes budget, scopes, and audit in one batch and publishes nothing on batch failure', async () => {
      const batch = jest.spyOn(database, 'batch');
      batch.mockRejectedValueOnce(new Error('injected publication failure'));
      await expect(
        budgetRepository.create(
          'wp-1' as WorkplaceId,
          {
            name: 'Atomic',
            amount: 100,
            currencyCode: 'USD',
            startMonth: '2026-09',
          },
          [accountId1 as AccountId],
        ),
      ).rejects.toThrow('injected publication failure');
      expect(batch).toHaveBeenCalledTimes(1);
      expect(await database.collections.get('budgets').query().fetchCount()).toBe(0);
      expect(await database.collections.get('budget_scopes').query().fetchCount()).toBe(0);
      expect(await database.collections.get('audit_logs').query().fetchCount()).toBe(0);
      batch.mockRestore();
    });

    it('publishes the complete created budget graph with one atomic batch', async () => {
      const batch = jest.spyOn(database, 'batch');
      const budget = await budgetRepository.create(
        'wp-1' as WorkplaceId,
        {
          name: 'Atomic success',
          amount: 100,
          currencyCode: 'USD',
          startMonth: '2026-09',
        },
        [accountId1 as AccountId],
      );
      expect(batch).toHaveBeenCalledTimes(1);
      expect(
        await budgetRepository.getScopes('wp-1' as WorkplaceId, budget.id as BudgetId),
      ).toHaveLength(1);
      expect(await database.collections.get('audit_logs').query().fetchCount()).toBe(1);
      batch.mockRestore();
    });

    it('serializes budget publication against account deletion in the owning writer', async () => {
      let entered!: () => void;
      let release!: () => void;
      const validatorEntered = new Promise<void>(resolve => {
        entered = resolve;
      });
      const validationGate = new Promise<void>(resolve => {
        release = resolve;
      });
      const create = budgetRepository.create(
        'wp-1' as WorkplaceId,
        {
          name: 'Race budget',
          amount: 100,
          currencyCode: 'USD',
          startMonth: '2026-09',
        },
        [accountId1 as AccountId],
        async () => {
          entered();
          await validationGate;
          await assertWritable('wp-1' as WorkplaceId, [accountId1 as AccountId], 'Budget');
        },
      );
      await validatorEntered;
      const deletion = deleteAccount(accountId1 as AccountId, 'wp-1' as WorkplaceId);
      const deletionResult = expect(deletion).rejects.toThrow(/cannot be deleted while referenced/);
      release();
      await create;
      await deletionResult;
      expect(
        await budgetRepository.findAllReferencingAssetAccountId(
          'wp-1' as WorkplaceId,
          accountId1 as AccountId,
        ),
      ).toHaveLength(0);
      expect(
        await budgetRepository.getScopes(
          'wp-1' as WorkplaceId,
          (await budgetRepository.findAllActive('wp-1' as WorkplaceId))[0].id,
        ),
      ).toHaveLength(1);
    });

    it('rejects creation when account deletion committed before the writer validation', async () => {
      await deleteAccount(accountId1 as AccountId, 'wp-1' as WorkplaceId);
      await expect(
        budgetRepository.create(
          'wp-1' as WorkplaceId,
          {
            name: 'Dangling attempt',
            amount: 100,
            currencyCode: 'USD',
            startMonth: '2026-09',
          },
          [accountId1 as AccountId],
          () => assertWritable('wp-1' as WorkplaceId, [accountId1 as AccountId], 'Budget'),
        ),
      ).rejects.toThrow(/missing or deleted account/);
      expect(await database.collections.get('budgets').query().fetchCount()).toBe(0);
    });

    it('rejects a budget scope update that reintroduces an account deleted first', async () => {
      const budget = await budgetRepository.create(
        'wp-1' as WorkplaceId,
        {
          name: 'Update guard',
          amount: 100,
          currencyCode: 'USD',
          startMonth: '2026-09',
        },
        [accountId2 as AccountId],
      );
      await deleteAccount(accountId1 as AccountId, 'wp-1' as WorkplaceId);
      await expect(
        budgetWriteService.updateBudget(
          'wp-1' as WorkplaceId,
          budget.id as BudgetId,
          { amount: 200 },
          [accountId1 as AccountId],
        ),
      ).rejects.toThrow(/missing or deleted account/);
      expect(
        (await budgetRepository.find('wp-1' as WorkplaceId, budget.id as BudgetId))?.amount,
      ).toBe(100);
      expect(
        (await budgetRepository.getScopes('wp-1' as WorkplaceId, budget.id as BudgetId))[0]
          .accountId,
      ).toBe(accountId2);
    });

    it('blocks deletion when an in-flight budget publishes a funding-account reference', async () => {
      let entered!: () => void;
      let release!: () => void;
      const enteredValidation = new Promise<void>(resolve => {
        entered = resolve;
      });
      const gate = new Promise<void>(resolve => {
        release = resolve;
      });
      const create = budgetRepository.create(
        'wp-1' as WorkplaceId,
        {
          name: 'Funding race',
          amount: 100,
          currencyCode: 'USD',
          startMonth: '2026-09',
          assetAccountIds: [accountId1 as AccountId],
        },
        [],
        async () => {
          entered();
          await gate;
          await assertWritable('wp-1' as WorkplaceId, [accountId1 as AccountId], 'Budget');
        },
      );
      await enteredValidation;
      const deletion = deleteAccount(accountId1 as AccountId, 'wp-1' as WorkplaceId);
      const deletionResult = expect(deletion).rejects.toThrow(/cannot be deleted while referenced/);
      release();
      await create;
      await deletionResult;
      expect(
        await budgetRepository.findAllReferencingAssetAccountId(
          'wp-1' as WorkplaceId,
          accountId1 as AccountId,
        ),
      ).toHaveLength(1);
    });
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

    it('re-emits budget list and detail when recurrence fields change', async () => {
      const workplaceId = 'wp-1' as WorkplaceId;
      const budget = await budgetRepository.create(
        workplaceId,
        {
          name: 'Monthly Food',
          amount: 500,
          currencyCode: 'USD',
          startMonth: '2023-10',
          intervalType: 'MONTHLY',
          recurrenceDay: 1,
        },
        [accountId1 as AccountId],
      );
      const detail = observeAfterInitial(
        budgetRepository.observeById(workplaceId, budget.id).pipe(map(item => item?.recurrenceDay)),
      );
      const activeList = observeAfterInitial(
        budgetRepository
          .observeAllActive(workplaceId)
          .pipe(map(items => items.find(item => item.id === budget.id)?.recurrenceDay)),
      );

      await Promise.all([detail.initial, activeList.initial]);
      await budgetRepository.update(workplaceId, budget, { recurrenceDay: 15 }, [
        accountId1 as AccountId,
      ]);

      await expect(Promise.all([detail.nextValue, activeList.nextValue])).resolves.toEqual([
        15, 15,
      ]);
    });

    it('re-emits scopes when an existing scope is moved to another account', async () => {
      const workplaceId = 'wp-1' as WorkplaceId;
      const budget = await budgetRepository.create(
        workplaceId,
        { name: 'Food', amount: 500, currencyCode: 'USD', startMonth: '2023-10' },
        [accountId1 as AccountId],
      );
      const scopes = observeAfterInitial(
        budgetRepository
          .observeScopes(workplaceId, budget.id)
          .pipe(map(items => items[0]?.accountId)),
      );

      await scopes.initial;
      const [scope] = await budgetRepository.getScopes(workplaceId, budget.id);
      await database.write(async () => {
        await scope.update(record => {
          record.accountId = accountId2 as AccountId;
          record.updatedAt = new Date();
        });
      });

      await expect(scopes.nextValue).resolves.toBe(accountId2);
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
});
