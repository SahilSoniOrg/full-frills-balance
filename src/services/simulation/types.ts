import Account, { AccountSubtype } from '@/src/data/models/Account';
import Budget from '@/src/data/models/Budget';
import Journal from '@/src/data/models/Journal';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import { BudgetUsage } from '@/src/services/budget/budgetReadService';

export enum FlowSource {
  BUDGET = 'BUDGET',
  PLANNED_PAYMENT = 'PLANNED_PAYMENT',
  PLANNED_JOURNAL = 'PLANNED_JOURNAL',
  LIABILITY = 'LIABILITY',
}

export enum FlowType {
  INFLOW = 'INFLOW',
  OUTFLOW = 'OUTFLOW',
  CC_DATE = 'CC_DATE',
}

export enum DebtType {
  FALLBACK = 'FALLBACK',
  BUDGET = 'BUDGET',
  PLANNED_PAYMENT = 'PLANNED_PAYMENT',
  PLANNED_JOURNAL = 'PLANNED_JOURNAL',
}

export interface Flow {
  dayOffset: number;
  amount: number; // In result currency
  source: FlowSource;
  type: FlowType;
  accountId?: string;
  sourceAccountId?: string;
  targetAccountId?: string;
  name: string;
  id?: string;
  context?: string;
}

export interface PlannedOutflow {
  dayOffset: number;
  accountId: string;
  amount: number;
}

export interface CommitmentDetail {
  id: string;
  name: string;
  amount: number;
  type: DebtType;
  dayOffset?: number;
}

export interface AccountCommitment {
  accountId: string;
  accountName: string;
  amount: number;
  details: CommitmentDetail[];
}

export interface DebtEntry {
  accountId: string;
  accountName: string;
  amount: number;
  type: DebtType;
  dayOffset: number;
}

export interface IncomeEntry {
  id: string;
  name: string;
  amount: number;
  dayOffset: number;
  type: FlowSource;
}

export interface ProjectionPoint {
  timestamp: number;
  value: number;
  isProjected: boolean;
  details?: { name: string; amount: number; type: FlowType; context?: string }[];
  dailyBurn?: number;
  accountBalances?: Map<string, number>;
  dayOffset?: number;
}

export interface AccountSimulationSummary {
  accountId: string;
  accountName: string;
  startingBalance: number;
  safeToSpend: number;
  shortfall: number;
  minBalance: number;
  usageDetails?: {
    totalInflow: number;
    totalOutflow: number;
    topInflows: {
      id?: string;
      name: string;
      amount: number;
      source?: string;
      isPostIncome?: boolean;
    }[];
    topOutflows: {
      id?: string;
      name: string;
      amount: number;
      source?: string;
      isPostIncome?: boolean;
    }[];
  };
}

export interface SimulationResult {
  summary: {
    safeToSpend: number;
    shortfall: number;
    trajectoryMinBalance: number;
    safeDaysCount: number | null;
    totalFutureInflow: number;
    totalOrganicOutflow: number;
    totalOrganicInflow: number;
    totalCommittedPlanned: number;
    firstMajorInflowDay: number | null;
  };
  accountSummaries?: AccountSimulationSummary[];
  breakdowns: {
    committed: AccountCommitment[];
    debt: DebtEntry[];
    income: IncomeEntry[];
    budget: {
      currentMonthRemaining: number;
      nextMonthProjected: number;
      nextMonthDays: number;
    };
    liabilities: {
      total: number;
      totalCreditCard: number;
      totalOther: number;
      committed: number;
      committedCreditCard: number;
      committedOther: number;
    };
  };
  projections: {
    points: ProjectionPoint[];
    dailyBudgetBurns: number[];
    flowByDayOffset: Map<number, number>;
    safeToSpendDailyBreakdown: Map<
      number,
      { name: string; amount: number; type: FlowType; context?: string }[]
    >;
  };
  allFlows?: any[];
  metadata: {
    firstMajorInflowDay: number | null;
    committedSubtypes: AccountSubtype[];
    debtSubtypes: AccountSubtype[];
  };
}

export interface BudgetEngineResult {
  flows: Flow[];
  dailyBudgetBurns: number[]; // Global sum
  dailyAssetAccountBurns: Map<string, number[]>; // Per asset account
  commitments: AccountCommitment[];
  budgetCoveredExpenseAccountIds: Set<string>;
  currentMonthRemaining: number;
  nextMonthProjected: number;
}

export interface PlannedFlowResult {
  flows: Flow[];
  plannedOutflows: PlannedOutflow[];
  commitments: AccountCommitment[];
  income: IncomeEntry[];
  organicInflow: number;
  organicOutflow: number;
  coverageMap: Map<string, number>;
}

export interface LiabilityResult {
  flows: Flow[];
  commitments: AccountCommitment[];
  debtEntries: DebtEntry[];
  total: number;
  totalCreditCard: number;
  totalOther: number;
  committed: number;
  committedCreditCard: number;
  committedOther: number;
}

export interface ISimulationService {
  simulate(
    startingBalances: Map<string, number>,
    plannedPayments: PlannedPayment[],
    plannedJournals: Journal[],
    liquidAssetIds: string[],
    liabilityAccountBalances: { account: Account; balance: number }[],
    budgets: Budget[],
    usages: BudgetUsage[],
    allAccounts: Account[],
    resultCurrency: string,
  ): Promise<SimulationResult>;
}
