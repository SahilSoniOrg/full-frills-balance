import { AppConfig } from '@/src/constants/app-config';
import Account, { AccountSubtype } from '@/src/data/models/Account';
import dayjs from 'dayjs';
import { Flow, FlowCategory, SimulationReport } from './types';
import { findFirstMajorInflowDay, getLiquidImpact, isCommitmentFlow } from './utils/FlowPolicy';
import { assertGlobalIntegrity } from './utils/SimulationIntegrity';

export class SimulationReportGenerator {
  static generate(
    allFlows: Flow[],
    accountMap: Map<string, Account>,
    liabilityAccountBalances: { account: Account; balance: number }[],
    liquidAccountIdsSet: Set<string>,
  ): SimulationReport {
    assertGlobalIntegrity(allFlows);

    const now = dayjs().startOf('day');

    return {
      summary: this.generateSummary(allFlows, liquidAccountIdsSet),
      allFlows,
      budget: this.generateBudgetSummary(allFlows, now),
      liabilities: this.generateLiabilities(allFlows, accountMap, liabilityAccountBalances),
    };
  }

  private static generateSummary(allFlows: Flow[], liquidAccountIdsSet: Set<string>) {
    // 1. First Major Inflow Day
    const firstMajorInflowDay = findFirstMajorInflowDay(
      allFlows,
      liquidAccountIdsSet,
      AppConfig.defaults.simulation.majorInflowThreshold,
    );

    // 2. Aggregate Summaries based on Liquid Impact
    let totalFutureInflow = 0;
    let totalPlannedOutflow = 0;
    let totalCommittedPlanned = 0;

    for (const f of allFlows) {
      if (f.timeframe !== 'FUTURE') continue;

      const impact = getLiquidImpact(f, liquidAccountIdsSet);
      if (impact.direction === 'NONE') continue;

      // 1. Boundary Pressures (System Inflow/Outflow)
      if (impact.direction === 'INFLOW') {
        if (f.category === FlowCategory.INCOME) {
          totalFutureInflow += impact.amount;
        }
      } else if (impact.direction === 'OUTFLOW') {
        if (f.category === FlowCategory.PLANNED_EXPENSE || f.category === FlowCategory.EXPENSE) {
          totalPlannedOutflow += impact.amount;
        }
      }

      // 2. Commitments (Spoken-for Liquidity)
      // We include OUTFLOW and INTERNAL moves that are obligations.
      // Inward transfers (External -> Liquid) are NEVER commitments here.
      if (
        isCommitmentFlow(f) &&
        (impact.direction === 'OUTFLOW' || impact.direction === 'INTERNAL')
      ) {
        totalCommittedPlanned += impact.amount;
      }
    }

    return {
      firstMajorInflowDay,
      totalFutureInflow,
      totalPlannedInflow: totalFutureInflow,
      totalPlannedOutflow,
      totalCommittedPlanned,
    };
  }

  private static generateBudgetSummary(allFlows: Flow[], now: dayjs.Dayjs) {
    const daysLeftInMonth = now.daysInMonth() - now.date() + 1;
    let currentMonthRemaining = 0;
    let nextMonthProjected = 0;

    allFlows.forEach(flow => {
      if (flow.timeframe === 'PAST') return;
      if (flow.category === FlowCategory.BUDGET && flow.kind === 'OUTFLOW') {
        if (flow.dayOffset < daysLeftInMonth) {
          currentMonthRemaining += flow.amount;
        } else {
          nextMonthProjected += flow.amount;
        }
      }
    });

    return {
      currentMonthRemaining,
      nextMonthProjected,
      nextMonthDays: Math.max(0, AppConfig.defaults.safeToSpendDays - daysLeftInMonth),
    };
  }

  private static generateLiabilities(
    allFlows: Flow[],
    accountMap: Map<string, Account>,
    liabilityAccountBalances: { account: Account; balance: number }[],
  ) {
    const totalLiabilities = liabilityAccountBalances.reduce((sum, lb) => sum + lb.balance, 0);
    return {
      total: totalLiabilities,
      totalCreditCard: liabilityAccountBalances
        .filter(lb => lb.account.accountSubtype === AccountSubtype.CREDIT_CARD)
        .reduce((sum, lb) => sum + lb.balance, 0),
      totalOther: liabilityAccountBalances
        .filter(lb => lb.account.accountSubtype !== AccountSubtype.CREDIT_CARD)
        .reduce((sum, lb) => sum + lb.balance, 0),
      committed: allFlows
        .filter(flow => flow.timeframe === 'FUTURE' && flow.category === FlowCategory.DEBT)
        .reduce((sum, flow) => sum + flow.amount, 0),
      committedCreditCard: allFlows
        .filter(
          flow =>
            flow.timeframe === 'FUTURE' &&
            flow.category === FlowCategory.DEBT &&
            accountMap.get(flow.referenceId || '')?.accountSubtype === AccountSubtype.CREDIT_CARD,
        )
        .reduce((sum, flow) => sum + flow.amount, 0),
      committedOther: allFlows
        .filter(
          flow =>
            flow.timeframe === 'FUTURE' &&
            flow.category === FlowCategory.DEBT &&
            accountMap.get(flow.referenceId || '')?.accountSubtype !== AccountSubtype.CREDIT_CARD,
        )
        .reduce((sum, flow) => sum + flow.amount, 0),
    };
  }
}
