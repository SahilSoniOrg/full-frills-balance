import { AccountSubtype, AccountType } from '@/src/types/enums';
import type { ReportingFact } from '../../types/fact';
import type { ReportPeriod } from '../../types/period';
import type { ReportQuery } from '../../types/query';

export type { ReportingFact } from '../../types/fact';
export type { ReportComparison, ReportGranularity, ReportPeriod } from '../../types/period';
export type { ReportQuery } from '../../types/query';

export type CalculatorPeriod = Pick<ReportPeriod, 'startDate' | 'endDate'> & {
  timeZone?: string;
};

export type CalculatorQuery = Pick<
  ReportQuery,
  'period' | 'targetCurrency' | 'comparison' | 'granularity'
> & {
  comparisonPeriod?: CalculatorPeriod;
};

export interface ReportBalanceInput {
  accountId: string;
  accountName?: string;
  accountType: AccountType | string;
  accountSubtype?: AccountSubtype | string;
  accountPath?: readonly string[];
  isLeafAccount?: boolean;
  balance: number;
  /** Optional explicit value when balance is not already in report currency. */
  reportCurrencyBalance?: number;
  currencyCode?: string;
}

export interface CalculatorInput {
  facts: readonly ReportingFact[];
  query: CalculatorQuery;
  comparisonFacts?: readonly ReportingFact[];
  openingBalances?: readonly ReportBalanceInput[];
  closingBalances?: readonly ReportBalanceInput[];
}

export interface ComparisonMetric {
  current: number;
  previous: number | null;
  change: number | null;
  percentChange: number | null;
}

export interface ReportBucket {
  startDate: number;
  endDate: number;
  label: string;
}

export interface FlowBucket extends ReportBucket {
  grossIncome: number;
  incomeReversals: number;
  netIncome: number;
  grossExpense: number;
  refunds: number;
  netExpense: number;
  netFlow: number;
  cashInflows: number;
  cashOutflows: number;
  netCashFlow: number;
  internalTransfers: number;
  borrowings: number;
  debtPayments: number;
  creditCardPayments: number;
}

export interface ReportGroup {
  key: string;
  label: string;
  accountId?: string;
  accountIds: string[];
  accountType: AccountType | string;
  accountSubtype?: AccountSubtype | string;
  accountPath: string[];
  grossAmount: number;
  reversalAmount: number;
  netAmount: number;
  /** Alias for chart consumers that use expense/income terminology. */
  amount: number;
  percentage: number;
  journalCount: number;
  averageTransactionSize: number;
}

export interface SpendingGroup extends ReportGroup {
  grossExpense: number;
  refunds: number;
  netExpense: number;
  isCreditCardPurchase: boolean;
}

export interface IncomeGroup extends ReportGroup {
  grossIncome: number;
  incomeReversals: number;
  netIncome: number;
}

export interface SpendingResult {
  startDate: number;
  endDate: number;
  currencyCode?: string;
  grossExpense: number;
  refunds: number;
  netExpense: number;
  journalCount: number;
  averageTransactionSize: number;
  byAccount: SpendingGroup[];
  bySubtype: SpendingGroup[];
  buckets: (ReportBucket & Pick<FlowBucket, 'grossExpense' | 'refunds' | 'netExpense'>)[];
  comparison: {
    grossExpense: ComparisonMetric;
    refunds: ComparisonMetric;
    netExpense: ComparisonMetric;
  } | null;
}

export interface IncomeResult {
  startDate: number;
  endDate: number;
  currencyCode?: string;
  grossIncome: number;
  incomeReversals: number;
  netIncome: number;
  journalCount: number;
  averageTransactionSize: number;
  byAccount: IncomeGroup[];
  bySubtype: IncomeGroup[];
  buckets: (ReportBucket & Pick<FlowBucket, 'grossIncome' | 'incomeReversals' | 'netIncome'>)[];
  comparison: {
    grossIncome: ComparisonMetric;
    incomeReversals: ComparisonMetric;
    netIncome: ComparisonMetric;
  } | null;
}

export interface CashFlowGroup {
  key: string;
  label: string;
  accountId?: string;
  accountIds: string[];
  accountSubtype?: AccountSubtype | string;
  inflows: number;
  outflows: number;
  netCashFlow: number;
  journalCount: number;
}

export interface CashFlowResult {
  startDate: number;
  endDate: number;
  currencyCode?: string;
  openingCashBalance: number | null;
  closingCashBalance: number | null;
  cashInflows: number;
  cashOutflows: number;
  netCashFlow: number;
  internalTransfers: number;
  borrowings: number;
  debtPayments: number;
  creditCardPayments: number;
  byAccount: CashFlowGroup[];
  bySubtype: CashFlowGroup[];
  buckets: (ReportBucket &
    Pick<
      FlowBucket,
      | 'cashInflows'
      | 'cashOutflows'
      | 'netCashFlow'
      | 'internalTransfers'
      | 'borrowings'
      | 'debtPayments'
      | 'creditCardPayments'
    >)[];
  comparison: {
    cashInflows: ComparisonMetric;
    cashOutflows: ComparisonMetric;
    netCashFlow: ComparisonMetric;
  } | null;
}

export interface OverviewResult {
  startDate: number;
  endDate: number;
  currencyCode?: string;
  grossIncome: number;
  netIncome: number;
  grossExpense: number;
  refunds: number;
  netExpense: number;
  netFlow: number;
  savingsRate: number | null;
  netWorthChange: number | null;
  buckets: FlowBucket[];
  topSpendingCategories: SpendingGroup[];
  comparison: {
    netIncome: ComparisonMetric;
    netExpense: ComparisonMetric;
    netFlow: ComparisonMetric;
  } | null;
}

export interface BalanceGroup {
  key: string;
  label: string;
  accountId?: string;
  accountIds: string[];
  accountType: AccountType | string;
  accountSubtype?: AccountSubtype | string;
  accountPath: string[];
  balance: number;
  percentage: number;
}

export interface BalanceState {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  byAccount: BalanceGroup[];
  bySubtype: BalanceGroup[];
}

export interface NetWorthHistoryPoint extends ReportBucket {
  totalAssets: number | null;
  totalLiabilities: number | null;
  netWorth: number | null;
  netWorthChange: number;
}

export interface NetWorthResult {
  startDate: number;
  endDate: number;
  currencyCode?: string;
  opening: BalanceState | null;
  closing: BalanceState | null;
  change: {
    assets: number | null;
    liabilities: number | null;
    netWorth: number;
  };
  netWorthChangeFromFacts: number;
  history: NetWorthHistoryPoint[];
  reconciliation: {
    actualChange: number;
    netIncome: number;
    contributions: number;
    withdrawals: number;
    transfers: number;
    debtPrincipalMovement: number;
    currencyValuationMovement: number;
    assetNonCashMovement: number;
    explainedChange: number | null;
    unexplainedDifference: number | null;
  };
  comparison: ComparisonMetric | null;
}

export interface NetWorthCalculatorInput extends CalculatorInput {
  comparisonOpeningBalances?: readonly ReportBalanceInput[];
  comparisonClosingBalances?: readonly ReportBalanceInput[];
}
