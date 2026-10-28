import type { ReportVisualization, ReportWarning } from '@/src/services/reports-v2/types/result';
import type { ExplanationContextItem } from '@/src/components/shared/ContextualExplanation';
import type { ReportsV2FiltersViewModel } from '../../types';

export interface ReportsV2ExplanationContext {
  periodLabel: string;
  accountScopeLabel: string;
  basisLabel: string;
  comparisonLabel: string;
  archivedAccountsLabel: string;
  currencyCode: string;
}

export interface ReportExplanationCopy {
  title: string;
  meaning: string;
  interpretation: string;
  unit?: string;
  basisNote?: string;
}

type MetricExplanationMap = Readonly<Record<string, ReportExplanationCopy>>;

const metricExplanations: Readonly<Record<string, MetricExplanationMap>> = {
  overview: {
    'gross-income': {
      title: 'Gross income',
      meaning: 'Positive posted changes on the selected leaf income accounts before reversals.',
      interpretation: 'Income reversals are subtracted separately to calculate net income.',
      unit: 'Report currency',
    },
    'net-income': {
      title: 'Net income',
      meaning: 'Gross income minus income reversals on the selected leaf income accounts.',
      interpretation:
        'This is income after reversals; it does not measure changes in cash or account balances.',
      unit: 'Report currency',
    },
    'net-expense': {
      title: 'Net spending',
      meaning: 'Gross expense activity minus refunds in the selected period.',
      interpretation:
        'A larger amount means more spending remained after refunds. Only classified expense entries on leaf accounts are included.',
      unit: 'Report currency',
    },
    'net-flow': {
      title: 'Net flow',
      meaning:
        'Net income minus net spending. Income and spending are each net of reversals and refunds.',
      interpretation:
        'Above zero means income exceeded spending in this period; below zero means spending exceeded income.',
      unit: 'Report currency',
    },
    'savings-rate': {
      title: 'Savings rate',
      meaning:
        'Net flow divided by net income, shown as a percentage. It is unavailable when net income is zero or negative.',
      interpretation:
        'A higher positive rate means more of reported net income remained after spending. It is not a cash balance change.',
      unit: 'Percent of net income',
    },
  },
  'cash-flow': {
    'cash-inflows': {
      title: 'Cash inflows',
      meaning: 'Positive balance changes recorded in the selected cash and bank accounts.',
      interpretation:
        'This can include transfers between cash accounts and borrowing proceeds, so it can differ from income.',
      unit: 'Report currency',
    },
    'cash-outflows': {
      title: 'Cash outflows',
      meaning:
        'Negative balance changes recorded in the selected cash and bank accounts, shown as a positive total.',
      interpretation:
        'This can include transfers, debt payments, and spending paid from a selected cash account.',
      unit: 'Report currency',
    },
    'cash-net': {
      title: 'Net cash movement',
      meaning: 'Cash inflows minus cash outflows across selected liquid accounts.',
      interpretation:
        'Above zero means those accounts gained cash overall. Transfers and borrowing count, so this is not the same as net income minus spending.',
      unit: 'Report currency',
    },
    'opening-cash': {
      title: 'Opening cash',
      meaning:
        'The report calculation sums available balances for selected leaf asset accounts at the start of the period.',
      interpretation:
        'The calculation includes asset accounts beyond cash and bank accounts. If no opening balance snapshot is available, the displayed value falls back to zero.',
      unit: 'Report currency',
      basisNote: 'This is a starting balance snapshot, not a period inflow.',
    },
    'closing-cash': {
      title: 'Closing cash',
      meaning:
        'The report calculation sums available balances for selected leaf asset accounts at the end of the period.',
      interpretation:
        'The calculation includes asset accounts beyond cash and bank accounts. If no closing balance snapshot is available, the displayed value falls back to zero.',
      unit: 'Report currency',
      basisNote: 'This is an ending balance snapshot, not net cash movement.',
    },
  },
  spending: {
    'gross-spending': {
      title: 'Gross spending',
      meaning:
        'Positive posted changes on selected leaf expense accounts before refunds are subtracted.',
      interpretation: 'Refunds are shown separately and reduce net spending.',
      unit: 'Report currency',
    },
    refunds: {
      title: 'Refunds',
      meaning: 'The absolute amount of negative posted changes on selected leaf expense accounts.',
      interpretation: 'Refunds are shown as a positive amount and subtracted from gross spending.',
      unit: 'Report currency',
    },
    'net-spending': {
      title: 'Net spending',
      meaning: 'Gross expense activity minus refunds in the selected period.',
      interpretation:
        'A larger amount means more spending remained after refunds. Only classified expense entries on leaf accounts are included.',
      unit: 'Report currency',
    },
    'spending-journals': {
      title: 'Spending transactions',
      meaning: 'The number of distinct journals with selected leaf expense-account activity.',
      interpretation: 'A journal is counted once even if it contains multiple expense lines.',
      unit: 'Journals',
    },
    'average-spend': {
      title: 'Average transaction',
      meaning:
        'Gross spending divided by the number of selected expense-account postings used by the calculation.',
      interpretation:
        'This denominator counts expense lines, so a journal with multiple expense lines can contribute more than once. Refunds are not subtracted.',
      unit: 'Report currency per expense line',
    },
  },
  income: {
    'gross-income-detail': {
      title: 'Gross income',
      meaning: 'Positive posted changes on selected leaf income accounts before reversals.',
      interpretation: 'Income reversals are shown separately and reduce net income.',
      unit: 'Report currency',
    },
    'income-reversals': {
      title: 'Income reversals',
      meaning: 'The absolute amount of negative posted changes on selected leaf income accounts.',
      interpretation: 'Reversals are shown as a positive amount and subtracted from gross income.',
      unit: 'Report currency',
    },
    'net-income-detail': {
      title: 'Net income',
      meaning: 'Gross income minus income reversals on selected leaf income accounts.',
      interpretation:
        'This is income after reversals; it does not measure changes in cash or account balances.',
      unit: 'Report currency',
    },
    'income-journals': {
      title: 'Income transactions',
      meaning: 'The number of distinct journals with selected leaf income-account activity.',
      interpretation: 'A journal is counted once even if it contains multiple income lines.',
      unit: 'Journals',
    },
  },
  'net-worth': {
    assets: {
      title: 'Assets',
      meaning: 'The sum of available asset account balances at the end of the selected period.',
      interpretation:
        'Accounts without a readable balance are omitted, so missing balances can make this total incomplete.',
      unit: 'Report currency',
      basisNote:
        'This is an end-of-period balance snapshot; planned activity does not change the snapshot.',
    },
    liabilities: {
      title: 'Liabilities',
      meaning: 'The sum of available liability account balances at the end of the selected period.',
      interpretation:
        'Accounts without a readable balance are omitted, so missing balances can make this total incomplete.',
      unit: 'Report currency',
      basisNote:
        'This is an end-of-period balance snapshot; planned activity does not change the snapshot.',
    },
    'net-worth': {
      title: 'Net worth',
      meaning: 'Available ending assets minus available ending liabilities.',
      interpretation:
        'Above zero means reported assets exceed liabilities. Accounts without a readable balance are omitted, so missing balances or exchange rates can make the total incomplete.',
      unit: 'Report currency',
      basisNote:
        'This is an end-of-period balance snapshot; planned activity does not change the snapshot.',
    },
    'net-worth-change': {
      title: 'Net worth change',
      meaning:
        'Ending net worth minus the opening balance snapshot taken just before the selected period.',
      interpretation:
        'Positive means reported net worth increased over the period. It can differ from net flow because balance revaluations and other balance changes also affect it. Accounts without a readable balance are omitted.',
      unit: 'Report currency',
      basisNote: 'This compares actual opening and ending balance snapshots.',
    },
  },
  budgets: {
    budgeted: {
      title: 'Budgeted',
      meaning:
        'The sum of each included budget amount for every budget cycle that overlaps the selected period.',
      interpretation:
        'A partial cycle that overlaps the range counts as a full cycle in this total.',
      unit: 'Report currency',
    },
    'budget-actual': {
      title: 'Actual spending',
      meaning: 'Posted expense activity in the included budgets, after refunds.',
      interpretation:
        'Planned spending is kept separate and is not included in budget utilization.',
      unit: 'Report currency',
    },
    'budget-planned': {
      title: 'Planned spending',
      meaning: 'Scheduled expense activity in the included budgets, after planned refunds.',
      interpretation:
        'This is planned activity, not posted spending. It is reported separately from actual budget use.',
      unit: 'Report currency',
    },
  },
  debt: {
    'debt-opening': {
      title: 'Opening debt',
      meaning: 'The selected liability accounts’ balances at the start of the period.',
      interpretation:
        'If an opening balance cannot be found, the calculator starts that account at zero before applying recorded changes; the result can understate debt.',
      unit: 'Report currency',
    },
    'debt-closing': {
      title: 'Closing debt',
      meaning:
        'Opening debt plus posted balance changes for the selected liability accounts during the period.',
      interpretation:
        'Missing opening balances or exchange rates can make the result incomplete. Scheduled payments are not included in this closing balance.',
      unit: 'Report currency',
    },
    'debt-borrowings': {
      title: 'Borrowings',
      meaning:
        'Positive posted balance changes for the selected liability accounts during the period.',
      interpretation:
        'This is new debt recorded in the period; other balance adjustments are not classified as borrowings.',
      unit: 'Report currency',
    },
    'debt-payments': {
      title: 'Debt payments',
      meaning:
        'The absolute amounts of posted changes classified as debt payments or paydowns, plus negative liability balance changes.',
      interpretation:
        'Payments are shown as a positive amount. The total does not separate principal from interest or fees.',
      unit: 'Report currency',
    },
    'debt-utilization': {
      title: 'Debt utilization',
      meaning:
        'Closing balances divided by recorded positive credit limits, summed across the selected liability accounts.',
      interpretation:
        'Unavailable means no positive credit limit is recorded. Accounts without a recorded limit do not contribute to the denominator.',
      unit: 'Percent of recorded credit limits',
    },
  },
  forecast: {
    'scheduled-inflows': {
      title: 'Scheduled inflows',
      meaning:
        'Planned positive balance movements in the selected cash accounts during the period.',
      interpretation:
        'These are expected amounts from scheduled activity, not posted cash received.',
      unit: 'Report currency',
      basisNote:
        'Forecasts include planned activity when it is available in the selected report basis.',
    },
    'scheduled-outflows': {
      title: 'Scheduled outflows',
      meaning:
        'Planned negative balance movements in the selected cash accounts during the period, shown as a positive total.',
      interpretation: 'These are expected amounts from scheduled activity, not posted cash paid.',
      unit: 'Report currency',
      basisNote:
        'Forecasts include planned activity when it is available in the selected report basis.',
    },
    'projected-closing-cash': {
      title: 'Projected closing cash',
      meaning:
        'Available opening cash plus actual and planned cash movements through the end of the period.',
      interpretation:
        'This is a projection, not a balance snapshot. It depends on recorded opening balances and scheduled entries being complete.',
      unit: 'Report currency',
      basisNote:
        'Forecasts include planned activity when it is available in the selected report basis.',
    },
  },
  health: {
    'health-errors': {
      title: 'Report errors',
      meaning: 'The count of error-level findings from report health checks and this report run.',
      interpretation:
        'Open the Report health details to see the affected data and whether totals may be incomplete.',
      unit: 'Findings',
    },
    'health-warnings': {
      title: 'Report warnings',
      meaning: 'The count of warning-level findings from report health checks and this report run.',
      interpretation:
        'Warnings flag data that may need review; open the details to see the affected accounts or entries.',
      unit: 'Findings',
    },
    'health-info': {
      title: 'Report information',
      meaning: 'The count of informational findings from report health checks and this report run.',
      interpretation: 'Information items provide context and do not necessarily indicate an error.',
      unit: 'Findings',
    },
  },
};

const visualizationExplanations: Readonly<Record<string, ReportExplanationCopy>> = {
  overview: {
    title: 'Income and spending by period',
    meaning:
      'Each group compares net income with net spending for one chart interval. Spending is drawn below zero for comparison.',
    interpretation:
      'Compare the bars in each interval; this chart is not stacked and does not show cash account movements.',
    unit: 'Report currency per interval',
  },
  'cash-flow': {
    title: 'Net cash movement by period',
    meaning:
      'Each point is cash inflows minus outflows for selected cash and bank accounts in that interval.',
    interpretation:
      'A positive point means cash increased in those accounts. Transfers and borrowing can contribute.',
    unit: 'Report currency per interval',
  },
  spending: {
    title: 'Net spending by period',
    meaning: 'Each bar is gross expense activity minus refunds in that interval.',
    interpretation: 'Higher bars mean more net spending for that part of the selected period.',
    unit: 'Report currency per interval',
  },
  income: {
    title: 'Net income by period',
    meaning: 'Each bar is gross income minus income reversals in that interval.',
    interpretation: 'Higher bars mean more net income for that part of the selected period.',
    unit: 'Report currency per interval',
  },
  'net-worth': {
    title: 'Net worth over time',
    meaning:
      'Each point starts with the opening balance snapshot and applies dated account changes through that interval.',
    interpretation:
      'This is a reconstructed history, not a separate balance snapshot for each date. Unrecorded adjustments or missing balances can make it approximate.',
    unit: 'Report currency',
    basisNote: 'Planned changes appear only when included in the selected report basis.',
  },
  forecast: {
    title: 'Projected cash over time',
    meaning: 'Each point is opening cash plus actual and planned movements through that date.',
    interpretation:
      'The line is a projection; later points depend on scheduled activity being complete.',
    unit: 'Report currency',
    basisNote:
      'Forecasts include planned activity when it is available in the selected report basis.',
  },
};

export function explanationForMetric(
  sectionId: string,
  metricId: string,
): ReportExplanationCopy | undefined {
  return metricExplanations[sectionId]?.[metricId];
}

export function explanationForVisualization(
  sectionId: string,
  visualization: ReportVisualization,
): ReportExplanationCopy | undefined {
  const copy = visualizationExplanations[sectionId];
  if (!copy) return undefined;
  if (visualization.kind === 'STACKED_BAR') {
    return {
      ...copy,
      interpretation: `${copy.interpretation} Series are stacked within each interval.`,
    };
  }
  return copy;
}

export function explanationForBudgetUtilization(): ReportExplanationCopy {
  return {
    title: 'Budget utilization',
    meaning:
      'For each budget, actual net spending divided by the budget amount accrued for cycles overlapping the selected period.',
    interpretation:
      '100% means actual spending equals the accrued budget. Above 100% means it is over budget. Planned spending is excluded; utilization is unavailable when the accrued budget is zero.',
    unit: 'Percent of budget',
  };
}

export function explanationContextItems(
  context: ReportsV2ExplanationContext,
  basisNote?: string,
): ExplanationContextItem[] {
  return [
    { label: 'Period', value: context.periodLabel },
    { label: 'Accounts', value: context.accountScopeLabel },
    { label: 'Activity basis', value: context.basisLabel },
    ...(basisNote ? [{ label: 'Balance or forecast basis', value: basisNote }] : []),
    { label: 'Comparison', value: context.comparisonLabel },
    { label: 'Archived accounts', value: context.archivedAccountsLabel },
  ];
}

export function explanationContextFromFilters(
  filters: Pick<
    ReportsV2FiltersViewModel,
    | 'periodLabel'
    | 'accountScopeLabel'
    | 'basis'
    | 'comparison'
    | 'includeArchivedAccounts'
    | 'targetCurrency'
  >,
): ReportsV2ExplanationContext {
  return {
    periodLabel: filters.periodLabel,
    accountScopeLabel: filters.accountScopeLabel,
    basisLabel: filters.basis === 'ACTUAL_PLUS_PLANNED' ? 'Actual + planned' : 'Actual',
    comparisonLabel:
      filters.comparison === 'NONE'
        ? 'None'
        : filters.comparison === 'PREVIOUS_YEAR'
          ? 'Previous year'
          : 'Previous period',
    archivedAccountsLabel: filters.includeArchivedAccounts ? 'Included' : 'Active only',
    currencyCode: filters.targetCurrency,
  };
}

export function reportExplanationDataNotes(warnings: readonly ReportWarning[]): string[] {
  const warningCodes = new Set(warnings.map(warning => warning.code));
  return [
    'Money values use the report currency and historical exchange rates where conversion is needed.',
    warningCodes.has('MISSING_EXCHANGE_RATE')
      ? 'Cross-currency entries without an available historical rate are omitted; report amounts may be incomplete.'
      : undefined,
    warningCodes.has('MISSING_ACCOUNT')
      ? 'Entries that refer to a missing account may be omitted.'
      : undefined,
    warningCodes.has('STALE_BALANCE_PROJECTION')
      ? 'Some stored balances differ from ledger-derived balances; review Report health before relying on balance totals.'
      : undefined,
    warningCodes.has('INVALID_AMOUNT')
      ? 'Some invalid amounts were found; affected totals may be incomplete.'
      : undefined,
  ].filter((note): note is string => Boolean(note));
}
