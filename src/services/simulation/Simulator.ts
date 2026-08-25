import { AppConfig } from '@/src/constants/app-config';
import { logger } from '@/src/utils/logger';
import { Trace, traceService } from '@/src/utils/TraceService';
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
    startDayTimestamp: number = Date.now(),
    parentTrace?: Trace,
  ): SimulationEngineResult {
    const trace = parentTrace || traceService.startTrace('Simulator.simulate');
    try {
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

      const roundedAccountBalances = new Map<string, number>();
      for (const [id, bal] of currentBalances.entries()) {
        roundedAccountBalances.set(id, Math.round(((bal ?? 0) + Number.EPSILON) * 100) / 100);
      }
      let accountBalancesSnapshot = new Map(roundedAccountBalances);

      for (let d = 0; d < days; d++) {
        const todayOffset = startDayOffset + d;
        const todayFlows = flowByDay.get(todayOffset) || [];

        // Tracking which accounts changed to avoid O(N) minimum checks
        const changedAccountIds = new Set<string>();

        if (todayFlows.length > 0) {
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

            // Update rounded map only for changed accounts
            roundedAccountBalances.set(id, Math.round((bal + Number.EPSILON) * 100) / 100);
          }

          // Preserve independent snapshots only when balances changed. Quiet
          // days can safely reuse the immutable snapshot reference.
          accountBalancesSnapshot = new Map(roundedAccountBalances);
        }

        globalMinBalance = Math.min(globalMinBalance, globalBalance);

        // Set timestamp to the end of the day (23:59:59)
        const timestamp =
          startDayTimestamp + todayOffset * 24 * 60 * 60 * 1000 + (24 * 60 * 60 * 1000 - 1000);

        projections.push({
          dayOffset: todayOffset,
          timestamp,
          globalBalance: Math.round((globalBalance + Number.EPSILON) * 100) / 100,
          accountBalances: accountBalancesSnapshot,
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

      const res = {
        summary: {
          safeToSpend: Math.round((safeToSpend + Number.EPSILON) * 100) / 100,
          shortfall:
            Math.round(
              ((globalMinBalance < 0 ? Math.abs(globalMinBalance) : 0) + Number.EPSILON) * 100,
            ) / 100,
          trajectoryMinBalance: Math.round((globalMinBalance + Number.EPSILON) * 100) / 100,
          accountMinBalances: new Map(
            Array.from(accountMinBalances).map(([id, b]) => [
              id,
              Math.round((b + Number.EPSILON) * 100) / 100,
            ]),
          ),
          accountMinBalancesBeforeIncome: new Map(
            Array.from(accountMinBalancesBeforeIncome).map(([id, b]) => [
              id,
              Math.round((b + Number.EPSILON) * 100) / 100,
            ]),
          ),
          firstMajorInflowDay,
        },
        accountSummaries: [], // Will be populated by the orchestrator
        projections,
        allFlows: flows,
      };

      return res;
    } catch (error) {
      logger.error('Simulator failure:', error);
      throw error;
    } finally {
      if (!parentTrace) trace.end();
    }
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
