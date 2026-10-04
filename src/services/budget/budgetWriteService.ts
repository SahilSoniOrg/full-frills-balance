import Budget from '@/src/data/models/Budget';
import { BudgetInput, budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { assertWritable } from '@/src/services/accounts/accountReferenceGraph';
import { analytics } from '@/src/services/analytics';
import { BudgetId, AccountId, WorkplaceId } from '@/src/types/ids';
import { isValidRepeatCount } from '@/src/utils/recurrenceLabels';

/**
 * Creates a new budget with the specified scope accounts.
 */
export async function createBudget(
  workplaceId: WorkplaceId,
  data: BudgetInput,
  accountIds: AccountId[],
): Promise<Budget> {
  if (!isValidRepeatCount(data.intervalN ?? 1)) {
    throw new Error('Enter a whole number from 1 to 9999.');
  }
  const budget = await budgetRepository.create(workplaceId, data, accountIds, () =>
    assertWritable(workplaceId, [...accountIds, ...(data.assetAccountIds ?? [])], 'Budget'),
  );

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
export async function updateBudget(
  workplaceId: WorkplaceId,
  budgetId: BudgetId,
  data: Partial<BudgetInput>,
  accountIds: AccountId[],
): Promise<Budget> {
  if (data.intervalN !== undefined && !isValidRepeatCount(data.intervalN)) {
    throw new Error('Enter a whole number from 1 to 9999.');
  }
  const budget = await budgetRepository.find(workplaceId, budgetId);
  if (!budget) {
    throw new Error('Budget not found');
  }
  const updatedBudget = await budgetRepository.update(workplaceId, budget, data, accountIds, () =>
    assertWritable(workplaceId, [...accountIds, ...(data.assetAccountIds ?? [])], 'Budget'),
  );

  analytics.trackFeatureUsage('budget', 'update', {
    budget_id: budget.id,
    amount_changed: data.amount !== undefined && data.amount !== budget.amount,
    account_count: accountIds.length,
  });

  return updatedBudget;
}

export async function upsertBudgetByName(
  workplaceId: WorkplaceId,
  data: BudgetInput,
  accountIds: AccountId[],
): Promise<void> {
  const existing = await budgetRepository.findAllActive(workplaceId);
  const match = existing.find(
    budget => budget.name.trim().toLowerCase() === data.name.trim().toLowerCase(),
  );
  if (match) {
    await updateBudget(workplaceId, match.id, data, accountIds);
    return;
  }
  await createBudget(workplaceId, data, accountIds);
}

/** Hard-deletes a budget and all its scopes. */
export async function deleteBudget(workplaceId: WorkplaceId, budgetId: BudgetId): Promise<void> {
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

export const budgetWriteService = {
  createBudget,
  updateBudget,
  upsertByName: upsertBudgetByName,
  deleteBudget,
};
