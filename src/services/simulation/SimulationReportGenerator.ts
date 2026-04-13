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
    const firstMajorInflowDay = findFirstMajorInflowDay(
      allFlows,
      liquidAccountIdsSet,
      AppConfig.defaults.simulation.majorInflowThreshold,
    );

    let totalFutureInflow = 0;
    let totalPlannedOutflow = 0;
    let totalCommittedPlanned = 0;

    for (const f of allFlows) {
      if (f.timeframe !== 'FUTURE') continue;

      const impact = getLiquidImpact(f, liquidAccountIdsSet);
      if (impact.direction === 'NONE') continue;

      if (impact.direction === 'INFLOW') {
        if (f.category === FlowCategory.INCOME) {
          totalFutureInflow += impact.amount;
        }
      } else if (impact.direction === 'OUTFLOW') {
        if (f.category === FlowCategory.PLANNED_EXPENSE || f.category === FlowCategory.EXPENSE) {
          totalPlannedOutflow += impact.amount;
        }
      }

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

    for (const flow of allFlows) {
      if (flow.timeframe === 'PAST') continue;
      if (flow.category === FlowCategory.BUDGET && flow.kind === 'OUTFLOW') {
        if (flow.dayOffset < daysLeftInMonth) {
          currentMonthRemaining += flow.amount;
        } else {
          nextMonthProjected += flow.amount;
        }
      }
    }

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
    let totalLiabilities = 0;
    let totalCreditCard = 0;
    let totalOther = 0;

    for (const lb of liabilityAccountBalances) {
      totalLiabilities += lb.balance;
      if (lb.account.accountSubtype === AccountSubtype.CREDIT_CARD) {
        totalCreditCard += lb.balance;
      } else {
        totalOther += lb.balance;
      }
    }

    let committed = 0;
    let committedCreditCard = 0;
    let committedOther = 0;

    for (const flow of allFlows) {
      if (flow.timeframe === 'FUTURE' && flow.category === FlowCategory.DEBT) {
        committed += flow.amount;

        const acc = accountMap.get(flow.referenceId || '');
        if (acc?.accountSubtype === AccountSubtype.CREDIT_CARD) {
          committedCreditCard += flow.amount;
        } else {
          committedOther += flow.amount;
        }
      }
    }

    return {
      total: totalLiabilities,
      totalCreditCard,
      totalOther,
      committed,
      committedCreditCard,
      committedOther,
    };
  }
}
