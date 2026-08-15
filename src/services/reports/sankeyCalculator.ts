import { AppConfig } from '@/src/constants/app-config';
import { formatCategoryLabel } from '@/src/services/reports/reportCategoryLabel';
import type { CategoryBreakdown } from '@/src/services/reports/reportTypes';
import { roundToPrecision } from '@/src/utils/money';

export interface SankeyNode {
  id: string;
  name: string;
  color?: string;
  /** Share of total inflow (0–100). Omitted for the hub node. */
  percentOfIncome?: number;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

export interface SankeySummary {
  totalIncome: number;
  totalExpense: number;
  surplus: number;
  deficit: number;
}

export interface SankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
  summary: SankeySummary;
}

type CategoryBreakdownAmount = Pick<CategoryBreakdown, 'category' | 'amount'>;

const EMPTY_SUMMARY: SankeySummary = {
  totalIncome: 0,
  totalExpense: 0,
  surplus: 0,
  deficit: 0,
};

function categoryNodeId(prefix: 'inc' | 'exp', category: string): string {
  return `${prefix}_${category}`;
}

function percentOfIncome(amount: number, totalIncome: number): number | undefined {
  if (totalIncome <= 0 || amount <= 0) return undefined;
  return roundToPrecision((amount / totalIncome) * 100, amount / totalIncome < 0.01 ? 1 : 0);
}

function resolveIncomeLabel(category: string, expenseLabels: Set<string>): string {
  const label = formatCategoryLabel(category);
  return expenseLabels.has(label) ? AppConfig.strings.reports.sankeyIncomeLabel(label) : label;
}

function resolveExpenseLabel(category: string, incomeLabels: Set<string>): string {
  const label = formatCategoryLabel(category);
  return incomeLabels.has(label) ? AppConfig.strings.reports.sankeyExpenseLabel(label) : label;
}

/**
 * Builds money-flow sankey data from income and expense category breakdowns.
 * Both sides use accountSubtype buckets so the chart matches the category donuts.
 */
export function calculateSankeyDataFromSummaries(
  incomeCategorySummary: CategoryBreakdownAmount[],
  expenseCategorySummary: CategoryBreakdownAmount[],
): SankeyData {
  const totalIncome = incomeCategorySummary.reduce((sum, item) => sum + item.amount, 0);
  const totalExpense = expenseCategorySummary.reduce((sum, item) => sum + item.amount, 0);
  const deficit = Math.max(0, totalExpense - totalIncome);
  const surplus = Math.max(0, totalIncome - totalExpense);

  const incomeLabels = new Set(
    incomeCategorySummary.map(item => formatCategoryLabel(item.category)),
  );
  const expenseLabels = new Set(
    expenseCategorySummary.map(item => formatCategoryLabel(item.category)),
  );

  const nodes: SankeyNode[] = [
    { id: 'total_income', name: AppConfig.strings.reports.sankeyTotalIncome },
  ];
  const links: SankeyLink[] = [];

  incomeCategorySummary.forEach(item => {
    const id = categoryNodeId('inc', item.category);
    nodes.push({
      id,
      name: resolveIncomeLabel(item.category, expenseLabels),
      percentOfIncome: percentOfIncome(item.amount, totalIncome + deficit),
    });
    links.push({ source: id, target: 'total_income', value: item.amount });
  });

  if (deficit > 0) {
    nodes.push({
      id: 'drawdown',
      name: AppConfig.strings.reports.sankeyDrawdown,
      percentOfIncome: percentOfIncome(deficit, totalIncome + deficit),
    });
    links.push({ source: 'drawdown', target: 'total_income', value: deficit });
  }

  expenseCategorySummary.forEach(item => {
    const id = categoryNodeId('exp', item.category);
    nodes.push({
      id,
      name: resolveExpenseLabel(item.category, incomeLabels),
      percentOfIncome: percentOfIncome(item.amount, totalIncome + deficit),
    });
    links.push({ source: 'total_income', target: id, value: item.amount });
  });

  if (surplus > 0) {
    nodes.push({
      id: 'surplus',
      name: AppConfig.strings.reports.sankeySurplus,
      percentOfIncome: percentOfIncome(surplus, totalIncome + deficit),
    });
    links.push({ source: 'total_income', target: 'surplus', value: surplus });
  }

  return {
    nodes,
    links,
    summary: { totalIncome, totalExpense, surplus, deficit },
  };
}

export function emptySankeyData(): SankeyData {
  return { nodes: [], links: [], summary: { ...EMPTY_SUMMARY } };
}
