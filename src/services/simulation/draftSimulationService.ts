import { FlowCategory } from './types';
import type {
  SimulationBudget,
  SimulationEngineResult,
  SimulationLiabilityAccount,
  SimulationPlannedPayment,
} from './types';
import type { AccountId } from '@/src/types/ids';
import { getCurrencyPrecision } from '@/src/utils/currencyPrecision';
import { roundToPrecision } from '@/src/utils/money';
import { summarizeSimulationFlows } from './utils/simulationFlowSummary';
import { runCashFlowSimulationCore } from './runCashFlowSimulationCore';

export interface DraftSimulationScenario {
  readonly simulationStartMs: number;
  readonly simulationDays: number;
  readonly resultCurrency: string;
  readonly startingBalances: ReadonlyMap<AccountId, number>;
  readonly liquidAccountIds: readonly AccountId[];
  readonly liabilityBalances: readonly {
    account: SimulationLiabilityAccount;
    balance: number;
  }[];
  readonly plannedPayments: readonly SimulationPlannedPayment[];
  readonly budgets: readonly SimulationBudget[];
  readonly budgetCategoryMap: ReadonlyMap<string, Set<string>>;
}

export function simulateDraftScenario(input: DraftSimulationScenario): {
  readonly safeToSpend: number;
  readonly flowSummary: ReturnType<typeof summarizeSimulationFlows>;
  /** Budget capacity materialized inside the configured projection window. */
  readonly budgetReserveInWindow: number;
  readonly projections: SimulationEngineResult['projections'];
} {
  const liquidIds = [...input.liquidAccountIds];
  const precision = getCurrencyPrecision(input.resultCurrency);
  const liquidAccountIds = new Set(liquidIds);
  const context = {
    simulationStartMs: input.simulationStartMs,
    simulationDays: input.simulationDays,
    simulationEndMs: input.simulationStartMs + input.simulationDays * 24 * 60 * 60 * 1000 - 1,
    resultCurrency: input.resultCurrency,
    liquidAccountIds,
    orderedLiquidAccountIds: liquidIds,
    liabilityAccountIds: new Set(input.liabilityBalances.map(item => item.account.id)),
    convert: (amount: number) => amount,
  };

  const usages = input.budgets.map(budget => ({
    spent: 0,
    remaining: budget.amount,
    budgetAmount: budget.amount,
    usagePercent: 0,
  }));

  const { simulationResult, allFlows } = runCashFlowSimulationCore({
    context,
    plannedPayments: input.plannedPayments,
    plannedJournals: [],
    expenseAccountIds: new Set(),
    journalTxsMap: new Map(),
    budgets: [...input.budgets],
    usages,
    budgetCategoryMap: input.budgetCategoryMap,
    liabilityBalances: [...input.liabilityBalances],
    metadataMap: new Map(),
    statementBalances: new Map(),
    settledSinceStatement: new Map(),
    startingBalances: input.startingBalances,
    precision,
  });

  const budgetReserveInWindow = allFlows.reduce(
    (sum, flow) =>
      sum +
      (flow.timeframe === 'FUTURE' &&
      flow.category === FlowCategory.BUDGET &&
      flow.kind === 'OUTFLOW'
        ? flow.amount
        : 0),
    0,
  );

  return {
    safeToSpend: simulationResult.summary.safeToSpend,
    flowSummary: summarizeSimulationFlows(allFlows, liquidAccountIds, precision),
    budgetReserveInWindow: roundToPrecision(budgetReserveInWindow, precision),
    projections: simulationResult.projections,
  };
}
