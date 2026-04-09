export type FlowMeta = {
  source: 'BUDGET' | 'PLANNED' | 'LIABILITY' | 'TRANSFER' | 'RESOLVED';
  originalSource?: 'BUDGET' | 'PLANNED';
  referenceId?: string;
  categoryId?: string;
  categoryIds?: string[];
  label: string;
  tags?: string[];
};

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
