import Account, { AccountSubtype } from '@/src/data/models/Account';

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

// --- Engine Internal Types ---

export type FlowMeta = {
  source: 'BUDGET' | 'PLANNED' | 'LIABILITY' | 'TRANSFER' | 'RESOLVED';
  originalSource?: 'BUDGET' | 'PLANNED';
  referenceId?: string;
  categoryId?: string;
  categoryIds?: string[];
  label: string;
  tags?: string[];
  allowCascade?: boolean;
};

export type FlowKind = 'INFLOW' | 'OUTFLOW' | 'TRANSFER';

export interface SimulationContext {
  simulationStartMs: number;
  simulationDays: number;
  simulationEndMs: number;
  resultCurrency: string;
  liquidAccountIds: Set<string>;
  orderedLiquidAccountIds: string[];
  liabilityAccountIds: Set<string>;
  accountMap: Map<string, Account>;
  convert: (amount: number, from: string) => number;
}

export interface ISimulationEngine {
  generate(context: SimulationContext, previousFlows: Flow[]): Flow[];
}

export type Flow =
  | {
      kind: 'INFLOW';
      accountId: string;
      amount: number;
      dayOffset: number;
      meta?: FlowMeta;
    }
  | {
      kind: 'OUTFLOW';
      accountId: string;
      amount: number;
      dayOffset: number;
      meta?: FlowMeta;
    }
  | {
      kind: 'TRANSFER';
      fromAccountId: string;
      toAccountId: string;
      amount: number;
      dayOffset: number;
      meta?: FlowMeta;
    };

export interface SimulationEngineResult {
  summary: {
    safeToSpend: number;
    shortfall: number;
    trajectoryMinBalance: number;
    accountMinBalances: Map<string, number>;
    accountMinBalancesBeforeIncome: Map<string, number>;
    firstMajorInflowDay: number | null;
  };
  accountSummaries: AccountSimulationSummary[];
  projections: {
    timestamp: number;
    dayOffset: number;
    globalBalance: number;
    accountBalances: Map<string, number>;
    flows: Flow[];
  }[];
  allFlows: Flow[];
}

export interface Obligation {
  liabilityId: string;
  amount: number;
  dueDayOffset: number;
  label: string;
}

export interface SimulationRunResult {
  simulationResult: SimulationEngineResult;
  report: SimulationReport;
  accountSummaries: AccountSimulationSummary[];
  allFlows: Flow[];
  startingBalances: Map<string, number>;
  liquidAccountIdsSet: Set<string>;
  liabilityAccountBalances: { account: Account; balance: number }[];
  accountMap: Map<string, Account>;
}

// --- UI / Presentation Types ---

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

export interface SimulationReport {
  summary: {
    firstMajorInflowDay: number | null;
    totalFutureInflow: number;
    totalPlannedInflow: number;
    totalPlannedOutflow: number;
    totalCommittedPlanned: number;
  };
  income: IncomeEntry[];
  committed: AccountCommitment[];
  debt: DebtEntry[];
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
    totalPlannedOutflow: number;
    totalPlannedInflow: number;
    totalCommittedPlanned: number;
    firstMajorInflowDay: number | null;
  };
  accountSummaries?: AccountSimulationSummary[];
  metadata: {
    firstMajorInflowDay: number | null;
    committedSubtypes: AccountSubtype[];
    debtSubtypes: AccountSubtype[];
  };
}
