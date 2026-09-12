import type { AccountId } from '@/src/types/ids';

/** Monetary amounts are always expressed in the report query's target currency. */
export interface MoneyMeasure {
  readonly kind: 'MONEY';
  readonly amount: number;
  readonly currencyCode: string;
}

export interface PercentageMeasure {
  readonly kind: 'PERCENTAGE';
  readonly value: number;
}

export interface CountMeasure {
  readonly kind: 'COUNT';
  readonly value: number;
}

export interface RatioMeasure {
  readonly kind: 'RATIO';
  readonly value: number;
}

export type ReportMeasure = MoneyMeasure | PercentageMeasure | CountMeasure | RatioMeasure;

/** Positive magnitudes unless explicitly described as a net/change measure. */
export interface PeriodFlowMeasures {
  readonly grossIncome: MoneyMeasure;
  readonly incomeReversals: MoneyMeasure;
  readonly netIncome: MoneyMeasure;
  readonly grossExpense: MoneyMeasure;
  readonly refunds: MoneyMeasure;
  readonly netExpense: MoneyMeasure;
  /** Signed: income minus expense. */
  readonly netOperatingFlow: MoneyMeasure;
  readonly savingsRate: PercentageMeasure;
  readonly cashInflow: MoneyMeasure;
  readonly cashOutflow: MoneyMeasure;
  readonly internalTransfers: MoneyMeasure;
  readonly borrowing: MoneyMeasure;
  readonly debtPayments: MoneyMeasure;
  /** Signed equity movement. */
  readonly equityActivity: MoneyMeasure;
}

export interface BalanceMeasures {
  readonly assetsAtStart: MoneyMeasure;
  readonly assetsAtEnd: MoneyMeasure;
  readonly liabilitiesAtStart: MoneyMeasure;
  readonly liabilitiesAtEnd: MoneyMeasure;
  readonly netWorthAtStart: MoneyMeasure;
  readonly netWorthAtEnd: MoneyMeasure;
  /** Signed: ending net worth minus starting net worth. */
  readonly netWorthChange: MoneyMeasure;
  readonly cashEquivalentBalance: MoneyMeasure;
  readonly debtUtilization?: PercentageMeasure;
}

export interface ReconciliationMeasures {
  readonly netIncome: MoneyMeasure;
  readonly netWorthChange: MoneyMeasure;
  readonly contributionsAndWithdrawals: MoneyMeasure;
  readonly transfers: MoneyMeasure;
  readonly debtPrincipalMovement: MoneyMeasure;
  readonly currencyValuationMovement: MoneyMeasure;
  /** Signed residual after known movements are accounted for. */
  readonly unexplainedDifference: MoneyMeasure;
}

export interface CashFlowMeasures {
  readonly openingCash: MoneyMeasure;
  readonly inflows: MoneyMeasure;
  readonly outflows: MoneyMeasure;
  readonly netCashMovement: MoneyMeasure;
  readonly internalTransfers: MoneyMeasure;
  readonly borrowing: MoneyMeasure;
  readonly debtPayments: MoneyMeasure;
  readonly closingCash: MoneyMeasure;
}

export interface SpendingMeasures {
  readonly grossExpense: MoneyMeasure;
  readonly refunds: MoneyMeasure;
  readonly netExpense: MoneyMeasure;
  readonly journalCount: CountMeasure;
  readonly averageTransactionSize: MoneyMeasure;
}

export interface IncomeMeasures {
  readonly grossIncome: MoneyMeasure;
  readonly reversals: MoneyMeasure;
  readonly netIncome: MoneyMeasure;
  readonly journalCount: CountMeasure;
}

export interface BudgetMeasures {
  readonly budgeted: MoneyMeasure;
  readonly actualGrossExpense: MoneyMeasure;
  readonly refunds: MoneyMeasure;
  readonly actualNetExpense: MoneyMeasure;
  /** Signed: budgeted minus actual net expense. */
  readonly remaining: MoneyMeasure;
  readonly percentageUsed: PercentageMeasure;
  readonly unbudgetedExpense: MoneyMeasure;
}

export interface DebtMeasures {
  readonly openingBalance: MoneyMeasure;
  readonly closingBalance: MoneyMeasure;
  readonly borrowing: MoneyMeasure;
  readonly principalPayments: MoneyMeasure;
  readonly interestAndFees: MoneyMeasure;
  readonly totalPayments: MoneyMeasure;
  readonly utilization?: PercentageMeasure;
}

export interface ForecastMeasures {
  readonly scheduledInflows: MoneyMeasure;
  readonly scheduledOutflows: MoneyMeasure;
  readonly projectedNetMovement: MoneyMeasure;
  readonly projectedClosingCash: MoneyMeasure;
}

export interface HealthMeasures {
  readonly unbalancedJournals: CountMeasure;
  readonly missingAccounts: CountMeasure;
  readonly uncategorizedActivity: MoneyMeasure;
  readonly missingExchangeRates: CountMeasure;
  readonly duplicateReversalActivity: CountMeasure;
  readonly archivedAccountActivity: CountMeasure;
}

export interface AccountBreakdownMeasure {
  readonly accountId: AccountId;
  readonly value: MoneyMeasure;
  readonly percentage?: PercentageMeasure;
}
