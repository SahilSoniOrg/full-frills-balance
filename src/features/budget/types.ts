import Budget from '@/src/data/models/Budget'
import { BudgetUsage } from '@/src/services/budget/budgetReadService'

// Represents a budget along with its reactive usage stats
export interface BudgetItem {
    budget: Budget
    usage: BudgetUsage
}
