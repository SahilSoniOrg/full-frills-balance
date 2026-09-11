import type { CategoryBreakdown } from '@/src/services/reports/reportSnapshot';
import { roundToPrecision } from '@/src/utils/money';

export interface ReportSummaryComparison {
  incomeChange: number;
  expenseChange: number;
  netFlowChange: number;
}

export interface ReportSummary {
  income: number;
  expense: number;
  netFlow: number;
  comparison: ReportSummaryComparison | null;
  largestSpendingCategory: CategoryBreakdown | null;
  highestSpendingDay: { date: number; amount: number } | null;
}

interface ReportSummaryInput {
  incomeVsExpense: { income: number; expense: number };
  previousIncomeVsExpense?: { income: number; expense: number } | null;
  expenseCategoryBreakdown: CategoryBreakdown[];
  dailyIncomeVsExpense: { date: number; income: number; expense: number }[];
}

export function calculateReportSummary({
  incomeVsExpense,
  previousIncomeVsExpense,
  expenseCategoryBreakdown,
  dailyIncomeVsExpense,
}: ReportSummaryInput): ReportSummary {
  const income = incomeVsExpense.income;
  const expense = incomeVsExpense.expense;
  const netFlow = roundToPrecision(income - expense, 2);

  const comparison = previousIncomeVsExpense
    ? {
        incomeChange: roundToPrecision(income - previousIncomeVsExpense.income, 2),
        expenseChange: roundToPrecision(expense - previousIncomeVsExpense.expense, 2),
        netFlowChange: roundToPrecision(
          netFlow - (previousIncomeVsExpense.income - previousIncomeVsExpense.expense),
          2,
        ),
      }
    : null;

  const largestSpendingCategory = expenseCategoryBreakdown.reduce<CategoryBreakdown | null>(
    (largest, category) => {
      if (category.amount <= 0) return largest;
      return !largest || category.amount > largest.amount ? category : largest;
    },
    null,
  );

  const highestSpendingDay = dailyIncomeVsExpense.reduce<{ date: number; amount: number } | null>(
    (highest, day) => {
      if (day.expense <= 0) return highest;
      return !highest || day.expense > highest.amount
        ? { date: day.date, amount: day.expense }
        : highest;
    },
    null,
  );

  return {
    income,
    expense,
    netFlow,
    comparison,
    largestSpendingCategory,
    highestSpendingDay,
  };
}
