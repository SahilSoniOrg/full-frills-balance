import { cashFlowSimulationService } from '@/src/services/simulation/CashFlowSimulationService';
import {
  assembleSafeToSpendDashboard,
  buildNetCashFlowByDay,
  buildSafeToSpendHistoryPoints,
  computeLiquidSafeDaysCount,
  mapSimulationToProjectionPoints,
  type SafeToSpendDashboard,
} from '@/src/services/simulation/safeToSpendDashboardProjection';
import type { SafeToSpendInputSnapshot } from '@/src/services/simulation/safeToSpendInputAcquisition';
import { Money } from '@/src/utils/money';
import { traceService } from '@/src/utils/TraceService';

/**
 * Runs simulation and assembles the dashboard from a fully resolved input snapshot.
 * No database, preferences, or observables — safe for unit tests with a fixed snapshot.
 */
export async function projectSafeToSpendDashboardFromSnapshot(
  snapshot: SafeToSpendInputSnapshot,
): Promise<SafeToSpendDashboard> {
  const trace = traceService.startTrace('SafeToSpendReadModel.observeSafeToSpend');
  const {
    workplaceId,
    defaultCurrencyCode,
    safeToSpendDays,
    allAccounts,
    liquidAssetIds,
    plannedPayments,
    plannedJournals,
    budgets,
    usages,
    rawDeltas,
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
    trace,
  });

  trace.metric('simulation_complete');

  const netCashFlowByDay = await buildNetCashFlowByDay(rawDeltas, defaultCurrencyCode);

  const historyPoints = buildSafeToSpendHistoryPoints({
    startOfToday,
    safeToSpendDays,
    totalLiquidAssets: totalLiquidMoney.amount,
    netCashFlowByDay,
  });

  const projectionPoints = mapSimulationToProjectionPoints(runResult);

  const safeDaysCount = computeLiquidSafeDaysCount({
    liquidAssetIds,
    startingBalances,
    runResult,
  });

  trace.end();

  return assembleSafeToSpendDashboard({
    runResult,
    defaultCurrencyCode,
    safeToSpendDays,
    totalLiquidAssets: totalLiquidMoney.amount,
    liquidAssetIds,
    startingBalances,
    historyPoints,
    projectionPoints,
    safeDaysCount,
  });
}
