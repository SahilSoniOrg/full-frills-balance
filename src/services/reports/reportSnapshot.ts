import { HeatmapPoint } from '@/src/services/reports/heatmapCalculators';
import { SankeyData, SankeyLink, SankeyNode } from '@/src/services/reports/sankeyCalculator';
import { AccountId } from '@/src/types/domain';

/**
 * Chart-neutral report snapshot contract (plan commit 43).
 *
 * Holds only the report-screen data the reports feature needs, described in
 * accounting/geometry terms. Report calculators are internal implementations;
 * feature adapters and chart components consume this contract instead of the
 * `ReportService` presentation surface.
 */

export type { HeatmapPoint, SankeyData, SankeyLink, SankeyNode };

export interface ExpenseCategory {
  accountId: AccountId;
  accountName: string;
  amount: number;
  percentage: number;
  color?: string; // For chart
}

export interface IncomeVsExpense {
  period: string; // Label (e.g., "Jan", "Week 1")
  startDate: number;
  endDate: number;
  income: number;
  expense: number;
}

export interface CategoryBreakdown {
  category: string; // AccountSubtype
  amount: number;
  percentage: number;
  color?: string;
}

export interface ReportSnapshot {
  expenseBreakdown: ExpenseCategory[];
  incomeBreakdown: ExpenseCategory[];
  expenseCategoryBreakdown: CategoryBreakdown[];
  incomeCategoryBreakdown: CategoryBreakdown[];
  incomeVsExpenseHistory: IncomeVsExpense[];
  incomeVsExpense: { income: number; expense: number };
  dailyIncomeVsExpense: { date: number; income: number; expense: number }[];
  sankeyData: SankeyData;
  spendingHeatmap: HeatmapPoint[];
  calendarHeatmap: HeatmapPoint[]; // reuse HeatmapPoint: x=dayOfWeek, y=weekOfMonth
}
