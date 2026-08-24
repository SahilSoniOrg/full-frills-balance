import { CategoryBreakdown, ExpenseCategory } from '@/src/services/reports/reportSnapshot';
import { formatCategoryLabel } from '@/src/services/reports/reportCategoryLabel';
import { AccountId } from '@/src/types/ids';

export type BreakdownLegendEntry = {
  id: string;
  accountName: string;
  amount: number;
  percentage: number;
  color?: string;
  accountIds: AccountId[];
};

export function mapAccountBreakdownToLegendEntry(entry: ExpenseCategory): BreakdownLegendEntry {
  return {
    id: entry.accountId,
    accountName: entry.accountName,
    amount: entry.amount,
    percentage: entry.percentage,
    color: entry.color,
    accountIds: [entry.accountId],
  };
}

export function mapCategoryBreakdownToLegendEntries(
  categories: CategoryBreakdown[],
): BreakdownLegendEntry[] {
  return categories.map(category => ({
    id: category.category,
    accountName: formatCategoryLabel(category.category),
    amount: category.amount,
    percentage: category.percentage,
    color: category.color,
    accountIds: category.accountIds,
  }));
}
