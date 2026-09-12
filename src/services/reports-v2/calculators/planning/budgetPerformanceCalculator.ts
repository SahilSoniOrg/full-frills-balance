import type {
  BudgetAmountSummary,
  BudgetPerformanceInput,
  BudgetPerformanceResult,
  BudgetPerformanceRow,
  PlanningBudget,
  PlanningFact,
} from './planningContracts';
import {
  accountIds,
  inPeriod,
  isLeafFact,
  journalIds,
  periodProgress,
  roundAmount,
  selectActualFacts,
  selectPlannedFacts,
  signedDelta,
  unique,
} from './planningUtils';

function expenseFacts(facts: readonly PlanningFact[], period: BudgetPerformanceInput['period']) {
  return facts.filter(
    fact =>
      (!period || inPeriod(fact, period)) &&
      isLeafFact(fact) &&
      String(fact.accountType).toUpperCase() === 'EXPENSE',
  );
}

function summarize(facts: readonly PlanningFact[], precision: number): BudgetAmountSummary {
  let grossExpense = 0;
  let refunds = 0;
  for (const fact of facts) {
    const delta = signedDelta(fact);
    if (delta >= 0) grossExpense += delta;
    else refunds += Math.abs(delta);
  }
  return {
    grossExpense: roundAmount(grossExpense, precision),
    refunds: roundAmount(refunds, precision),
    netExpense: roundAmount(grossExpense - refunds, precision),
    journalIds: journalIds(facts),
    accountIds: accountIds(facts),
  };
}

function budgetAccountIds(budget: PlanningBudget): readonly string[] | undefined {
  const scope =
    budget.scopedLeafAccountIds ??
    budget.leafAccountIds ??
    budget.accountScope ??
    budget.accountIds;
  if (!scope) return undefined;
  return Array.from(scope instanceof Set ? scope : scope);
}

function factsForBudget(facts: readonly PlanningFact[], budget: PlanningBudget): PlanningFact[] {
  const ids = budgetAccountIds(budget);
  return ids === undefined ? [...facts] : facts.filter(fact => ids.includes(fact.accountId));
}

function mergeSummary(
  actual: BudgetAmountSummary,
  planned: BudgetAmountSummary,
  budget: PlanningBudget,
  period: BudgetPerformanceInput['period'],
  precision: number,
): BudgetPerformanceRow {
  const progress = period ? periodProgress(period, precision) : null;
  const remainingAmount = roundAmount(budget.amount - actual.netExpense, precision);
  return {
    budgetId: budget.id,
    name: budget.name ?? budget.id,
    budgetedAmount: roundAmount(budget.amount, precision),
    remainingAmount,
    percentageUsed:
      budget.amount === 0
        ? null
        : roundAmount((actual.netExpense / budget.amount) * 100, precision),
    variance: remainingAmount,
    expectedSpendAtCurrentPace:
      progress && progress > 0 ? roundAmount(actual.netExpense / progress, precision) : null,
    ...actual,
    actualGrossExpense: actual.grossExpense,
    actualRefunds: actual.refunds,
    actualNetExpense: actual.netExpense,
    plannedGrossExpense: planned.grossExpense,
    plannedRefunds: planned.refunds,
    plannedNetExpense: planned.netExpense,
    plannedJournalIds: planned.journalIds,
    plannedAccountIds: planned.accountIds,
  };
}

export function calculateBudgetPerformance(input: BudgetPerformanceInput): BudgetPerformanceResult {
  const precision = input.precision ?? 2;
  const actual = expenseFacts(selectActualFacts(input), input.period);
  const planned = expenseFacts(selectPlannedFacts(input), input.period);
  const rows = input.budgets.map(budget =>
    mergeSummary(
      summarize(factsForBudget(actual, budget), precision),
      summarize(factsForBudget(planned, budget), precision),
      budget,
      input.period,
      precision,
    ),
  );

  const budgetedIds = unique(input.budgets.flatMap(budget => budgetAccountIds(budget) ?? []));
  const unbudgetedActual = summarize(
    actual.filter(fact => !budgetedIds.includes(fact.accountId)),
    precision,
  );
  const unbudgetedPlanned = summarize(
    planned.filter(fact => !budgetedIds.includes(fact.accountId)),
    precision,
  );

  const total = rows.reduce(
    (acc, row) => ({
      budgetedAmount: acc.budgetedAmount + row.budgetedAmount,
      actualGrossExpense: acc.actualGrossExpense + row.actualGrossExpense,
      actualRefunds: acc.actualRefunds + row.actualRefunds,
      actualNetExpense: acc.actualNetExpense + row.actualNetExpense,
      plannedGrossExpense: acc.plannedGrossExpense + row.plannedGrossExpense,
      plannedRefunds: acc.plannedRefunds + row.plannedRefunds,
      plannedNetExpense: acc.plannedNetExpense + row.plannedNetExpense,
    }),
    {
      budgetedAmount: 0,
      actualGrossExpense: 0,
      actualRefunds: 0,
      actualNetExpense: 0,
      plannedGrossExpense: 0,
      plannedRefunds: 0,
      plannedNetExpense: 0,
    },
  );

  return {
    budgets: rows,
    unbudgeted: {
      actualGrossExpense: unbudgetedActual.grossExpense,
      actualRefunds: unbudgetedActual.refunds,
      actualNetExpense: unbudgetedActual.netExpense,
      actualJournalIds: unbudgetedActual.journalIds,
      plannedGrossExpense: unbudgetedPlanned.grossExpense,
      plannedRefunds: unbudgetedPlanned.refunds,
      plannedNetExpense: unbudgetedPlanned.netExpense,
      plannedJournalIds: unbudgetedPlanned.journalIds,
    },
    totals: {
      budgetedAmount: roundAmount(total.budgetedAmount, precision),
      actualGrossExpense: roundAmount(total.actualGrossExpense, precision),
      actualRefunds: roundAmount(total.actualRefunds, precision),
      actualNetExpense: roundAmount(
        total.actualNetExpense + unbudgetedActual.netExpense,
        precision,
      ),
      plannedGrossExpense: roundAmount(total.plannedGrossExpense, precision),
      plannedRefunds: roundAmount(total.plannedRefunds, precision),
      plannedNetExpense: roundAmount(
        total.plannedNetExpense + unbudgetedPlanned.netExpense,
        precision,
      ),
    },
  };
}
