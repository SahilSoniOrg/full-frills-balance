import BudgetScope from '@/src/data/models/BudgetScope';
import { observeQueryWithModelChanges } from '@/src/data/repositories/observeQueryWithModelChanges';
import { AccountId, BudgetId, WorkplaceId } from '@/src/types/ids';
import { Q } from '@nozbe/watermelondb';
import { budgetScopesCollection } from './budgetCollections';

export function observeBudgetScopes(workplaceId: WorkplaceId, budgetId: BudgetId) {
  return observeQueryWithModelChanges(
    budgetScopesCollection().query(
      Q.where('workplace_id', workplaceId),
      Q.where('budget_id', budgetId),
    ),
  );
}

export function observeAllBudgetScopes(workplaceId: WorkplaceId) {
  return observeQueryWithModelChanges(
    budgetScopesCollection().query(Q.where('workplace_id', workplaceId)),
  );
}

export async function getBudgetScopes(
  workplaceId: WorkplaceId,
  budgetId: BudgetId,
): Promise<BudgetScope[]> {
  return await budgetScopesCollection()
    .query(Q.where('workplace_id', workplaceId), Q.where('budget_id', budgetId))
    .fetch();
}

export async function getBudgetScopesByBudgetIds(
  workplaceId: WorkplaceId,
  budgetIds: BudgetId[],
): Promise<BudgetScope[]> {
  if (budgetIds.length === 0) return [];
  return await budgetScopesCollection()
    .query(Q.where('workplace_id', workplaceId), Q.where('budget_id', Q.oneOf(budgetIds)))
    .fetch();
}

export async function findAllScopesByAccountIds(
  workplaceId: WorkplaceId,
  accountIds: AccountId[],
): Promise<BudgetScope[]> {
  if (accountIds.length === 0) return [];
  return await budgetScopesCollection()
    .query(Q.where('workplace_id', workplaceId), Q.where('account_id', Q.oneOf(accountIds)))
    .fetch();
}
