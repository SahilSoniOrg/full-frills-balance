import Budget from '@/src/data/models/Budget';
import { BudgetInput, budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { analytics } from '@/src/services/analytics-service';
import { WorkplaceId } from '@/src/types/domain';

export class BudgetWriteService {
  /**
   * Creates a new budget with the specified scope accounts.
   */
  async createBudget(
    workplaceId: WorkplaceId,
    data: BudgetInput,
    accountIds: string[],
  ): Promise<Budget> {
    const budget = await budgetRepository.create(workplaceId, data, accountIds);

    // Track Analytics
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
    budget: Budget,
    data: Partial<BudgetInput>,
    accountIds: string[],
  ): Promise<Budget> {
    const updatedBudget = await budgetRepository.update(workplaceId, budget, data, accountIds);

    // Track Analytics
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
  async deleteBudget(workplaceId: WorkplaceId, budget: Budget): Promise<void> {
    await budgetRepository.delete(workplaceId, budget);

    // Track Analytics
    analytics.trackFeatureUsage('budget', 'delete', {
      budget_id: budget.id,
      budget_name: budget.name,
    });
  }
}

export const budgetWriteService = new BudgetWriteService();
