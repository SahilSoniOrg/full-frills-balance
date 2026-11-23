import { database } from '@/src/data/database/Database';
import Budget from '@/src/data/models/Budget';
import BudgetScope from '@/src/data/models/BudgetScope';

export function budgetsCollection() {
  return database.collections.get<Budget>('budgets');
}

export function budgetScopesCollection() {
  return database.collections.get<BudgetScope>('budget_scopes');
}
