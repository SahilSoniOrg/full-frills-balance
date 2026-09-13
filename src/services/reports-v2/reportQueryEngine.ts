import { database } from '@/src/data/database/Database';
import Budget from '@/src/data/models/Budget';
import { accountQueryRepository } from '@/src/data/repositories/account';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { balanceService } from '@/src/services/balance';
import { convertAmount } from '@/src/services/currencyConversion';
import { AccountSubtype, AccountType } from '@/src/types/enums';
import type { AccountId, JournalId } from '@/src/types/ids';
import { Q } from '@nozbe/watermelondb';
import { calculateBudgetPerformance } from './calculators/planning/budgetPerformanceCalculator';
import { calculateDebtReport } from './calculators/planning/debtCalculator';
import { calculateForecast } from './calculators/planning/forecastCalculator';
import { calculateReportHealth } from './calculators/planning/healthCalculator';
import type {
  PlanningAccount,
  PlanningBudget,
  PlanningFact,
} from './calculators/planning/planningContracts';
import {
  calculateCashFlow,
  calculateIncome,
  calculateNetWorth,
  calculateOverview,
  calculateSpending,
} from './calculators/core/coreCalculators';
import type {
  CalculatorInput,
  ReportBalanceInput,
  ReportingFact as CoreFact,
} from './calculators/core/coreTypes';
import { resolveComparisonPeriod } from './calculators/core/coreUtils';
import {
  DEFAULT_CURRENCY_VALUATION_POLICY,
  resolveCurrencyValuation,
} from './policy/currencyValuationPolicy';
import { classifyFactFlow } from './classification/journalClassification';
import {
  readReportLedger,
  selectScopedLeafAccounts,
  type ReportLedgerSnapshot,
} from './reader/ledgerFactReader';
import type { ReportDrilldownQuery, ReportQuery } from './types/query';
import {
  REPORT_KINDS,
  type ReportBreakdownRow,
  type ReportMetric,
  type ReportResult,
  type ReportSection,
  type ReportWarning,
} from './types/result';
import type { MoneyMeasure, ReportMeasure } from './types/measure';
import type { ReportingFact } from './types/fact';

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

function coreQuery(query: ReportQuery): CalculatorInput['query'] {
  return {
    period: query.period,
    targetCurrency: query.targetCurrency,
    granularity: query.granularity,
    comparison: query.comparison,
  };
}

function coreFacts(facts: readonly ReportingFact[]): CoreFact[] {
  return facts.map(fact => ({
    workplaceId: fact.workplaceId,
    journalId: fact.journalId,
    transactionId: fact.transactionId,
    journalDate: fact.journalDate,
    journalStatus: fact.journalStatus,
    accountId: fact.accountId,
    accountType: fact.accountType,
    accountSubtype: fact.accountSubtype,
    parentAccountId: fact.parentAccountId,
    accountPath: fact.accountPath,
    isLeafAccount: fact.isLeafAccount,
    transactionType: fact.transactionType,
    amount: fact.amount,
    currencyCode: fact.currencyCode,
    historicalBaseAmount: fact.historicalBaseAmount,
    signedBalanceDelta: fact.signedBalanceDelta,
    journalDisplayType: fact.journalDisplayType,
    semanticType: fact.semanticType,
    description: fact.description,
    notes: fact.notes,
    plannedPaymentId: fact.plannedPaymentId,
  }));
}

function planningFacts(facts: readonly ReportingFact[]): PlanningFact[] {
  return facts.map(fact => ({
    workplaceId: fact.workplaceId,
    journalId: fact.journalId,
    transactionId: fact.transactionId,
    journalDate: fact.journalDate,
    journalStatus: fact.journalStatus,
    accountId: fact.accountId,
    accountType: fact.accountType,
    accountSubtype: fact.accountSubtype,
    accountPath: fact.accountPath,
    isLeafAccount: fact.isLeafAccount,
    transactionType: fact.transactionType,
    amount: fact.amount,
    currencyCode: fact.currencyCode,
    historicalBaseAmount: fact.historicalBaseAmount,
    signedBalanceDelta: fact.signedBalanceDelta,
    journalDisplayType: fact.journalDisplayType,
    semanticType: fact.semanticType,
    description: fact.description,
    notes: fact.notes,
    plannedPaymentId: fact.plannedPaymentId,
  }));
}

function accountToPlanning(
  account: ReportLedgerSnapshot['accounts'][number],
  metadata?: {
    creditLimitAmount?: number;
    minimumPaymentAmount?: number;
    minimumPaymentPercent?: number;
    dueDay?: number;
    payFromAccountId?: AccountId;
  },
): PlanningAccount {
  return {
    id: account.id,
    name: account.name,
    accountType: account.accountType,
    accountSubtype: account.accountSubtype,
    currencyCode: account.currencyCode,
    parentAccountId: account.parentAccountId,
    archivedAt: account.archivedAt,
    metadata,
  };
}

async function readBalanceInputs(
  query: ReportQuery,
  snapshot: ReportLedgerSnapshot,
  asOfDate: number,
): Promise<{ balances: ReportBalanceInput[]; warnings: ReportWarning[] }> {
  const accounts = selectScopedLeafAccounts(snapshot.accounts, query);
  const accountIds = accounts.map(account => account.id);
  if (accountIds.length === 0) return { balances: [], warnings: [] };
  const balances = await balanceService.getAccountBalances(
    query.workplaceId,
    asOfDate,
    undefined,
    undefined,
    accountIds,
  );
  const balanceById = new Map(balances.map(balance => [balance.accountId, balance]));
  const warnings: ReportWarning[] = [];
  const result: ReportBalanceInput[] = [];
  for (const account of accounts) {
    const balance = balanceById.get(account.id);
    if (!balance) continue;
    const valuation = resolveCurrencyValuation(DEFAULT_CURRENCY_VALUATION_POLICY, {
      purpose: 'BALANCE',
      sourceCurrencyCode: account.currencyCode,
      targetCurrencyCode: query.targetCurrency,
      periodEndpoint: asOfDate,
    });
    const converted = await convertAmount({
      amount: balance.balance,
      fromCurrency: account.currencyCode,
      toCurrency: query.targetCurrency,
      mode: 'historical',
      rateDate: valuation.rateDate,
    });
    if (!converted.ok) {
      warnings.push({
        code: 'MISSING_EXCHANGE_RATE',
        severity: 'WARNING',
        message: 'A point-in-time balance could not be valued in the report currency.',
        count: 1,
        accountIds: [account.id],
      });
      continue;
    }
    result.push({
      accountId: account.id,
      accountName: account.name,
      accountType: account.accountType,
      accountSubtype: account.accountSubtype,
      accountPath: account.id ? [account.id] : [],
      isLeafAccount: true,
      balance: balance.balance,
      reportCurrencyBalance: converted.amount,
      currencyCode: account.currencyCode,
    });
  }
  return { balances: result, warnings };
}

async function readBudgets(
  workplaceId: ReportQuery['workplaceId'],
  targetCurrency: string,
  period: ReportQuery['period'],
  scopedAccountIds?: ReadonlySet<string>,
): Promise<{ budgets: PlanningBudget[]; warnings: ReportWarning[] }> {
  const budgets = await database.collections
    .get<Budget>('budgets')
    .query(Q.where('workplace_id', workplaceId), Q.where('active', true))
    .fetch();
  const scopes = await budgetRepository.getScopesByBudgetIds(
    workplaceId,
    budgets.map(budget => budget.id),
  );
  const accountIdsByBudget = new Map<string, string[]>();
  for (const scope of scopes) {
    const ids = accountIdsByBudget.get(scope.budgetId) ?? [];
    ids.push(scope.accountId);
    accountIdsByBudget.set(scope.budgetId, ids);
  }
  const warnings: ReportWarning[] = [];
  const valuedBudgets: PlanningBudget[] = [];
  for (const budget of budgets) {
    const leafAccountIds = accountIdsByBudget.get(budget.id) ?? [];
    if (scopedAccountIds && !leafAccountIds.some(accountId => scopedAccountIds.has(accountId))) {
      continue;
    }
    const converted = await convertAmount({
      amount: budget.amount,
      fromCurrency: budget.currencyCode,
      toCurrency: targetCurrency,
      mode: 'historical',
      rateDate: period.endDate,
    });
    if (!converted.ok) {
      warnings.push({
        code: 'MISSING_EXCHANGE_RATE',
        severity: 'WARNING',
        message: 'A budget could not be valued in the report currency.',
        count: 1,
      });
      continue;
    }
    const startDate =
      budget.startDate ??
      (/^\d{4}-\d{2}$/.test(budget.startMonth)
        ? new Date(`${budget.startMonth}-01T00:00:00`).getTime()
        : undefined);
    valuedBudgets.push({
      id: budget.id,
      name: budget.name,
      amount: converted.amount,
      currencyCode: targetCurrency,
      intervalType: budget.intervalType,
      intervalN: budget.intervalN,
      startDate,
      recurrenceDay: budget.recurrenceDay,
      recurrenceMonth: budget.recurrenceMonth,
      leafAccountIds,
    });
  }
  return { budgets: valuedBudgets, warnings };
}

export function buildSections(
  query: ReportQuery,
  overview: ReturnType<typeof calculateOverview>,
  cashFlow: ReturnType<typeof calculateCashFlow>,
  spending: ReturnType<typeof calculateSpending>,
  income: ReturnType<typeof calculateIncome>,
  netWorth: ReturnType<typeof calculateNetWorth>,
  budget: ReturnType<typeof calculateBudgetPerformance>,
  debt: ReturnType<typeof calculateDebtReport>,
  forecast: ReturnType<typeof calculateForecast>,
  health: ReturnType<typeof calculateReportHealth>,
  additionalWarnings: readonly ReportWarning[] = [],
): { sections: ReportSection[]; measures: Record<string, ReportMeasure> } {
  const currency = query.targetCurrency;
  const measures: Record<string, ReportMeasure> = {};
  const add = (id: string, value: ReportMeasure) => {
    measures[id] = value;
    return value;
  };
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
      metric('savings-rate', 'Savings rate', add('savingsRate', percentage(overview.savingsRate))),
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
  const cashSection: ReportSection = {
    id: 'cash-flow',
    title: 'Cash flow',
    metrics: [
      metric('cash-inflows', 'Inflows', add('cashInflows', money(cashFlow.cashInflows, currency))),
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
      metric('income-journals', 'Transactions', add('incomeJournals', count(income.journalCount))),
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
  return {
    sections: [
      overviewSection,
      cashSection,
      spendingSection,
      incomeSection,
      netWorthSection,
      budgetSection,
      debtSection,
      forecastSection,
      healthSection,
    ],
    measures,
  };
}

export class ReportsV2Engine implements ReportsV2QueryEngine {
  async run(query: ReportQuery): Promise<ReportResult> {
    const snapshot = await readReportLedger(query);
    const period = query.period;
    const comparisonPeriod = resolveComparisonPeriod(
      {
        period,
        startDate: period.startDate,
        endDate: period.endDate,
        comparison: query.comparison,
        granularity: query.granularity,
        targetCurrency: query.targetCurrency,
      },
      period,
    );
    const currentFacts = [...snapshot.actualFacts, ...snapshot.plannedFacts];
    const comparisonFacts = comparisonPeriod
      ? currentFacts.filter(
          fact =>
            fact.journalDate >= comparisonPeriod.startDate &&
            fact.journalDate <= comparisonPeriod.endDate,
        )
      : undefined;
    const baseInput = {
      facts: coreFacts(currentFacts),
      query: coreQuery(query),
      comparisonFacts: comparisonFacts ? coreFacts(comparisonFacts) : undefined,
    };
    const opening = await readBalanceInputs(query, snapshot, Math.max(0, period.startDate - 1));
    const closing = await readBalanceInputs(query, snapshot, period.endDate);
    const cashSubtypes: readonly AccountSubtype[] = [
      AccountSubtype.CASH,
      AccountSubtype.WALLET,
      AccountSubtype.BANK_CHECKING,
      AccountSubtype.BANK_SAVINGS,
      AccountSubtype.MONEY_MARKET,
    ];
    const isCashSubtype = (value: AccountSubtype | string | undefined): boolean =>
      value !== undefined && cashSubtypes.includes(value as AccountSubtype);
    const scopedAccounts = selectScopedLeafAccounts(snapshot.accounts, query);
    const scopedAccountIds = new Set(scopedAccounts.map(account => account.id));
    const cashBalances = {
      openingBalances: opening.balances.filter(balance => isCashSubtype(balance.accountSubtype)),
      closingBalances: closing.balances.filter(balance => isCashSubtype(balance.accountSubtype)),
    };
    const healthSnapshotPromise =
      query.accountIds || query.accountTypes || !query.includeArchivedAccounts
        ? readReportLedger({
            ...query,
            accountIds: undefined,
            accountTypes: undefined,
            includeArchivedAccounts: true,
          })
        : Promise.resolve(snapshot);
    const [accountsMetadata, budgetRead, healthSnapshot] = await Promise.all([
      accountQueryRepository.findMetadataByAccountIds(
        query.workplaceId,
        scopedAccounts.map(account => account.id),
      ),
      readBudgets(query.workplaceId, query.targetCurrency, period, scopedAccountIds),
      healthSnapshotPromise,
    ]);
    const budgets = budgetRead.budgets;
    const metadataByAccount = new Map(accountsMetadata.map(item => [item.accountId, item]));
    const planningAccounts = scopedAccounts.map(account =>
      accountToPlanning(account, metadataByAccount.get(account.id)),
    );
    const healthAccounts = healthSnapshot.accounts.map(account => accountToPlanning(account));
    const actualPlanningFacts = planningFacts(snapshot.actualFacts);
    const plannedPlanningFacts = planningFacts(snapshot.plannedFacts);
    const [budget, debt, forecast, health] = await Promise.all([
      Promise.resolve(
        calculateBudgetPerformance({
          budgets,
          actualFacts: actualPlanningFacts,
          plannedFacts: plannedPlanningFacts,
          period,
        }),
      ),
      Promise.resolve(
        calculateDebtReport({
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
        }),
      ),
      Promise.resolve(
        calculateForecast({
          accounts: planningAccounts,
          actualFacts: actualPlanningFacts,
          plannedFacts: plannedPlanningFacts,
          period,
          cashAccountIds: scopedAccounts
            .filter(
              account =>
                account.accountType === AccountType.ASSET && isCashSubtype(account.accountSubtype),
            )
            .map(account => account.id),
          startingCashBalance: cashBalances.openingBalances.reduce(
            (total, balance) => total + (balance.reportCurrencyBalance ?? balance.balance),
            0,
          ),
        }),
      ),
      Promise.resolve(
        calculateReportHealth({
          accounts: healthAccounts,
          period,
          actualFacts: planningFacts(healthSnapshot.actualFacts),
          plannedFacts: planningFacts(healthSnapshot.plannedFacts),
          targetCurrency: query.targetCurrency,
          supportedAccountSubtypes: Object.values(AccountSubtype),
        }),
      ),
    ]);
    const overview = calculateOverview({
      ...baseInput,
      openingBalances: opening.balances,
      closingBalances: closing.balances,
    });
    const cashFlow = calculateCashFlow({
      ...baseInput,
      openingBalances: cashBalances.openingBalances,
      closingBalances: cashBalances.closingBalances,
    });
    const spending = calculateSpending(baseInput);
    const income = calculateIncome(baseInput);
    const netWorth = calculateNetWorth({
      ...baseInput,
      openingBalances: opening.balances,
      closingBalances: closing.balances,
    });
    const healthWarnings: ReportWarning[] = health.diagnostics
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
      query,
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
    const snapshot = await readReportLedger(input.baseQuery);
    const start = input.startDate ?? input.baseQuery.period.startDate;
    const end = input.endDate ?? input.baseQuery.period.endDate;
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
