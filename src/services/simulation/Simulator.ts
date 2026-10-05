import { AppConfig } from '@/src/constants/app-config';
import { logger } from '@/src/utils/logger';
import { Trace, startTrace } from '@/src/utils/TraceService';
import { Flow, SafeToSpendExplanationFlow, SimulationEngineResult } from './types';
import { findFirstMajorInflowDay, getLiquidImpact } from './utils/FlowPolicy';
import { assertValidFlow } from './utils/FlowInvariants';
import { assertValidSimulationInputs } from './utils/SimulationInputInvariants';
import { roundToPrecision } from '@/src/utils/money';

export class Simulator {
  static simulate(
    startingBalances: Map<string, number>,
    flows: Flow[],
    days: number,
    liquidAccountIds: Set<string>,
    orderedLiquidAccountIds: string[] = [],
    startDayOffset: number = 0,
    startDayTimestamp: number = Date.now(),
    parentTrace?: Trace,
    precision = AppConfig.constants.precision,
  ): SimulationEngineResult {
    const trace = parentTrace || startTrace('Simulator.simulate');
    try {
      assertValidSimulationInputs(startingBalances, days, startDayOffset, startDayTimestamp);
      flows.forEach(assertValidFlow);

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
      let globalMinDayOffset: number | null = null;

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
        roundedAccountBalances.set(id, roundToPrecision(bal ?? 0, precision));
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
            roundedAccountBalances.set(id, roundToPrecision(bal, precision));
          }

          // Preserve independent snapshots only when balances changed. Quiet
          // days can safely reuse the immutable snapshot reference.
          accountBalancesSnapshot = new Map(roundedAccountBalances);
        }

        if (globalBalance < globalMinBalance) {
          globalMinBalance = globalBalance;
          globalMinDayOffset = todayOffset;
        }

        // Set timestamp to the end of the day (23:59:59)
        const timestamp =
          startDayTimestamp + todayOffset * 24 * 60 * 60 * 1000 + (24 * 60 * 60 * 1000 - 1000);

        projections.push({
          dayOffset: todayOffset,
          timestamp,
          globalBalance: roundToPrecision(globalBalance, precision),
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
      const bindingDayOffset = globalMinBalance < totalStartingBalance ? globalMinDayOffset : null;
      const collectExplanationFlows = (
        predicate: (flow: Flow) => boolean,
      ): SafeToSpendExplanationFlow[] => {
        const grouped = new Map<string, SafeToSpendExplanationFlow>();
        for (const flow of flows) {
          if (
            flow.dayOffset < startDayOffset ||
            flow.dayOffset >= startDayOffset + days ||
            flow.timeframe !== 'FUTURE' ||
            !predicate(flow)
          )
            continue;
          const key = `${flow.origin}\u0000${flow.label}`;
          const existing = grouped.get(key);
          if (existing) {
            grouped.set(key, {
              ...existing,
              amount: existing.amount + flow.amount,
              firstDayOffset: Math.min(existing.firstDayOffset, flow.dayOffset),
              occurrenceCount: existing.occurrenceCount + 1,
            });
          } else {
            grouped.set(key, {
              label: flow.label,
              source: flow.origin,
              amount: flow.amount,
              firstDayOffset: flow.dayOffset,
              occurrenceCount: 1,
            });
          }
        }
        return [...grouped.values()].map(flow => ({
          ...flow,
          amount: roundToPrecision(flow.amount, precision),
        }));
      };
      const safeToSpendExplanation = {
        cashCeiling: roundToPrecision(totalStartingBalance, precision),
        minimumDatedBalance: roundToPrecision(globalMinBalance, precision),
        bindingDayOffset,
        heldAmount: roundToPrecision(Math.max(0, totalStartingBalance - safeToSpend), precision),
        shortfall: roundToPrecision(
          globalMinBalance < 0 ? Math.abs(globalMinBalance) : 0,
          precision,
        ),
        horizonDays: days,
        constrainingOutflows: collectExplanationFlows(flow => {
          if (bindingDayOffset === null || flow.dayOffset > bindingDayOffset) return false;
          const impact = getLiquidImpact(flow, liquidAccountIds);
          return impact.direction === 'OUTFLOW';
        }),
        assumedInflows: collectExplanationFlows(
          flow => getLiquidImpact(flow, liquidAccountIds).direction === 'INFLOW',
        ),
      };

      const res = {
        summary: {
          safeToSpend: roundToPrecision(safeToSpend, precision),
          shortfall: roundToPrecision(
            globalMinBalance < 0 ? Math.abs(globalMinBalance) : 0,
            precision,
          ),
          trajectoryMinBalance: roundToPrecision(globalMinBalance, precision),
          accountMinBalances: new Map(
            Array.from(accountMinBalances).map(([id, b]) => [id, roundToPrecision(b, precision)]),
          ),
          accountMinBalancesBeforeIncome: new Map(
            Array.from(accountMinBalancesBeforeIncome).map(([id, b]) => [
              id,
              roundToPrecision(b, precision),
            ]),
          ),
          firstMajorInflowDay,
        },
        safeToSpendExplanation,
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
