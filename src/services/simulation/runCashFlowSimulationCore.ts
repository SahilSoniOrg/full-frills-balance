import Journal from '@/src/data/models/Journal';
import { projectBudgetCapacities } from '@/src/services/budget/budgetProjectionProvider';
import { AccountId } from '@/src/types/ids';
import { Trace } from '@/src/utils/TraceService';
import { LiabilityFlowGenerator } from './engines/LiabilityFlowGenerator';
import { PlannedFlowGenerator } from './engines/PlannedFlowGenerator';
import { composeSpending, sortTimeline } from './ProjectionComposer';
import { Simulator } from './Simulator';
import type {
  LiabilityMetadata,
  SimulationBudget,
  SimulationContext,
  SimulationEngineResult,
  SimulationLiabilityAccount,
  SimulationPlannedPayment,
} from './types';
import type { BudgetUsage } from '@/src/services/budget/types';

export interface CashFlowSimulationCoreInput {
  context: SimulationContext;
  plannedPayments: readonly SimulationPlannedPayment[];
  plannedJournals: readonly Journal[];
  expenseAccountIds: ReadonlySet<string>;
  journalTxsMap: ReadonlyMap<string, import('@/src/data/models/Transaction').default[]>;
  budgets: readonly SimulationBudget[];
  usages: readonly BudgetUsage[];
  budgetCategoryMap: ReadonlyMap<string, Set<string>>;
  liabilityBalances: readonly { account: SimulationLiabilityAccount; balance: number }[];
  metadataMap: ReadonlyMap<string, LiabilityMetadata>;
  statementBalances: ReadonlyMap<string, number>;
  settledSinceStatement: ReadonlyMap<string, number>;
  startingBalances: ReadonlyMap<AccountId, number>;
  trace?: Trace;
  precision: number;
}

/** Flow generation stays on RN: it still consumes ORM models and recurrence services. */
export function generateCashFlowTimeline(input: CashFlowSimulationCoreInput) {
  const {
    context,
    plannedPayments,
    plannedJournals,
    expenseAccountIds,
    journalTxsMap,
    budgets,
    usages,
    budgetCategoryMap,
    liabilityBalances,
    metadataMap,
    statementBalances,
    settledSinceStatement,
    trace,
  } = input;

  const filteredBudgets: SimulationBudget[] = [];
  const filteredUsages: BudgetUsage[] = [];
  budgets.forEach((budget, index) => {
    const categories = budgetCategoryMap.get(budget.id);
    if (!categories || categories.size === 0) return;
    filteredBudgets.push(budget);
    filteredUsages.push(usages[index] || { remaining: 0 });
  });

  const scheduledProjections = PlannedFlowGenerator.generate(
    context,
    [...plannedPayments],
    [...plannedJournals],
    new Set(expenseAccountIds),
    new Map(journalTxsMap),
  );

  const budgetCapacities = projectBudgetCapacities(
    context,
    filteredBudgets,
    filteredUsages,
    new Map(budgetCategoryMap),
  );
  trace?.metric('flow_gen_domain');

  const resolvedSpendingFlows = composeSpending(budgetCapacities, scheduledProjections, context);

  const liabilityFlows = LiabilityFlowGenerator.generate(
    context,
    resolvedSpendingFlows,
    [...liabilityBalances],
    new Map(metadataMap),
    new Map(statementBalances),
    new Map(settledSinceStatement),
  );
  trace?.metric('flow_gen_liability');

  const allFlows = sortTimeline([...resolvedSpendingFlows, ...liabilityFlows]);
  trace?.metric('flow_generation');

  return allFlows;
}

/** Synchronous entry point retained for setup/draft callers. */
export function runCashFlowSimulationCore(input: CashFlowSimulationCoreInput): {
  simulationResult: SimulationEngineResult;
  allFlows: ReturnType<typeof sortTimeline>;
} {
  const allFlows = generateCashFlowTimeline(input);
  const simulationResult = Simulator.simulate(
    new Map(input.startingBalances),
    allFlows,
    input.context.simulationDays,
    input.context.liquidAccountIds,
    input.context.orderedLiquidAccountIds,
    0,
    input.context.simulationStartMs,
    input.trace,
    input.precision,
  );
  input.trace?.metric('simulation_execution');
  return { simulationResult, allFlows };
}
