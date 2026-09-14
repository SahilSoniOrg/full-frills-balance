import Budget from '@/src/data/models/Budget';
import { BudgetInput, budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { assertWritable } from '@/src/services/accounts/accountReferenceGraph';
import { analytics } from '@/src/services/analytics';
import { BudgetId, AccountId, WorkplaceId } from '@/src/types/ids';

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

  async upsertByName(
    workplaceId: WorkplaceId,
    data: BudgetInput,
    accountIds: AccountId[],
  ): Promise<void> {
    const existing = await budgetRepository.findAllActive(workplaceId);
    const match = existing.find(
      budget => budget.name.trim().toLowerCase() === data.name.trim().toLowerCase(),
    );
    if (match) {
      await this.updateBudget(workplaceId, match.id, data, accountIds);
      return;
    }
    await this.createBudget(workplaceId, data, accountIds);
  }

  /** Hard-deletes a budget and all its scopes. */
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
}

export const budgetWriteService = new BudgetWriteService();
