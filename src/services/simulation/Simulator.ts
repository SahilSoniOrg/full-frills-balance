import { AppConfig } from '@/src/constants/app-config';
import { Flow, SimulationEngineResult } from './types';

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
    let globalMinBalance = this.calculateGlobalBalance(currentBalances, liquidAccountIds);

    // 1. Identify first major inflow day
    const majorInflowThreshold = AppConfig.defaults.majorInflowThreshold || 1000;
    let firstMajorInflowDay: number | null = null;
    for (const flow of flows) {
      if (flow.kind === 'INFLOW' && flow.amount >= majorInflowThreshold) {
        if (firstMajorInflowDay === null || flow.dayOffset < firstMajorInflowDay) {
          firstMajorInflowDay = flow.dayOffset;
        }
      }
    }

    // 2. Track minimums
    const accountMinBalances = new Map<string, number>();
    const accountMinBalancesBeforeIncome = new Map<string, number>();
    for (const [id, bal] of currentBalances.entries()) {
      accountMinBalances.set(id, bal);
      accountMinBalancesBeforeIncome.set(id, bal);
    }

    for (let d = 0; d < days; d++) {
      const todayOffset = startDayOffset + d;
      const todayFlows = flowByDay.get(todayOffset) || [];

      todayFlows.forEach(f => this.applyFlow(currentBalances, f, orderedLiquidAccountIds));

      // Update minimums
      for (const [id, bal] of currentBalances.entries()) {
        const min = accountMinBalances.get(id) ?? Infinity;
        if (bal < min) accountMinBalances.set(id, bal);

        if (firstMajorInflowDay === null || todayOffset < firstMajorInflowDay) {
          const preMin = accountMinBalancesBeforeIncome.get(id) ?? Infinity;
          if (bal < preMin) accountMinBalancesBeforeIncome.set(id, bal);
        }
      }

      const globalBalance = this.calculateGlobalBalance(currentBalances, liquidAccountIds);
      if (globalBalance < globalMinBalance) globalMinBalance = globalBalance;

      projections.push({
        dayOffset: todayOffset,
        timestamp: 0,
        globalBalance,
        accountBalances: new Map(currentBalances),
        flows: todayFlows,
      });
    }

    const totalStartingBalance = Array.from(startingBalances.values()).reduce((a, b) => a + b, 0);

    return {
      summary: {
        safeToSpend: Math.max(0, Math.min(totalStartingBalance, globalMinBalance)),
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

  private static applyFlow(
    balances: Map<string, number>,
    flow: Flow,
    orderedLiquidAccountIds: string[],
  ) {
    if (flow.amount < 0) {
      throw new Error(`Negative flow amount detected for ${flow.meta?.label || 'unlabeled flow'}`);
    }

    switch (flow.kind) {
      case 'INFLOW': {
        const current = balances.get(flow.accountId) || 0;
        balances.set(flow.accountId, current + flow.amount);
        break;
      }
      case 'OUTFLOW': {
        const current = balances.get(flow.accountId) || 0;

        if (flow.meta?.allowCascade && current < flow.amount) {
          // Consume what we can from the primary account (down to 0, not below)
          const primaryDeduction = Math.min(Math.max(0, current), flow.amount);
          balances.set(flow.accountId, current - primaryDeduction);

          let remainingAmount = flow.amount - primaryDeduction;

          // Cascade through ordered liquid accounts
          for (const fallbackId of orderedLiquidAccountIds) {
            if (remainingAmount <= 0.01) break;
            if (fallbackId === flow.accountId) continue;

            const fallbackBalance = balances.get(fallbackId) || 0;
            if (fallbackBalance > 0) {
              const deduction = Math.min(fallbackBalance, remainingAmount);
              balances.set(fallbackId, fallbackBalance - deduction);
              remainingAmount -= deduction;
            }
          }

          // If still remaining, force it on the primary account to take it negative
          if (remainingAmount > 0.01) {
            const finalPrimaryBalance = balances.get(flow.accountId) || 0;
            balances.set(flow.accountId, finalPrimaryBalance - remainingAmount);
          }
        } else {
          balances.set(flow.accountId, current - flow.amount);
        }
        break;
      }
      case 'TRANSFER': {
        const fromBal = balances.get(flow.fromAccountId) || 0;
        const toBal = balances.get(flow.toAccountId) || 0;
        balances.set(flow.fromAccountId, fromBal - flow.amount);
        balances.set(flow.toAccountId, toBal + flow.amount);
        break;
      }
    }
  }

  private static calculateGlobalBalance(
    balances: Map<string, number>,
    liquidAccountIds: Set<string>,
  ): number {
    let sum = 0;
    for (const [id, bal] of balances.entries()) {
      if (liquidAccountIds.has(id)) {
        sum += bal;
      }
    }
    return sum;
  }
}
