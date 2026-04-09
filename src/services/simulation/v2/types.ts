import Account from '@/src/data/models/Account';

export type FlowMeta = {
  source: 'BUDGET' | 'PLANNED' | 'LIABILITY' | 'TRANSFER' | 'RESOLVED';
  originalSource?: 'BUDGET' | 'PLANNED';
  referenceId?: string;
  categoryId?: string;
  categoryIds?: string[];
  label: string;
  tags?: string[];
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
  accountMap: Map<string, Account>; // Account model is often complex, using any for now but should be Account
  convert: (amount: number, from: string) => number;
}

export interface ISimulationEngine {
  generate(context: SimulationContext, previousFlows: Flow[]): Flow[];
}

export type Flow =
  | {
      kind: 'INFLOW';
      accountId: string;
      amount: number; // Always positive
      dayOffset: number;
      meta?: FlowMeta;
    }
  | {
      kind: 'OUTFLOW';
      accountId: string;
      amount: number; // Always positive
      dayOffset: number;
      meta?: FlowMeta;
    }
  | {
      kind: 'TRANSFER';
      fromAccountId: string;
      toAccountId: string;
      amount: number; // Always positive
      dayOffset: number;
      meta?: FlowMeta;
    };

export interface AccountSimulationSummary {
  accountId: string;
  accountName: string;
  startingBalance: number;
  safeToSpend: number;
  shortfall: number;
  minBalance: number;
  usageDetails: {
    totalInflow: number;
    totalOutflow: number;
    topInflows: { name: string; amount: number; source: string; isPostIncome: boolean }[];
    topOutflows: { name: string; amount: number; source: string; isPostIncome: boolean }[];
  };
}

export interface SimulationResultV2 {
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
