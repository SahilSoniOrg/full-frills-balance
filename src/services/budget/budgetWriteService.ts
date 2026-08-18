import Budget from '@/src/data/models/Budget';
import BudgetScope from '@/src/data/models/BudgetScope';
import { BudgetInput, budgetRepository } from '@/src/data/repositories/BudgetRepository';
import {
  assertWritable,
  formatFundingAccountIds,
  parseFundingAccountIds,
} from '@/src/services/accounts/accountReferenceGraph';
import { analytics } from '@/src/services/analytics-service';
import { BudgetId, AccountId, WorkplaceId } from '@/src/types/domain';

export class BudgetWriteService {
  /**
   * Creates a new budget with the specified scope accounts.
   */
  async createBudget(
    workplaceId: WorkplaceId,
    data: BudgetInput,
    accountIds: AccountId[],
  ): Promise<Budget> {
    await assertWritable(workplaceId, [...accountIds, ...(data.assetAccountIds ?? [])], 'Budget');
    const budget = await budgetRepository.create(workplaceId, data, accountIds);

    analytics.logBudgetCreated(data.amount, data.currencyCode);
    analytics.trackFeatureUsage('budget', 'create', {
      amount: data.amount,
      currency: data.currencyCode,
      account_count: accountIds.length,
      start_month: data.startMonth,
    });

    return budget;
  }

  /**
   * Updates a budget and replaces its scopes with the new account IDs.
   */
  async updateBudget(
    workplaceId: WorkplaceId,
    budgetId: BudgetId,
    data: Partial<BudgetInput>,
    accountIds: AccountId[],
  ): Promise<Budget> {
    await assertWritable(workplaceId, [...accountIds, ...(data.assetAccountIds ?? [])], 'Budget');
    const budget = await budgetRepository.find(workplaceId, budgetId);
    if (!budget) {
      throw new Error('Budget not found');
    }
    const updatedBudget = await budgetRepository.update(workplaceId, budget, data, accountIds);

    analytics.trackFeatureUsage('budget', 'update', {
      budget_id: budget.id,
      amount_changed: data.amount !== undefined && data.amount !== budget.amount,
      account_count: accountIds.length,
    });

    return updatedBudget;
  }

  /**
   * Hard-deletes a budget and all its scopes.
   */
  async deleteBudget(workplaceId: WorkplaceId, budgetId: BudgetId): Promise<void> {
    const budget = await budgetRepository.find(workplaceId, budgetId);
    if (!budget) {
      throw new Error('Budget not found');
    }
    await budgetRepository.delete(workplaceId, budget);

    analytics.trackFeatureUsage('budget', 'delete', {
      budget_id: budget.id,
      budget_name: budget.name,
    });
  }

  /**
   * Prepares WatermelonDB operations to merge budgets from source accounts to a target account.
   */
  async prepareMergeOperations(
    workplaceId: WorkplaceId,
    sourceAccountIds: AccountId[],
    targetAccountId: AccountId,
  ): Promise<(Budget | BudgetScope)[]> {
    const scopes = await budgetRepository.findAllScopesByAccountIds(workplaceId, sourceAccountIds);
    const budgets = await budgetRepository.findAllWithAssetAccountIds(workplaceId);

    const scopeOps = scopes.map((s: BudgetScope) =>
      s.prepareUpdate((r: BudgetScope) => {
        r.accountId = targetAccountId;
        r.updatedAt = new Date();
      }),
    );

    const sourceIdsSet = new Set(sourceAccountIds);

    const budgetOps: Budget[] = [];
    for (const budget of budgets) {
      if (!budget.assetAccountIds) continue;
      let changed = false;
      const ids = parseFundingAccountIds(budget.assetAccountIds).map(id => {
        if (sourceIdsSet.has(id as AccountId)) {
          changed = true;
          return targetAccountId;
        }
        return id;
      });
      if (changed) {
        budgetOps.push(
          budget.prepareUpdate((r: Budget) => {
            r.assetAccountIds = formatFundingAccountIds([...new Set(ids)]);
            r.updatedAt = new Date();
          }),
        );
      }
    }

    return [...scopeOps, ...budgetOps];
  }
}

export const budgetWriteService = new BudgetWriteService();
