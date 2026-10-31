import { AccountType } from '@/src/types/enums';
import { getCurrencyPrecision } from '@/src/utils/currencyPrecision';
import {
  calculateCalendarHeatmapFromHistory,
  calculateSpendingHeatmapFromTransactions,
} from '@/src/services/report-visualizations/heatmapCalculators';
import { calculateSankeyDataFromSummaries } from '@/src/services/report-visualizations/sankeyCalculator';
import type { IncomeResult, SpendingResult } from './calculators/core/coreTypes';
import type { ReportingFact } from './types/fact';
import type { ReportSectionId, ReportQuery } from './types/query';
import type { ReportVisualization } from './types/result';

export interface ReportVisualizationsBySection {
  readonly overview: readonly ReportVisualization[];
  readonly spending: readonly ReportVisualization[];
}

export function buildReportVisualizations({
  query,
  requestedSections,
  facts,
  income,
  spending,
}: {
  query: ReportQuery;
  requestedSections: ReadonlySet<ReportSectionId>;
  facts: readonly ReportingFact[];
  income?: IncomeResult;
  spending?: SpendingResult;
}): ReportVisualizationsBySection {
  const overview: ReportVisualization[] = [];
  if (requestedSections.has('overview') && income && spending) {
    overview.push({
      kind: 'SANKEY',
      data: calculateSankeyDataFromSummaries(
        income.bySubtype
          .filter(item => item.netIncome > 0)
          .map(item => ({ category: item.key, amount: item.netIncome })),
        spending.bySubtype
          .filter(item => item.netExpense > 0)
          .map(item => ({ category: item.key, amount: item.netExpense })),
      ),
    });
  }

  const spendingVisualizations: ReportVisualization[] = [];
  if (requestedSections.has('spending') && spending) {
    const heatmapTransactions = facts.flatMap(fact => {
      if (
        (fact.accountType !== AccountType.INCOME && fact.accountType !== AccountType.EXPENSE) ||
        fact.historicalBaseAmount === undefined
      ) {
        return [];
      }
      return [
        {
          journalId: fact.journalId,
          transactionType: fact.transactionType,
          transactionDate: fact.transactionDate,
          amount: Math.abs(fact.historicalBaseAmount),
        },
      ];
    });
    const currencyCode = query.targetCurrency;

    spendingVisualizations.push({
      kind: 'HEATMAP',
      points: calculateSpendingHeatmapFromTransactions(
        heatmapTransactions,
        getCurrencyPrecision(currencyCode),
      ),
      currencyCode,
    });
    spendingVisualizations.push({
      kind: 'CALENDAR_HEATMAP',
      points: calculateCalendarHeatmapFromHistory(
        spending.buckets.map(bucket => ({
          startDate: bucket.startDate,
          endDate: bucket.endDate,
          expense: bucket.netExpense,
        })),
      ),
      currencyCode,
    });
  }

  return { overview, spending: spendingVisualizations };
}
