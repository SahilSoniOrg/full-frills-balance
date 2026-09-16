import { AccountSubtype } from '@/src/types/enums';
import type { AccountId, JournalId } from '@/src/types/ids';
import { calculateBudgetPerformance } from './calculators/planning/budgetPerformanceCalculator';
import { calculateDebtReport } from './calculators/planning/debtCalculator';
import { calculateForecast } from './calculators/planning/forecastCalculator';
import { calculateReportHealth } from './calculators/planning/healthCalculator';
import {
  calculateCashFlow,
  calculateIncome,
  calculateNetWorth,
  calculateOverview,
  calculateSpending,
} from './calculators/core/coreCalculators';
import { classifyFactFlow } from './classification/journalClassification';
import { readReportLedger } from './reader/ledgerFactReader';
import { readReportInputs, type ReportInputSnapshot } from './reportInputReader';
import {
  requestedReportSections,
  type ReportDrilldownQuery,
  type ReportQuery,
  type ReportSectionId,
} from './types/query';
import {
  REPORT_KINDS,
  type ReportBreakdownRow,
  type ReportMetric,
  type ReportResult,
  type ReportSection,
  type ReportWarning,
} from './types/result';
import type { MoneyMeasure, ReportMeasure } from './types/measure';

export interface ReportsV2QueryEngine {
  run(query: ReportQuery): Promise<ReportResult>;
  drillDown(query: ReportDrilldownQuery): Promise<readonly string[]>;
}

function money(amount: number, currencyCode: string): MoneyMeasure {
  return { kind: 'MONEY', amount: Number.isFinite(amount) ? amount : 0, currencyCode };
}

function count(value: number) {
  return { kind: 'COUNT' as const, value };
}

function percentage(value: number | null) {
  return { kind: 'PERCENTAGE' as const, value };
}

function metric(
  id: string,
  label: string,
  value: ReportMeasure,
  comparison?: ReportMetric['comparison'],
): ReportMetric {
  return { id, label, value, ...(comparison ? { comparison } : {}) };
}

function comparisonOf(
  value: {
    current: number;
    previous: number | null;
    change: number | null;
    percentChange: number | null;
  },
  currencyCode: string,
) {
  return {
    absolute: money(value.change ?? 0, currencyCode),
    percentageChange: value.percentChange,
  };
}

function row(
  id: string,
  label: string,
  amount: number,
  currencyCode: string,
  percentageValue?: number,
  accountIds?: readonly (AccountId | string)[],
  journalIds?: readonly (JournalId | string)[],
): ReportBreakdownRow {
  return {
    id,
    label,
    value: money(amount, currencyCode),
    ...(percentageValue === undefined ? {} : { percentage: percentage(percentageValue) }),
    ...(accountIds ? { accountIds: accountIds as readonly AccountId[] } : {}),
    ...(journalIds ? { journalIds: journalIds as readonly JournalId[] } : {}),
  };
}

function countRow(
  id: string,
  label: string,
  value: number,
  journalIds?: readonly (JournalId | string)[],
): ReportBreakdownRow {
  return {
    id,
    label,
    value: count(value),
    ...(journalIds ? { journalIds: journalIds as readonly JournalId[] } : {}),
  };
}

export function buildSections(
  query: ReportQuery,
  overview: ReturnType<typeof calculateOverview> | undefined,
  cashFlow: ReturnType<typeof calculateCashFlow> | undefined,
  spending: ReturnType<typeof calculateSpending> | undefined,
  income: ReturnType<typeof calculateIncome> | undefined,
  netWorth: ReturnType<typeof calculateNetWorth> | undefined,
  budget: ReturnType<typeof calculateBudgetPerformance> | undefined,
  debt: ReturnType<typeof calculateDebtReport> | undefined,
  forecast: ReturnType<typeof calculateForecast> | undefined,
  health: ReturnType<typeof calculateReportHealth> | undefined,
  additionalWarnings: readonly ReportWarning[] = [],
  requestedSections: ReadonlySet<ReportSectionId> = requestedReportSections(query),
): { sections: ReportSection[]; measures: Record<string, ReportMeasure> } {
  const currency = query.targetCurrency;
  const measures: Record<string, ReportMeasure> = {};
  const sections: ReportSection[] = [];
  const add = (id: string, value: ReportMeasure) => {
    measures[id] = value;
    return value;
  };
  if (overview && requestedSections.has('overview')) {
    const overviewSection: ReportSection = {
      id: 'overview',
      title: 'Overview',
      metrics: [
        metric(
          'gross-income',
          'Gross income',
          add('grossIncome', money(overview.grossIncome, currency)),
        ),
        metric(
          'net-income',
          'Net income',
          add('netIncome', money(overview.netIncome, currency)),
          overview.comparison ? comparisonOf(overview.comparison.netIncome, currency) : undefined,
        ),
        metric(
          'net-expense',
          'Net spending',
          add('netExpense', money(overview.netExpense, currency)),
          overview.comparison ? comparisonOf(overview.comparison.netExpense, currency) : undefined,
        ),
        metric(
          'net-flow',
          'Net flow',
          add('netFlow', money(overview.netFlow, currency)),
          overview.comparison ? comparisonOf(overview.comparison.netFlow, currency) : undefined,
        ),
        metric(
          'savings-rate',
          'Savings rate',
          add('savingsRate', percentage(overview.savingsRate)),
        ),
      ],
      visualizations: [
        {
          kind: 'BAR',
          series: [
            {
              id: 'income',
              label: 'Income',
              points: overview.buckets.map(bucket => ({
                date: bucket.startDate,
                value: money(bucket.netIncome, currency),
              })),
            },
            {
              id: 'expense',
              label: 'Spending',
              points: overview.buckets.map(bucket => ({
                date: bucket.startDate,
                value: money(-bucket.netExpense, currency),
              })),
            },
          ],
        },
      ],
      rows: overview.topSpendingCategories.map(item =>
        row(item.key, item.label, item.netExpense, currency, item.percentage, item.accountIds),
      ),
    };
    sections.push(overviewSection);
  }
  if (cashFlow && requestedSections.has('cash-flow')) {
    const cashSection: ReportSection = {
      id: 'cash-flow',
      title: 'Cash flow',
      metrics: [
        metric(
          'cash-inflows',
          'Inflows',
          add('cashInflows', money(cashFlow.cashInflows, currency)),
        ),
        metric(
          'cash-outflows',
          'Outflows',
          add('cashOutflows', money(cashFlow.cashOutflows, currency)),
        ),
        metric(
          'cash-net',
          'Net cash movement',
          add('netCashMovement', money(cashFlow.netCashFlow, currency)),
        ),
        metric(
          'opening-cash',
          'Opening cash',
          add('openingCash', money(cashFlow.openingCashBalance ?? 0, currency)),
        ),
        metric(
          'closing-cash',
          'Closing cash',
          add('closingCash', money(cashFlow.closingCashBalance ?? 0, currency)),
        ),
      ],
      visualizations: [
        {
          kind: 'LINE',
          series: [
            {
              id: 'cash',
              label: 'Net cash movement',
              points: cashFlow.buckets.map(bucket => ({
                date: bucket.startDate,
                value: money(bucket.netCashFlow, currency),
              })),
            },
          ],
        },
      ],
      rows: cashFlow.bySubtype.map(item =>
        row(item.key, item.label, item.netCashFlow, currency, undefined, item.accountIds),
      ),
    };
    sections.push(cashSection);
  }
  if (spending && requestedSections.has('spending')) {
    const spendingSection: ReportSection = {
      id: 'spending',
      title: 'Spending',
      metrics: [
        metric(
          'gross-spending',
          'Gross spending',
          add('grossSpending', money(spending.grossExpense, currency)),
        ),
        metric('refunds', 'Refunds', add('refunds', money(spending.refunds, currency))),
        metric(
          'net-spending',
          'Net spending',
          add('netSpending', money(spending.netExpense, currency)),
        ),
        metric(
          'spending-journals',
          'Transactions',
          add('spendingJournals', count(spending.journalCount)),
        ),
        metric(
          'average-spend',
          'Average transaction',
          add('averageSpend', money(spending.averageTransactionSize, currency)),
        ),
      ],
      visualizations: [
        {
          kind: 'BAR',
          series: [
            {
              id: 'spending',
              label: 'Net spending',
              points: spending.buckets.map(bucket => ({
                date: bucket.startDate,
                value: money(bucket.netExpense, currency),
              })),
            },
          ],
        },
      ],
      rows: spending.bySubtype.map(item =>
        row(item.key, item.label, item.netExpense, currency, item.percentage, item.accountIds),
      ),
    };
    sections.push(spendingSection);
  }
  if (income && requestedSections.has('income')) {
    const incomeSection: ReportSection = {
      id: 'income',
      title: 'Income',
      metrics: [
        metric(
          'gross-income-detail',
          'Gross income',
          add('grossIncomeDetail', money(income.grossIncome, currency)),
        ),
        metric(
          'income-reversals',
          'Reversals',
          add('incomeReversals', money(income.incomeReversals, currency)),
        ),
        metric(
          'net-income-detail',
          'Net income',
          add('netIncomeDetail', money(income.netIncome, currency)),
        ),
        metric(
          'income-journals',
          'Transactions',
          add('incomeJournals', count(income.journalCount)),
        ),
      ],
      visualizations: [
        {
          kind: 'BAR',
          series: [
            {
              id: 'income',
              label: 'Net income',
              points: income.buckets.map(bucket => ({
                date: bucket.startDate,
                value: money(bucket.netIncome, currency),
              })),
            },
          ],
        },
      ],
      rows: income.bySubtype.map(item =>
        row(item.key, item.label, item.netIncome, currency, item.percentage, item.accountIds),
      ),
    };
    sections.push(incomeSection);
  }
  if (netWorth && requestedSections.has('net-worth')) {
    const netWorthSection: ReportSection = {
      id: 'net-worth',
      title: 'Net worth',
      metrics: [
        metric(
          'assets',
          'Assets',
          add('assets', money(netWorth.closing?.totalAssets ?? 0, currency)),
        ),
        metric(
          'liabilities',
          'Liabilities',
          add('liabilities', money(netWorth.closing?.totalLiabilities ?? 0, currency)),
        ),
        metric(
          'net-worth',
          'Net worth',
          add('netWorth', money(netWorth.closing?.netWorth ?? 0, currency)),
        ),
        metric(
          'net-worth-change',
          'Change',
          add('netWorthChange', money(netWorth.change.netWorth, currency)),
        ),
      ],
      visualizations: [
        {
          kind: 'LINE',
          series: [
            {
              id: 'net-worth',
              label: 'Net worth',
              points: netWorth.history.flatMap(point =>
                point.netWorth === null
                  ? []
                  : [{ date: point.startDate, value: money(point.netWorth, currency) }],
              ),
            },
          ],
        },
      ],
    };
    sections.push(netWorthSection);
  }
  if (budget && requestedSections.has('budgets')) {
    const budgetSection: ReportSection = {
      id: 'budgets',
      title: 'Budgets',
      metrics: [
        metric(
          'budgeted',
          'Budgeted',
          add('budgeted', money(budget.totals.budgetedAmount, currency)),
        ),
        metric(
          'budget-actual',
          'Actual spending',
          add('budgetActual', money(budget.totals.actualNetExpense, currency)),
        ),
        metric(
          'budget-planned',
          'Planned spending',
          add('budgetPlanned', money(budget.totals.plannedNetExpense, currency)),
        ),
      ],
      rows: budget.budgets.map(item =>
        row(
          item.budgetId,
          item.name,
          item.actualNetExpense,
          currency,
          item.percentageUsed ?? undefined,
          undefined,
          item.journalIds,
        ),
      ),
    };
    sections.push(budgetSection);
  }
  if (debt && requestedSections.has('debt')) {
    const debtSection: ReportSection = {
      id: 'debt',
      title: 'Debt',
      metrics: [
        metric(
          'debt-opening',
          'Opening debt',
          add('debtOpening', money(debt.totals.openingBalance, currency)),
        ),
        metric(
          'debt-closing',
          'Closing debt',
          add('debtClosing', money(debt.totals.closingBalance, currency)),
        ),
        metric(
          'debt-borrowings',
          'Borrowings',
          add('debtBorrowings', money(debt.totals.borrowings, currency)),
        ),
        metric(
          'debt-payments',
          'Payments',
          add('debtPayments', money(debt.totals.totalPayments, currency)),
        ),
        metric(
          'debt-utilization',
          'Utilization',
          add('debtUtilization', percentage(debt.totals.utilizationPercent)),
        ),
      ],
      rows: debt.accounts.map(item =>
        row(
          item.accountId,
          item.name,
          item.closingBalance,
          currency,
          item.utilizationPercent ?? undefined,
          [item.accountId as AccountId],
          item.journalIds,
        ),
      ),
    };
    sections.push(debtSection);
  }
  if (forecast && requestedSections.has('forecast')) {
    const forecastSection: ReportSection = {
      id: 'forecast',
      title: 'Forecast',
      metrics: [
        metric(
          'scheduled-inflows',
          'Scheduled inflows',
          add('scheduledInflows', money(forecast.totals.plannedInflow, currency)),
        ),
        metric(
          'scheduled-outflows',
          'Scheduled outflows',
          add('scheduledOutflows', money(forecast.totals.plannedOutflow, currency)),
        ),
        metric(
          'projected-closing-cash',
          'Projected closing cash',
          add('projectedClosingCash', money(forecast.totals.endingProjectedBalance, currency)),
        ),
      ],
      visualizations: [
        {
          kind: 'LINE',
          series: [
            {
              id: 'projected-cash',
              label: 'Projected cash',
              points: forecast.timeline.map(point => ({
                date: point.timestamp,
                value: money(point.projectedBalance, currency),
              })),
            },
          ],
        },
      ],
      rows: forecast.upcoming
        .slice(0, 20)
        .map(item =>
          row(
            item.journalId,
            item.description ?? 'Planned payment',
            item.amount,
            currency,
            undefined,
            undefined,
            [item.journalId],
          ),
        ),
    };
    sections.push(forecastSection);
  }
  if (health && requestedSections.has('health')) {
    const healthSection: ReportSection = {
      id: 'health',
      title: 'Report health',
      metrics: [
        metric(
          'health-errors',
          'Errors',
          add(
            'healthErrors',
            count(
              health.summary.errorCount +
                additionalWarnings
                  .filter(item => item.severity === 'ERROR')
                  .reduce((total, item) => total + (item.count ?? 1), 0),
            ),
          ),
        ),
        metric(
          'health-warnings',
          'Warnings',
          add(
            'healthWarnings',
            count(
              health.summary.warningCount +
                additionalWarnings
                  .filter(item => item.severity === 'WARNING')
                  .reduce((total, item) => total + (item.count ?? 1), 0),
            ),
          ),
        ),
        metric(
          'health-info',
          'Info',
          add(
            'healthInfo',
            count(
              health.summary.infoCount +
                additionalWarnings
                  .filter(item => item.severity === 'INFO')
                  .reduce((total, item) => total + (item.count ?? 1), 0),
            ),
          ),
        ),
      ],
      rows: [
        ...health.diagnostics.map(item =>
          countRow(item.code, item.message, item.count, item.journalIds),
        ),
        ...additionalWarnings.map(item =>
          countRow(item.code, item.message, item.count ?? 1, item.journalIds),
        ),
      ],
    };
    sections.push(healthSection);
  }
  return {
    sections,
    measures,
  };
}

export class ReportsV2Engine implements ReportsV2QueryEngine {
  constructor(
    private readonly inputReader: (
      query: ReportQuery,
    ) => Promise<ReportInputSnapshot> = readReportInputs,
    private readonly ledgerReader: typeof readReportLedger = readReportLedger,
  ) {}

  async run(query: ReportQuery): Promise<ReportResult> {
    const sections = requestedReportSections(query);
    const wants = (...ids: ReportSectionId[]) => ids.some(id => sections.has(id));
    const {
      snapshot,
      period,
      comparisonPeriod,
      currentFacts,
      comparisonFacts,
      opening,
      closing,
      cashBalances,
      cashAccountIds,
      budgetRead,
      healthSnapshot,
      planningAccounts,
      healthAccounts,
    } = await this.inputReader(query);
    const queryForCalculators = { ...query, period };
    const baseInput = {
      facts: currentFacts,
      query: queryForCalculators,
      comparisonFacts,
    };
    const budgets = budgetRead.budgets;
    const actualPlanningFacts = snapshot.actualFacts;
    const plannedPlanningFacts = snapshot.plannedFacts;
    const budget = wants('budgets')
      ? calculateBudgetPerformance({
          budgets,
          actualFacts: actualPlanningFacts,
          plannedFacts: plannedPlanningFacts,
          period,
        })
      : undefined;
    const debt = wants('debt')
      ? calculateDebtReport({
          accounts: planningAccounts,
          actualFacts: actualPlanningFacts,
          plannedFacts: plannedPlanningFacts,
          period,
          openingBalances: new Map(
            opening.balances.map(balance => [
              balance.accountId,
              balance.reportCurrencyBalance ?? balance.balance,
            ]),
          ),
        })
      : undefined;
    const forecast = wants('forecast')
      ? calculateForecast({
          accounts: planningAccounts,
          actualFacts: actualPlanningFacts,
          plannedFacts: plannedPlanningFacts,
          period,
          cashAccountIds,
          startingCashBalance: cashBalances.openingBalances.reduce(
            (total, balance) => total + (balance.reportCurrencyBalance ?? balance.balance),
            0,
          ),
        })
      : undefined;
    const health = wants('health')
      ? calculateReportHealth({
          accounts: healthAccounts,
          period,
          actualFacts: healthSnapshot.actualFacts,
          plannedFacts: healthSnapshot.plannedFacts,
          targetCurrency: query.targetCurrency,
          supportedAccountSubtypes: Object.values(AccountSubtype),
        })
      : undefined;
    const overview = wants('overview')
      ? calculateOverview({
          ...baseInput,
          openingBalances: opening.balances,
          closingBalances: closing.balances,
        })
      : undefined;
    const cashFlow = wants('cash-flow')
      ? calculateCashFlow({
          ...baseInput,
          openingBalances: cashBalances.openingBalances,
          closingBalances: cashBalances.closingBalances,
        })
      : undefined;
    const spending = wants('spending') ? calculateSpending(baseInput) : undefined;
    const income = wants('income') ? calculateIncome(baseInput) : undefined;
    const netWorth = wants('net-worth')
      ? calculateNetWorth({
          ...baseInput,
          openingBalances: opening.balances,
          closingBalances: closing.balances,
        })
      : undefined;
    const healthWarnings: ReportWarning[] = (health?.diagnostics ?? [])
      .filter(item => item.severity !== 'INFO')
      .map(item => ({
        code:
          item.code === 'MISSING_ACCOUNT_REFERENCE'
            ? 'MISSING_ACCOUNT'
            : (item.code as ReportWarning['code']),
        severity: item.severity,
        message: item.message,
        count: item.count,
        ...(item.journalIds ? { journalIds: item.journalIds as JournalId[] } : {}),
        ...(item.accountIds ? { accountIds: item.accountIds as AccountId[] } : {}),
      }));
    // The unscoped health snapshot contains every ledger warning, including
    // warnings that a selected account scope would otherwise hide. Reusing it
    // here avoids presenting the same warning twice when the snapshots match.
    const additionalWarnings = [
      ...healthSnapshot.warnings,
      ...budgetRead.warnings,
      ...opening.warnings,
      ...closing.warnings,
    ];
    const built = buildSections(
      queryForCalculators,
      overview,
      cashFlow,
      spending,
      income,
      netWorth,
      budget,
      debt,
      forecast,
      health,
      additionalWarnings,
      sections,
    );
    return {
      kind: REPORT_KINDS.OVERVIEW,
      query,
      period,
      ...(comparisonPeriod
        ? {
            comparisonPeriod: {
              startDate: comparisonPeriod.startDate,
              endDate: comparisonPeriod.endDate,
              timeZone: query.period.timeZone,
            },
          }
        : {}),
      generatedAt: Date.now(),
      measures: built.measures,
      sections: built.sections,
      warnings: [...additionalWarnings, ...healthWarnings],
    };
  }

  async drillDown(input: ReportDrilldownQuery): Promise<readonly string[]> {
    const start = input.startDate ?? input.baseQuery.period.startDate;
    const end = input.endDate ?? input.baseQuery.period.endDate;
    const snapshot = await this.ledgerReader(input.baseQuery, {
      factPeriod: {
        startDate: start,
        endDate: end,
        timeZone: input.baseQuery.period.timeZone,
      },
    });
    const facts = [...snapshot.actualFacts, ...snapshot.plannedFacts].filter(fact => {
      if (fact.journalDate < start || fact.journalDate > end) return false;
      if (input.accountIds && !input.accountIds.includes(fact.accountId)) return false;
      if (input.accountTypes && !input.accountTypes.includes(fact.accountType)) return false;
      if (
        input.accountSubtypes &&
        (!fact.accountSubtype || !input.accountSubtypes.includes(fact.accountSubtype))
      )
        return false;
      if (input.journalIds && !input.journalIds.includes(fact.journalId)) return false;
      if (
        input.semanticTypes &&
        (!fact.semanticType || !input.semanticTypes.includes(fact.semanticType))
      )
        return false;
      if (input.flowClassifications && !input.flowClassifications.includes(classifyFactFlow(fact)))
        return false;
      return true;
    });
    return [...new Set(facts.map(fact => fact.journalId))];
  }
}

export const reportsV2Engine = new ReportsV2Engine();
