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

export function runCashFlowSimulationCore(input: {
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
}): { simulationResult: SimulationEngineResult; allFlows: ReturnType<typeof sortTimeline> } {
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
    startingBalances,
    trace,
    precision,
  } = input;

  const budgetEntries = budgets.map((budget, index) => ({
    budget,
    usage: usages[index] || { remaining: 0 },
    categories: budgetCategoryMap.get(budget.id),
  }));
  const budgetEntriesWithCategories = budgetEntries.filter(
    entry => entry.categories && entry.categories.size > 0,
  );
  const filteredBudgets = budgetEntriesWithCategories.map(entry => entry.budget);
  const filteredUsages = budgetEntriesWithCategories.map(entry => entry.usage);

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

  const resolvedSpendingFlows = composeSpending(
    budgetCapacities,
    scheduledProjections,
    context,
  );

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

  const simulationResult = Simulator.simulate(
    new Map(startingBalances),
    allFlows,
    context.simulationDays,
    context.liquidAccountIds,
    context.orderedLiquidAccountIds,
    0,
    context.simulationStartMs,
    trace,
    precision,
  );
  trace?.metric('simulation_execution');

  return { simulationResult, allFlows };
}
