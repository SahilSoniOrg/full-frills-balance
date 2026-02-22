import Budget from '@/src/data/models/Budget'
import { BudgetInput, budgetRepository } from '@/src/data/repositories/BudgetRepository'

export class BudgetWriteService {
    /**
     * Creates a new budget with the specified scope accounts.
     */
    async createBudget(data: BudgetInput, accountIds: string[]): Promise<Budget> {
        return await budgetRepository.create(data, accountIds)
    }

    /**
     * Updates a budget and replaces its scopes with the new account IDs.
     */
    async updateBudget(budget: Budget, data: Partial<BudgetInput>, accountIds: string[]): Promise<Budget> {
        return await budgetRepository.update(budget, data, accountIds)
    }

    /**
     * Hard-deletes a budget and all its scopes.
     */
    async deleteBudget(budget: Budget): Promise<void> {
        return await budgetRepository.delete(budget)
    }
}

export const budgetWriteService = new BudgetWriteService()
