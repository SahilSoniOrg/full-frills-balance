import { AppConfig } from '@/src/constants/app-config';

export interface CategoryBreakdownInput {
  category: string;
  amount: number;
}

export interface ExpenseCategoryInput {
  accountId: string;
  accountName: string;
  amount: number;
}

export interface SankeyNode {
  id: string;
  name: string;
  color?: string;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

export interface SankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

export function calculateSankeyDataFromSummaries(
  incomeSummary: ExpenseCategoryInput[],
  expenseCategorySummary: CategoryBreakdownInput[],
): SankeyData {
  const nodes: SankeyNode[] = [
    { id: 'total_income', name: AppConfig.strings.reports.sankeyTotalIncome },
    { id: 'surplus', name: AppConfig.strings.reports.sankeySurplus },
  ];

  const links: SankeyLink[] = [];

  // Income -> Total
  incomeSummary.forEach(inc => {
    nodes.push({ id: `inc_${inc.accountId}`, name: inc.accountName });
    links.push({ source: `inc_${inc.accountId}`, target: 'total_income', value: inc.amount });
  });

  // Total -> Categories
  let totalExpense = 0;
  expenseCategorySummary.forEach(cat => {
    nodes.push({ id: `exp_${cat.category}`, name: cat.category });
    links.push({ source: 'total_income', target: `exp_${cat.category}`, value: cat.amount });
    totalExpense += cat.amount;
  });

  // Total -> Surplus
  const totalIncome = incomeSummary.reduce((acc, inc) => acc + inc.amount, 0);
  const surplus = Math.max(0, totalIncome - totalExpense);

  if (surplus > 0) {
    links.push({ source: 'total_income', target: 'surplus', value: surplus });
  }

  return { nodes, links };
}
