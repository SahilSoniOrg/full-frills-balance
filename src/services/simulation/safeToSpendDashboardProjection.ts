import type { AccountFields } from '@/src/types/plainDtos';
import { DailyDelta } from '@/src/data/repositories/TransactionTypes';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { AccountSubtype } from '@/src/types/enums';
import {
  FlowSource,
  FlowType,
  SimulationReport,
  SimulationEngineResult,
  SimulationRunResult,
  UnvaluedStartingBalance,
  SafeToSpendExplanation,
} from '@/src/services/simulation/types';
import { LIQUID_ASSET_SUBTYPES } from '@/src/utils/accountSubtypeUtils';
import { AppConfig } from '@/src/constants/app-config';
import { convertJournalLineAmount } from '@/src/services/currencyConversion';
import { runTasksWithBoundedConcurrency } from '@/src/utils/asyncConcurrency';
import { logger } from '@/src/utils/logger';
import { getCurrencyPrecision } from '@/src/utils/currencyPrecision';
import { Money, roundToPrecision } from '@/src/utils/money';
import dayjs, { Dayjs } from 'dayjs';
import { cashFlowSimulationService } from '@/src/services/simulation/CashFlowSimulationService';
import type { SafeToSpendInputSnapshot } from '@/src/services/simulation/safeToSpendInputAcquisition';
import { startTrace } from '@/src/utils/TraceService';

export interface SafeToSpendDataPoint {
  timestamp: number;
  value: number;
  isProjected: boolean;
  details?: { name: string; amount: number; type: FlowType; context?: string }[];
  dailyBurn?: number;
}

export interface SafeToSpendProjection {
  history: SafeToSpendDataPoint[];
  projection: SafeToSpendDataPoint[];
  /** Undefined means the estimate is unavailable because required inputs were unvalued. */
  safeDaysCount: number | null | undefined;
  safeToSpend: number;
}

type SafeToSpendSummary = Pick<
  SimulationEngineResult['summary'],
  'safeToSpend' | 'shortfall' | 'trajectoryMinBalance' | 'firstMajorInflowDay'
> &
  Pick<
    SimulationReport['summary'],
    'totalFutureInflow' | 'totalPlannedOutflow' | 'totalCommittedPlanned'
  > & {
    safeDaysCount: number | null | undefined;
  };

/** Payload from `safeToSpend.forWorkplace(id).watch()` — dashboard + chart. */
export interface SafeToSpendDashboard {
  /** Availability of the latest projection. Empty financial data remains `ready`. */
  quality?: 'ready' | 'stale' | 'unavailable';
  projectionError?: string;
  workplaceId: WorkplaceId;
  asOf: number;
  generatedAt: number;
  horizonDays: number;
  snapshotAgeMs?: number;
  summary: SafeToSpendSummary & { safeCurrentBalance?: number };
  explanation: SafeToSpendExplanation;
  report: SimulationRunResult['report'];
  accountSummaries: SimulationRunResult['accountSummaries'];
  totalLiquidAssets: number;
  currencyCode: string;
  liquidAssetSubtypes: AccountSubtype[];
  dailyBudgetBurn: number;
  projection: SafeToSpendProjection;
  accountMap: Map<string, AccountFields>;
  safeToSpendDays: number;
  /** True when any input used by the projection could not be valued. */
  hasUnvaluedEntries?: boolean;
  unvaluedStartingBalances?: UnvaluedStartingBalance[];
}

export async function buildNetCashFlowByDay(
  deltas: DailyDelta[],
  defaultCurrencyCode: string,
): Promise<{ netCashFlowByDay: Map<number, number>; hasUnvaluedEntries: boolean }> {
  const netCashFlowByDay = new Map<number, number>();
  const convertedDeltas: ({ dayStart: number; amount: number } | null)[] = new Array(
    deltas.length,
  ).fill(null);
  const unvaluedEntries = new Array<boolean>(deltas.length).fill(false);

  await runTasksWithBoundedConcurrency(
    deltas,
    AppConfig.performance.maxConcurrentOperations,
    async (delta, index) => {
      if (!delta.journalCurrencyCode || delta.journalDate === undefined) {
        unvaluedEntries[index] = true;
        logger.warn('Journal FX context unavailable for Safe-to-Spend history delta', {
          from: delta.currencyCode,
          to: defaultCurrencyCode,
          dayStart: delta.dayStart,
        });
        return;
      }

      const converted = await convertJournalLineAmount({
        amount: delta.delta,
        lineCurrency: delta.currencyCode,
        journalCurrency: delta.journalCurrencyCode,
        targetCurrency: defaultCurrencyCode,
        storedLineRate: delta.exchangeRate ?? undefined,
        journalDate: delta.journalDate,
      });
      if (!converted.ok) {
        unvaluedEntries[index] = true;
        logger.warn('FX unavailable for Safe-to-Spend history delta', {
          from: converted.missingRate.fromCurrency,
          to: converted.missingRate.toCurrency,
          journalDate: delta.journalDate,
          dayStart: delta.dayStart,
        });
        return;
      }

      convertedDeltas[index] = { dayStart: delta.dayStart, amount: converted.amount };
    },
  );

  for (const converted of convertedDeltas) {
    if (!converted) continue;
    const localDayStart = dayjs(converted.dayStart).startOf('day').valueOf();
    netCashFlowByDay.set(
      localDayStart,
      roundToPrecision(
        (netCashFlowByDay.get(localDayStart) || 0) + converted.amount,
        getCurrencyPrecision(defaultCurrencyCode),
      ),
    );
  }
  return { netCashFlowByDay, hasUnvaluedEntries: unvaluedEntries.some(Boolean) };
}

export function buildSafeToSpendHistoryPoints(input: {
  startOfToday: Dayjs;
  safeToSpendDays: number;
  totalLiquidAssets: number;
  netCashFlowByDay: Map<number, number>;
  precision?: number;
}): SafeToSpendDataPoint[] {
  const historyPoints: SafeToSpendDataPoint[] = [];
  let runningBalance = input.totalLiquidAssets;
  for (let i = 0; i < input.safeToSpendDays; i++) {
    const targetDay = input.startOfToday.subtract(i, 'day').valueOf();
    const flowThatDay = input.netCashFlowByDay.get(targetDay) || 0;
    runningBalance = roundToPrecision(
      runningBalance - flowThatDay,
      input.precision ?? AppConfig.constants.precision,
    );
    historyPoints.push({
      timestamp: targetDay - 1000,
      value: runningBalance,
      isProjected: false,
    });
  }
  historyPoints.reverse();
  return historyPoints;
}

export function mapSimulationToProjectionPoints(
  runResult: SimulationRunResult,
): SafeToSpendDataPoint[] {
  return runResult.simulationResult.projections.map(p => {
    const details = p.flows.map(f => ({
      name: f.label,
      amount: f.amount,
      type: f.kind === 'INFLOW' ? FlowType.INFLOW : FlowType.OUTFLOW,
      context: f.origin,
    }));

    const dailyBurn = p.flows
      .filter(f => {
        const isBudget = f.origin === FlowSource.BUDGET || f.resolvedFrom === 'BUDGET';
        return isBudget && f.kind === 'OUTFLOW';
      })
      .reduce((sum, f) => sum + f.amount, 0);

    return {
      timestamp: p.timestamp,
      value: p.globalBalance,
      isProjected: true,
      details,
      dailyBurn: dailyBurn > 0 ? dailyBurn : undefined,
    };
  });
}

export function computeLiquidSafeDaysCount(input: {
  liquidAssetIds: AccountId[];
  runResult: SimulationRunResult;
  hasUnvaluedEntries?: boolean;
}): number | null | undefined {
  if (input.hasUnvaluedEntries || input.runResult.hasUnvaluedEntries) return undefined;

  const liquidIds = new Set<string>(input.liquidAssetIds);
  let startingGlobal = 0;
  for (const [accountId, balance] of input.runResult.normalizedStartingBalances.entries()) {
    if (liquidIds.has(accountId)) startingGlobal += balance;
  }
  if (startingGlobal < 0) return 0;
  const firstNeg = input.runResult.simulationResult.projections.find(p => p.globalBalance < 0);
  return firstNeg ? firstNeg.dayOffset + 1 : null;
}

export function assembleSafeToSpendDashboard(input: {
  runResult: SimulationRunResult;
  workplaceId: WorkplaceId;
  asOf: number;
  generatedAt: number;
  defaultCurrencyCode: string;
  safeToSpendDays: number;
  totalLiquidAssets: number;
  historyPoints: SafeToSpendDataPoint[];
  projectionPoints: SafeToSpendDataPoint[];
  safeDaysCount: number | null | undefined;
  hasUnvaluedEntries?: boolean;
  unvaluedStartingBalances?: UnvaluedStartingBalance[];
}): SafeToSpendDashboard {
  const {
    runResult,
    workplaceId,
    asOf,
    generatedAt,
    defaultCurrencyCode,
    safeToSpendDays,
    totalLiquidAssets,
    historyPoints,
    projectionPoints,
    safeDaysCount,
    hasUnvaluedEntries = false,
    unvaluedStartingBalances = [],
  } = input;

  return {
    quality: 'ready',
    workplaceId,
    asOf,
    generatedAt,
    horizonDays: safeToSpendDays,
    explanation: runResult.simulationResult.safeToSpendExplanation,
    summary: {
      ...runResult.simulationResult.summary,
      ...runResult.report.summary,
      safeCurrentBalance: totalLiquidAssets,
      safeDaysCount,
    },
    report: runResult.report,
    accountSummaries: runResult.accountSummaries,
    totalLiquidAssets,
    currencyCode: defaultCurrencyCode,
    liquidAssetSubtypes: [...LIQUID_ASSET_SUBTYPES],
    dailyBudgetBurn:
      safeToSpendDays > 0 ? runResult.report.budget.currentMonthRemaining / safeToSpendDays : 0,
    projection: {
      history: historyPoints,
      projection: projectionPoints,
      safeDaysCount,
      safeToSpend: runResult.simulationResult.summary.safeToSpend,
    },
    accountMap: runResult.accountMap,
    safeToSpendDays,
    ...(hasUnvaluedEntries ? { hasUnvaluedEntries: true } : {}),
    ...(unvaluedStartingBalances.length > 0 ? { unvaluedStartingBalances } : {}),
  };
}

export async function projectSafeToSpendDashboardFromSnapshot(
  snapshot: SafeToSpendInputSnapshot,
): Promise<SafeToSpendDashboard> {
  const trace = startTrace('SafeToSpendReadModel.observeSafeToSpend');
  const {
    workplaceId,
    asOf,
    defaultCurrencyCode,
    safeToSpendDays,
    allAccounts,
    liquidAssetIds,
    plannedPayments,
    plannedJournals,
    budgets,
    usages,
    rawDeltas,
    hasUnvaluedEntries: acquisitionHasUnvaluedEntries,
    hasUnvaluedStartingBalances,
    unvaluedStartingBalances = [],
    startingBalances,
    totalLiquidAssetsAmount,
    liabilityAccountBalances,
    startOfToday,
  } = snapshot;

  const totalLiquidMoney = Money.from(totalLiquidAssetsAmount, defaultCurrencyCode);

  const runResult = await cashFlowSimulationService.simulate({
    startingBalances,
    plannedPayments,
    plannedJournals,
    liquidAssetIds,
    liabilityAccountBalances,
    budgets,
    usages,
    allAccounts,
    resultCurrency: defaultCurrencyCode,
    workplaceId,
    simulationDays: safeToSpendDays,
    asOf,
    trace,
  });

  trace.metric('simulation_complete');

  const history = await buildNetCashFlowByDay(rawDeltas, defaultCurrencyCode);

  const historyPoints = buildSafeToSpendHistoryPoints({
    startOfToday,
    safeToSpendDays,
    totalLiquidAssets: totalLiquidMoney.amount,
    netCashFlowByDay: history.netCashFlowByDay,
    precision: getCurrencyPrecision(defaultCurrencyCode),
  });

  const projectionPoints = mapSimulationToProjectionPoints(runResult);
  const hasUnvaluedEntries =
    acquisitionHasUnvaluedEntries ||
    runResult.hasUnvaluedEntries === true ||
    history.hasUnvaluedEntries ||
    usages.some(usage => usage.hasUnvaluedEntries);
  const hasUnvaluedSafeDaysInputs =
    hasUnvaluedStartingBalances ||
    runResult.hasUnvaluedEntries === true ||
    usages.some(usage => usage.hasUnvaluedEntries);
  const safeDaysCount = computeLiquidSafeDaysCount({
    liquidAssetIds,
    runResult,
    hasUnvaluedEntries: hasUnvaluedSafeDaysInputs,
  });

  const generatedAt = Date.now();
  trace.end();

  return assembleSafeToSpendDashboard({
    runResult,
    workplaceId,
    asOf,
    generatedAt,
    defaultCurrencyCode,
    safeToSpendDays,
    totalLiquidAssets: totalLiquidMoney.amount,
    historyPoints,
    projectionPoints,
    safeDaysCount,
    hasUnvaluedEntries,
    unvaluedStartingBalances,
  });
}

export function createEmptySafeToSpendDashboard(
  resultCurrency: string,
  options: {
    workplaceId: WorkplaceId;
    asOf: number;
    horizonDays: number;
    quality: 'ready' | 'stale' | 'unavailable';
  },
): SafeToSpendDashboard {
  const zeroExplanation: SafeToSpendExplanation = {
    cashCeiling: 0,
    minimumDatedBalance: 0,
    bindingDayOffset: null,
    heldAmount: 0,
    shortfall: 0,
    horizonDays: options.horizonDays,
    constrainingOutflows: [],
    assumedInflows: [],
  };
  return {
    ...options,
    generatedAt: Date.now(),
    explanation: zeroExplanation,
    summary: {
      safeToSpend: 0,
      shortfall: 0,
      trajectoryMinBalance: 0,
      safeDaysCount: null,
      totalFutureInflow: 0,
      totalPlannedOutflow: 0,
      totalCommittedPlanned: 0,
      firstMajorInflowDay: null,
    },
    report: {
      allFlows: [],
      liabilities: {
        total: 0,
        totalCreditCard: 0,
        totalOther: 0,
        committed: 0,
        committedCreditCard: 0,
        committedOther: 0,
      },
      budget: {
        currentMonthRemaining: 0,
        nextMonthProjected: 0,
        nextMonthDays: 0,
      },
      summary: {
        firstMajorInflowDay: null,
        totalFutureInflow: 0,
        totalPlannedOutflow: 0,
        totalCommittedPlanned: 0,
      },
    },
    accountSummaries: [],
    totalLiquidAssets: 0,
    currencyCode: resultCurrency,
    liquidAssetSubtypes: [...LIQUID_ASSET_SUBTYPES],
    dailyBudgetBurn: 0,
    projection: {
      history: [],
      projection: [],
      safeDaysCount: null,
      safeToSpend: 0,
    },
    accountMap: new Map(),
    safeToSpendDays: 0,
  };
}
