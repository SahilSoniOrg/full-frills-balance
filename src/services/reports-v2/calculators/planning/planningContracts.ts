export type PlanningAccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE' | string;

export type PlanningFact = {
  workplaceId?: string;
  journalId: string;
  transactionId?: string;
  journalDate: number;
  journalStatus?: string;
  isPlanned?: boolean;

  accountId: string;
  accountType: PlanningAccountType;
  accountSubtype?: string;
  accountPath?: readonly string[];
  isLeafAccount?: boolean;

  transactionType?: string;
  amount: number;
  currencyCode?: string;
  historicalBaseAmount?: number;
  exchangeRate?: number;
  signedBalanceDelta?: number;

  journalDisplayType?: string;
  semanticType?: string;
  description?: string;
  notes?: string;
  plannedPaymentId?: string;

  originalJournalId?: string;
  reversingJournalId?: string;
  balanceAfter?: number;
  debtComponent?: string;
  paymentComponent?: string;
};

export type PlanningAccount = {
  id: string;
  name?: string;
  accountType: PlanningAccountType;
  accountSubtype?: string;
  currencyCode?: string;
  parentAccountId?: string;
  isCashEquivalent?: boolean;
  archivedAt?: number | Date | null;
  archived?: boolean;
  balance?: number;
  currentBalance?: number;
  openingBalance?: number;
  balanceAtStart?: number;
  balanceAtEnd?: number;
  storedBalance?: number;
  computedBalance?: number;
  metadata?: PlanningDebtMetadata;
  creditLimitAmount?: number;
  minimumPaymentAmount?: number;
  minimumPaymentPercent?: number;
  dueDay?: number;
  payFromAccountId?: string;
};

export type PlanningDebtMetadata = {
  creditLimitAmount?: number;
  minimumPaymentAmount?: number;
  minimumPaymentPercent?: number;
  dueDay?: number;
  payFromAccountId?: string;
};

export type PlanningBudget = {
  id: string;
  name?: string;
  amount: number;
  currencyCode?: string;
  intervalType?: string;
  intervalN?: number;
  startDate?: number;
  recurrenceDay?: number;
  recurrenceMonth?: number;
  leafAccountIds?: readonly string[];
  scopedLeafAccountIds?: readonly string[];
  accountScope?: readonly string[] | ReadonlySet<string>;
  accountIds?: readonly string[];
};

export type PlanningPeriod = {
  startDate: number;
  endDate: number;
  asOfDate?: number;
};

export type FactStreamsInput = {
  facts?: readonly PlanningFact[];
  actualFacts?: readonly PlanningFact[];
  postedFacts?: readonly PlanningFact[];
  plannedFacts?: readonly PlanningFact[];
};

export type NumberLookup = ReadonlyMap<string, number> | Readonly<Record<string, number>>;

export type BudgetPerformanceInput = FactStreamsInput & {
  budgets: readonly PlanningBudget[];
  period?: PlanningPeriod;
  precision?: number;
};

export type BudgetAmountSummary = {
  grossExpense: number;
  refunds: number;
  netExpense: number;
  journalIds: string[];
  accountIds: string[];
};

export type BudgetPerformanceRow = BudgetAmountSummary & {
  budgetId: string;
  name: string;
  budgetedAmount: number;
  remainingAmount: number;
  percentageUsed: number | null;
  variance: number;
  expectedSpendAtCurrentPace: number | null;
  actualGrossExpense: number;
  actualRefunds: number;
  actualNetExpense: number;
  plannedGrossExpense: number;
  plannedRefunds: number;
  plannedNetExpense: number;
  plannedJournalIds: string[];
  plannedAccountIds: string[];
};

export type BudgetPerformanceResult = {
  budgets: BudgetPerformanceRow[];
  unbudgeted: {
    actualGrossExpense: number;
    actualRefunds: number;
    actualNetExpense: number;
    actualJournalIds: string[];
    plannedGrossExpense: number;
    plannedRefunds: number;
    plannedNetExpense: number;
    plannedJournalIds: string[];
  };
  totals: {
    budgetedAmount: number;
    actualGrossExpense: number;
    actualRefunds: number;
    actualNetExpense: number;
    plannedGrossExpense: number;
    plannedRefunds: number;
    plannedNetExpense: number;
  };
};

export type DebtCalculationInput = FactStreamsInput & {
  accounts: readonly PlanningAccount[];
  period?: PlanningPeriod;
  openingBalances?: NumberLookup;
  closingBalances?: NumberLookup;
  precision?: number;
};

export type DebtAccountResult = {
  accountId: string;
  name: string;
  accountSubtype?: string;
  openingBalance: number;
  closingBalance: number;
  balanceChange: number;
  openingBalanceKnown: boolean;
  borrowings: number;
  totalPayments: number;
  balanceAdjustments: number;
  principalRepayment: number | null;
  interestAndFees: number | null;
  plannedBorrowings: number;
  plannedPayments: number;
  plannedClosingBalance: number;
  creditLimitAmount: number | null;
  utilizationPercent: number | null;
  minimumPaymentAmount: number | null;
  minimumPaymentPercent: number | null;
  dueDay: number | null;
  payFromAccountId?: string;
  journalIds: string[];
  plannedJournalIds: string[];
};

export type DebtReportResult = {
  accounts: DebtAccountResult[];
  totals: {
    openingBalance: number;
    closingBalance: number;
    balanceChange: number;
    borrowings: number;
    totalPayments: number;
    balanceAdjustments: number;
    principalRepayment: number | null;
    interestAndFees: number | null;
    plannedBorrowings: number;
    plannedPayments: number;
    plannedClosingBalance: number;
    creditLimitAmount: number;
    utilizationPercent: number | null;
  };
};

export type ForecastInput = FactStreamsInput & {
  accounts?: readonly PlanningAccount[];
  cashAccountIds?: readonly string[];
  startingCashBalance?: number;
  startingCashBalances?: NumberLookup;
  period: PlanningPeriod;
  lowBalanceThreshold?: number;
  precision?: number;
};

export type ForecastTimelinePoint = {
  date: string;
  timestamp: number;
  actualInflow: number;
  actualOutflow: number;
  actualNetMovement: number;
  plannedInflow: number;
  plannedOutflow: number;
  plannedNetMovement: number;
  actualBalance: number;
  projectedBalance: number;
};

export type ForecastUpcoming = {
  journalId: string;
  date: string;
  timestamp: number;
  amount: number;
  plannedPaymentId?: string;
  description?: string;
};

export type ForecastResult = {
  cashAccountIds: string[];
  startingCashBalance: number;
  timeline: ForecastTimelinePoint[];
  upcoming: ForecastUpcoming[];
  warnings: {
    code: 'LOW_PROJECTED_BALANCE';
    date: string;
    balance: number;
    threshold: number;
  }[];
  totals: {
    actualInflow: number;
    actualOutflow: number;
    actualNetMovement: number;
    plannedInflow: number;
    plannedOutflow: number;
    plannedNetMovement: number;
    endingActualBalance: number;
    endingProjectedBalance: number;
  };
};

export type HealthJournal = {
  id: string;
  status?: string;
  originalJournalId?: string;
  reversingJournalId?: string;
};

export type BalanceCheck = {
  accountId: string;
  storedBalance: number;
  computedBalance: number;
};

export type ReportHealthInput = FactStreamsInput & {
  accounts: readonly PlanningAccount[];
  period?: PlanningPeriod;
  journals?: readonly HealthJournal[];
  targetCurrency?: string;
  supportedAccountSubtypes?: readonly string[];
  balanceChecks?: readonly BalanceCheck[];
  precision?: number;
};

export type ReportHealthDiagnostic = {
  code:
    | 'UNBALANCED_JOURNAL'
    | 'MISSING_ACCOUNT_REFERENCE'
    | 'UNCATEGORIZED_ACTIVITY'
    | 'MISSING_EXCHANGE_RATE'
    | 'DUPLICATE_REVERSAL_ACTIVITY'
    | 'PLANNED_IN_ACTUALS'
    | 'ARCHIVED_ACCOUNT_ACTIVITY'
    | 'STALE_BALANCE_PROJECTION'
    | 'UNSUPPORTED_ACCOUNT_SUBTYPE'
    | 'INVALID_AMOUNT';
  severity: 'ERROR' | 'WARNING' | 'INFO';
  message: string;
  count: number;
  journalIds?: string[];
  accountIds?: string[];
};

export type ReportHealthResult = {
  isHealthy: boolean;
  diagnostics: ReportHealthDiagnostic[];
  summary: {
    errorCount: number;
    warningCount: number;
    infoCount: number;
  };
};
