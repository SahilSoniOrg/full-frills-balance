import { parseBudgetAssetAccountIds } from '@/src/services/budget/budgetAssetAccountIds';
import { AccountId, BudgetId } from '@/src/types/ids';
import { PlainBudget, PlainBudgetScope } from '@/src/types/plainDtos';

export interface BudgetEditDraft {
  name: string;
  amount: string;
  currencyCode: string;
  startMonth: Date;
  intervalType: string;
  intervalN: number;
  recurrenceDay?: number;
  recurrenceMonth?: number;
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
    startDate: undefined,
    selectedAccountIds: [],
    assetAccountIds: [],
  };
}

export function mapBudgetToEditDraft(
  budget: PlainBudget,
  scopes: PlainBudgetScope[],
  fallbackCurrency: string,
): BudgetEditDraft {
  const [year, month] = (budget.startMonth ?? '').split('-');
  const intervalType = budget.intervalType || 'MONTHLY';
  return {
    name: budget.name,
    amount: budget.amount.toString(),
    currencyCode: budget.currencyCode || fallbackCurrency,
    startMonth: new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1),
    intervalType,
    intervalN: budget.intervalN || 1,
    ...(intervalType !== 'DAILY' && { recurrenceDay: budget.recurrenceDay ?? 1 }),
    ...(intervalType === 'YEARLY' && { recurrenceMonth: budget.recurrenceMonth || 1 }),
    startDate: budget.startDate,
    selectedAccountIds: scopes.map(s => s.accountId),
    assetAccountIds: parseBudgetAssetAccountIds(budget.assetAccountIds),
  };
}

/**
 * Seed once per budgetId when the observed record first arrives.
 * Later observe ticks must NOT re-seed (preserves dirty draft).
 */
export function shouldSeedBudgetDraft(args: {
  budgetId: BudgetId | undefined;
  seededBudgetId: BudgetId | null;
  observedBudget: PlainBudget | null;
  scopesReady: boolean;
}): boolean {
  const { budgetId, seededBudgetId, observedBudget, scopesReady } = args;
  if (!budgetId || !scopesReady || !observedBudget) return false;
  if (observedBudget.id !== budgetId) return false;
  return seededBudgetId !== budgetId;
}
