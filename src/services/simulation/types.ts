import { AccountSubtype } from '@/src/data/models/Account';

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

// These interfaces are used by the UI (Dashboard / SafeToSpend)
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

// New V2-based SafeToSpendResult summary shape
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
  metadata: {
    firstMajorInflowDay: number | null;
    committedSubtypes: AccountSubtype[];
    debtSubtypes: AccountSubtype[];
  };
}
