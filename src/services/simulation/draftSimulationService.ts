import { budgetProjectionProvider } from '@/src/services/budget/budgetProjectionProvider';
import { PlannedFlowGenerator } from './engines/PlannedFlowGenerator';
import { LiabilityFlowGenerator } from './engines/LiabilityFlowGenerator';
import { ProjectionComposer } from './ProjectionComposer';
import { Simulator } from './Simulator';
import { summarizeSimulationFlows } from './utils/simulationFlowSummary';
import { normalizeSimulationFlows } from './utils/normalizeSimulationFlows';
import { FlowCategory } from './types';
import type {
  SimulationBudget,
  SimulationEngineResult,
  SimulationLiabilityAccount,
  SimulationPlannedPayment,
} from './types';
import type { AccountId } from '@/src/types/ids';

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

  const scheduled = PlannedFlowGenerator.generate(
    context,
    [...input.plannedPayments],
    [],
    new Set(),
    new Map(),
  );

  const capacities = budgetProjectionProvider.projectCapacities(
    context,
    [...input.budgets],
    input.budgets.map(budget => ({
      spent: 0,
      remaining: budget.amount,
      budgetAmount: budget.amount,
      usagePercent: 0,
    })),
    new Map(input.budgetCategoryMap),
  );

  const resolvedSpending = ProjectionComposer.composeSpending(capacities, scheduled, context);
  const liabilityFlows = LiabilityFlowGenerator.generate(
    context,
    resolvedSpending,
    [...input.liabilityBalances],
    new Map(),
    new Map(),
    new Map(),
  );
  const allFlows = ProjectionComposer.sortTimeline([...resolvedSpending, ...liabilityFlows]);
  const simulation = Simulator.simulate(
    new Map(input.startingBalances),
    allFlows,
    input.simulationDays,
    liquidAccountIds,
    liquidIds,
    0,
    input.simulationStartMs,
  );
  const normalizedFlows = normalizeSimulationFlows(allFlows);
  const budgetReserveInWindow = normalizedFlows.reduce(
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
    safeToSpend: simulation.summary.safeToSpend,
    flowSummary: summarizeSimulationFlows(normalizedFlows, liquidAccountIds),
    budgetReserveInWindow: Math.round((budgetReserveInWindow + Number.EPSILON) * 100) / 100,
    projections: simulation.projections,
  };
}
