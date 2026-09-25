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
import { getCurrencyPrecision } from '@/src/utils/currencyPrecision';
import { Money } from '@/src/utils/money';
import { startTrace } from '@/src/utils/TraceService';

/**
 * Runs simulation and assembles the dashboard from a fully resolved input snapshot.
 * No database, preferences, or observables — safe for unit tests with a fixed snapshot.
 */
export async function projectSafeToSpendDashboardFromSnapshot(
  snapshot: SafeToSpendInputSnapshot,
): Promise<SafeToSpendDashboard> {
  const trace = startTrace('SafeToSpendReadModel.observeSafeToSpend');
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

  trace.end();

  return assembleSafeToSpendDashboard({
    runResult,
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
