import { AppConfig } from '@/src/constants/app-config';
import { Flow, SimulationEngineResult } from './types';
import { findFirstMajorInflowDay } from './utils/FlowPolicy';

export class Simulator {
  /**
   * Stupid simple simulation engine.
   * "Generate truth -> simulate once -> read results"
   */
  static simulate(
    startingBalances: Map<string, number>,
    flows: Flow[],
    days: number,
    liquidAccountIds: Set<string>,
    orderedLiquidAccountIds: string[] = [],
    startDayOffset: number = 0,
  ): SimulationEngineResult {
    const currentBalances = new Map(startingBalances);
    const flowByDay = new Map<number, Flow[]>();

    for (const flow of flows) {
      const day = flow.dayOffset;
      const dayFlows = flowByDay.get(day) || [];
      dayFlows.push(flow);
      flowByDay.set(day, dayFlows);
    }

    const projections: SimulationEngineResult['projections'] = [];
    let globalBalance = 0;
    for (const [id, bal] of currentBalances.entries()) {
      if (liquidAccountIds.has(id)) {
        globalBalance += bal ?? 0;
      }
    }

    let globalMinBalance = globalBalance;

    // 1. Identify first major inflow day (Income only)
    const firstMajorInflowDay = findFirstMajorInflowDay(
      flows,
      liquidAccountIds,
      AppConfig.defaults.simulation.majorInflowThreshold,
    );

    // 2. Track minimums
    const accountMinBalances = new Map<string, number>();
    const accountMinBalancesBeforeIncome = new Map<string, number>();
    for (const [id, bal] of currentBalances.entries()) {
      const b = bal ?? 0;
      accountMinBalances.set(id, b);
      accountMinBalancesBeforeIncome.set(id, b);
    }

    for (let d = 0; d < days; d++) {
      const todayOffset = startDayOffset + d;
      const todayFlows = flowByDay.get(todayOffset) || [];

      // Tracking which accounts changed to avoid O(N) minimum checks
      const changedAccountIds = new Set<string>();

      for (const f of todayFlows) {
        globalBalance += this.applyFlow(
          currentBalances,
          f,
          orderedLiquidAccountIds,
          changedAccountIds,
          liquidAccountIds,
        );
      }

      // Update minimums ONLY for changed accounts
      for (const id of changedAccountIds) {
        const bal = currentBalances.get(id) ?? 0;
        const min = accountMinBalances.get(id) ?? Infinity;
        accountMinBalances.set(id, Math.min(min, bal));

        if (firstMajorInflowDay === null || todayOffset < firstMajorInflowDay) {
          const preMin = accountMinBalancesBeforeIncome.get(id) ?? Infinity;
          accountMinBalancesBeforeIncome.set(id, Math.min(preMin, bal));
        }
      }

      globalMinBalance = Math.min(globalMinBalance, globalBalance);

      projections.push({
        dayOffset: todayOffset,
        timestamp: 0,
        globalBalance,
        accountBalances: new Map(currentBalances),
        flows: todayFlows,
      });
    }

    let totalStartingBalance = 0;
    for (const [id, bal] of startingBalances.entries()) {
      if (liquidAccountIds.has(id)) {
        totalStartingBalance += bal ?? 0;
      }
    }

    const safeToSpend = Math.max(0, Math.min(totalStartingBalance, globalMinBalance));

    return {
      summary: {
        safeToSpend,
        shortfall: globalMinBalance < 0 ? Math.abs(globalMinBalance) : 0,
        trajectoryMinBalance: globalMinBalance,
        accountMinBalances,
        accountMinBalancesBeforeIncome,
        firstMajorInflowDay,
      },
      accountSummaries: [], // Will be populated by the orchestrator
      projections,
      allFlows: flows,
    };
  }

  /**
   * Applies a flow to the balances and returns the total delta for globalBalance (if applicable).
   */
  private static applyFlow(
    balances: Map<string, number>,
    flow: Flow,
    orderedLiquidAccountIds: string[],
    changedAccountIds: Set<string>,
    liquidAccountIds: Set<string>,
  ): number {
    if (flow.amount < 0) {
      throw new Error(`Negative flow amount detected for ${flow.label || 'unlabeled flow'}`);
    }

    let globalDelta = 0;

    const setBalance = (id: string, amount: number) => {
      const old = balances.get(id) ?? 0;
      balances.set(id, amount);
      changedAccountIds.add(id);
      if (liquidAccountIds.has(id)) {
        globalDelta += amount - old;
      }
    };

    switch (flow.kind) {
      case 'INFLOW': {
        const current = balances.get(flow.accountId) ?? 0;
        setBalance(flow.accountId, current + flow.amount);
        break;
      }
      case 'OUTFLOW': {
        const current = balances.get(flow.accountId) ?? 0;

        if (flow.meta?.allowCascade && current < flow.amount) {
          const primaryDeduction = Math.min(Math.max(0, current), flow.amount);
          setBalance(flow.accountId, current - primaryDeduction);

          let remainingAmount = flow.amount - primaryDeduction;

          for (const fallbackId of orderedLiquidAccountIds) {
            if (remainingAmount <= AppConfig.defaults.simulation.financialEpsilon) break;
            if (fallbackId === flow.accountId) continue;

            const fallbackBalance = balances.get(fallbackId) ?? 0;
            if (fallbackBalance > 0) {
              const deduction = Math.min(fallbackBalance, remainingAmount);
              setBalance(fallbackId, fallbackBalance - deduction);
              remainingAmount -= deduction;
            }
          }

          if (remainingAmount > AppConfig.defaults.simulation.financialEpsilon) {
            const finalPrimaryBalance = balances.get(flow.accountId) ?? 0;
            setBalance(flow.accountId, finalPrimaryBalance - remainingAmount);
          }
        } else {
          setBalance(flow.accountId, current - flow.amount);
        }
        break;
      }
      case 'TRANSFER': {
        const fromBal = balances.get(flow.fromAccountId) ?? 0;
        const toBal = balances.get(flow.toAccountId) ?? 0;
        setBalance(flow.fromAccountId, fromBal - flow.amount);
        setBalance(flow.toAccountId, toBal + flow.amount);
        break;
      }
    }

    return globalDelta;
  }
}
