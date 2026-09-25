import type { AccountFields } from '@/src/types/plainDtos';
import { DailyDelta } from '@/src/data/repositories/TransactionTypes';
import { AccountId } from '@/src/types/ids';
import { AccountSubtype } from '@/src/types/enums';
import {
  FlowSource,
  FlowType,
  SimulationReport,
  SimulationEngineResult,
  SimulationRunResult,
} from '@/src/services/simulation/types';
import { LIQUID_ASSET_SUBTYPES } from '@/src/utils/accountSubtypeUtils';
import { AppConfig } from '@/src/constants/app-config';
import { convertJournalLineAmount } from '@/src/services/currencyConversion';
import { runTasksWithBoundedConcurrency } from '@/src/utils/asyncConcurrency';
import { logger } from '@/src/utils/logger';
import { getCurrencyPrecision } from '@/src/utils/currencyPrecision';
import { roundToPrecision } from '@/src/utils/money';
import dayjs, { Dayjs } from 'dayjs';

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
  safeDaysCount: number | null;
  safeToSpend: number;
}

type SafeToSpendSummary = Pick<
  SimulationEngineResult['summary'],
  'safeToSpend' | 'shortfall' | 'trajectoryMinBalance' | 'firstMajorInflowDay'
> &
  Pick<
    SimulationReport['summary'],
    'totalFutureInflow' | 'totalPlannedInflow' | 'totalPlannedOutflow' | 'totalCommittedPlanned'
  > & {
    safeDaysCount: number | null;
  };

/** Payload from `safeToSpend.forWorkplace(id).watch()` — dashboard + chart. */
export interface SafeToSpendDashboard {
  summary: SafeToSpendSummary & { safeCurrentBalance?: number };
  report: SimulationRunResult['report'];
  accountSummaries: SimulationRunResult['accountSummaries'];
  totalLiquidAssets: number;
  currencyCode: string;
  liquidAssetSubtypes: AccountSubtype[];
  dailyBudgetBurn: number;
  projection: SafeToSpendProjection;
  accountMap: Map<string, AccountFields>;
  safeToSpendDays: number;
  /** True when a budget or history line could not be valued. */
  hasUnvaluedEntries?: boolean;
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
  startingBalances: Map<AccountId, number>;
  runResult: SimulationRunResult;
}): number | null {
  const liquidIds = new Set(input.liquidAssetIds);
  let startingGlobal = 0;
  for (const [accountId, balance] of input.startingBalances.entries()) {
    if (liquidIds.has(accountId)) startingGlobal += balance;
  }
  if (startingGlobal < 0) return 0;
  const firstNeg = input.runResult.simulationResult.projections.find(p => p.globalBalance < 0);
  return firstNeg ? firstNeg.dayOffset + 1 : null;
}

export function assembleSafeToSpendDashboard(input: {
  runResult: SimulationRunResult;
  defaultCurrencyCode: string;
  safeToSpendDays: number;
  totalLiquidAssets: number;
  liquidAssetIds: AccountId[];
  startingBalances: Map<AccountId, number>;
  historyPoints: SafeToSpendDataPoint[];
  projectionPoints: SafeToSpendDataPoint[];
  safeDaysCount: number | null;
  hasUnvaluedEntries?: boolean;
}): SafeToSpendDashboard {
  const {
    runResult,
    defaultCurrencyCode,
    safeToSpendDays,
    totalLiquidAssets,
    historyPoints,
    projectionPoints,
    safeDaysCount,
    hasUnvaluedEntries = false,
  } = input;

  return {
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
  };
}

export function createEmptySafeToSpendDashboard(resultCurrency: string): SafeToSpendDashboard {
  return {
    summary: {
      safeToSpend: 0,
      shortfall: 0,
      trajectoryMinBalance: 0,
      safeDaysCount: null,
      totalFutureInflow: 0,
      totalPlannedInflow: 0,
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
        totalPlannedInflow: 0,
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
