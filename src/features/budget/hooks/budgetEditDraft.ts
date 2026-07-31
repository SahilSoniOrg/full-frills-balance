import Budget from '@/src/data/models/Budget';
import BudgetScope from '@/src/data/models/BudgetScope';
import { AccountId, BudgetId } from '@/src/types/domain';

export interface BudgetEditDraft {
  name: string;
  amount: string;
  currencyCode: string;
  startMonth: Date;
  intervalType: string;
  intervalN: number;
  recurrenceDay: number;
  recurrenceMonth: number;
  startDate: number | undefined;
  selectedAccountIds: AccountId[];
  assetAccountIds: AccountId[];
}

export function createEmptyBudgetDraft(preview: {
  name?: string;
  amount?: string;
  currencyCode: string;
}): BudgetEditDraft {
  return {
    name: preview.name || '',
    amount: preview.amount || '',
    currencyCode: preview.currencyCode,
    startMonth: new Date(),
    intervalType: 'MONTHLY',
    intervalN: 1,
    recurrenceDay: 1,
    recurrenceMonth: 1,
    startDate: undefined,
    selectedAccountIds: [],
    assetAccountIds: [],
  };
}

export function mapBudgetToEditDraft(
  budget: Budget,
  scopes: BudgetScope[],
  fallbackCurrency: string,
): BudgetEditDraft {
  const [year, month] = budget.startMonth.split('-');
  return {
    name: budget.name,
    amount: budget.amount.toString(),
    currencyCode: budget.currencyCode || fallbackCurrency,
    startMonth: new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1),
    intervalType: budget.intervalType || 'MONTHLY',
    intervalN: budget.intervalN || 1,
    recurrenceDay: budget.recurrenceDay || 1,
    recurrenceMonth: budget.recurrenceMonth || 1,
    startDate: budget.startDate,
    selectedAccountIds: scopes.map(s => s.accountId),
    assetAccountIds: budget.assetAccountIds
      ? (budget.assetAccountIds.split(',') as AccountId[])
      : [],
  };
}

/**
 * Seed once per budgetId when the observed record first arrives.
 * Later observe ticks must NOT re-seed (preserves dirty draft).
 */
export function shouldSeedBudgetDraft(args: {
  budgetId: BudgetId | undefined;
  seededBudgetId: BudgetId | null;
  observedBudget: Budget | null;
  scopesReady: boolean;
}): boolean {
  const { budgetId, seededBudgetId, observedBudget, scopesReady } = args;
  if (!budgetId || !scopesReady || !observedBudget) return false;
  if (observedBudget.id !== budgetId) return false;
  return seededBudgetId !== budgetId;
}
