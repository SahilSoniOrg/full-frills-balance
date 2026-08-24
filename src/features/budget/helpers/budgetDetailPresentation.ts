import { BudgetId } from '@/src/types/ids';
import { PlainBudget } from '@/src/types/plainDtos';

export interface BudgetUsagePreview {
  spent: number;
  remaining: number;
  budgetAmount: number;
  usagePercent: number;
}

export interface BudgetDetailPreviewInput {
  budgetId: BudgetId;
  name?: string;
  amount?: string;
  currency?: string;
  period?: string;
  baseCurrency: string;
}

function parsePreviewAmount(amount?: string): number {
  return amount ? parseFloat(amount) : 0;
}

export function buildBudgetDetailPreview(input: BudgetDetailPreviewInput): PlainBudget | null {
  if (!input.name) return null;

  const period = input.period || 'MONTHLY';
  return {
    id: input.budgetId,
    name: input.name,
    amount: parsePreviewAmount(input.amount),
    currencyCode: input.currency || input.baseCurrency,
    intervalType: period,
    periodType: period,
    intervalN: 1,
  };
}

export function buildBudgetUsagePreview(
  input: Pick<BudgetDetailPreviewInput, 'name' | 'amount'>,
): BudgetUsagePreview | null {
  if (!input.name) return null;

  const budgetAmount = parsePreviewAmount(input.amount);
  return {
    spent: 0,
    remaining: budgetAmount,
    budgetAmount,
    usagePercent: 0,
  };
}
