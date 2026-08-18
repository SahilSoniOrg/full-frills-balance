import { AppConfig } from '@/src/constants/app-config';
import { AccountFields, AccountId, AccountSubtype } from '@/src/types/domain';
import dayjs from 'dayjs';
import { AccountSimulationSummary, Flow, FlowCategory, SimulationReport } from './types';
import { findFirstMajorInflowDay, getLiquidImpact, isCommitmentFlow } from './utils/FlowPolicy';
import { assertGlobalIntegrity } from './utils/SimulationIntegrity';

export class SimulationReportGenerator {
  static generate(
    allFlows: Flow[],
    accountMap: Map<string, AccountFields>,
    liabilityAccountBalances: { account: AccountFields; balance: number }[],
    liquidAccountIdsSet: Set<string>,
  ): SimulationReport {
    assertGlobalIntegrity(allFlows);

    const roundedFlows = allFlows.map(f => ({
      ...f,
      amount: Math.round((f.amount + Number.EPSILON) * 100) / 100,
    }));

    const now = dayjs().startOf('day');

    return {
      summary: this.generateSummary(roundedFlows, liquidAccountIdsSet),
      allFlows: roundedFlows,
      budget: this.generateBudgetSummary(roundedFlows, now),
      liabilities: this.generateLiabilities(roundedFlows, accountMap, liabilityAccountBalances),
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
      totalFutureInflow: Math.round((totalFutureInflow + Number.EPSILON) * 100) / 100,
      totalPlannedInflow: Math.round((totalFutureInflow + Number.EPSILON) * 100) / 100,
      totalPlannedOutflow: Math.round((totalPlannedOutflow + Number.EPSILON) * 100) / 100,
      totalCommittedPlanned: Math.round((totalCommittedPlanned + Number.EPSILON) * 100) / 100,
    };
  }

  private static generateBudgetSummary(allFlows: Flow[], now: dayjs.Dayjs) {
    const daysLeftInMonth = now.daysInMonth() - now.date() + 1;
    let currentMonthRemaining = 0;
    let nextMonthProjected = 0;

    for (const flow of allFlows) {
      if (flow.timeframe === 'PAST') continue;
      if (flow.category === FlowCategory.BUDGET && flow.kind === 'OUTFLOW') {
        const isCurrentCycle = flow.meta?.tags?.includes('CURRENT_CYCLE');
        if (isCurrentCycle) {
          currentMonthRemaining += flow.amount;
        } else {
          nextMonthProjected += flow.amount;
        }
      }
    }

    return {
      currentMonthRemaining: Math.round((currentMonthRemaining + Number.EPSILON) * 100) / 100,
      nextMonthProjected: Math.round((nextMonthProjected + Number.EPSILON) * 100) / 100,
      nextMonthDays: Math.max(0, AppConfig.defaults.safeToSpendDays - daysLeftInMonth),
    };
  }

  private static generateLiabilities(
    allFlows: Flow[],
    accountMap: Map<string, AccountFields>,
    liabilityAccountBalances: { account: AccountFields; balance: number }[],
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
      total: Math.round((totalLiabilities + Number.EPSILON) * 100) / 100,
      totalCreditCard: Math.round((totalCreditCard + Number.EPSILON) * 100) / 100,
      totalOther: Math.round((totalOther + Number.EPSILON) * 100) / 100,
      committed: Math.round((committed + Number.EPSILON) * 100) / 100,
      committedCreditCard: Math.round((committedCreditCard + Number.EPSILON) * 100) / 100,
      committedOther: Math.round((committedOther + Number.EPSILON) * 100) / 100,
    };
  }

  static generateAccountSummaries({
    allFlows,
    liquidAccountIdsSet,
    accountMap,
    normalizedStartingBalances,
    accountMinBalancesBeforeIncome,
    accountMinBalances,
    firstMajorInflowDay,
  }: {
    allFlows: Flow[];
    liquidAccountIdsSet: Set<AccountId> | Set<string>;
    accountMap: Map<string, AccountFields>;
    normalizedStartingBalances: Map<string, number>;
    accountMinBalancesBeforeIncome: Map<string, number>;
    accountMinBalances: Map<string, number>;
    firstMajorInflowDay: number | null;
  }): AccountSimulationSummary[] {
    // Pre-group all flows by account for O(1) inside account loop
    const flowsByAccount = new Map<string, Flow[]>();
    allFlows.forEach(f => {
      if (f.kind === 'TRANSFER') {
        const fromList = flowsByAccount.get(f.fromAccountId) || [];
        fromList.push(f);
        flowsByAccount.set(f.fromAccountId, fromList);

        const toList = flowsByAccount.get(f.toAccountId) || [];
        toList.push(f);
        flowsByAccount.set(f.toAccountId, toList);
      } else {
        const list = flowsByAccount.get(f.accountId) || [];
        list.push(f);
        flowsByAccount.set(f.accountId, list);
      }
    });

    return Array.from(liquidAccountIdsSet).map(id => {
      const accountId = id as AccountId;
      const acc = accountMap.get(accountId);
      const startingBal = normalizedStartingBalances.get(accountId) || 0;
      const minBefore = accountMinBalancesBeforeIncome.get(accountId) ?? startingBal;
      const absoluteMin = accountMinBalances.get(accountId) ?? startingBal;

      // Usage Details
      let totalInflow = 0;
      let totalOutflow = 0;
      const inflowMap = new Map<
        string,
        { name: string; amount: number; source: string; minDay: number }
      >();
      const outflowMap = new Map<
        string,
        { name: string; amount: number; source: string; minDay: number }
      >();

      const accFlows = flowsByAccount.get(accountId) || [];
      accFlows.forEach(f => {
        const amount = f.amount;
        let isDebit = false;
        let isRelevant = true;

        if (f.kind === 'INFLOW' && f.accountId === accountId) {
          isDebit = false;
        } else if (f.kind === 'OUTFLOW' && f.accountId === accountId) {
          isDebit = true;
        } else if (f.kind === 'TRANSFER') {
          if (f.fromAccountId === accountId) {
            isDebit = true;
          } else if (f.toAccountId === accountId) {
            isDebit = false;
          } else {
            isRelevant = false;
          }
        } else {
          isRelevant = false;
        }

        if (isRelevant) {
          const label = f.label || 'Transaction';
          const source = f.origin;
          if (isDebit) {
            totalOutflow += amount;
            const existing = outflowMap.get(label);
            outflowMap.set(label, {
              name: label,
              amount: (existing?.amount || 0) + amount,
              source,
              minDay: Math.min(existing?.minDay ?? f.dayOffset, f.dayOffset),
            });
          } else {
            totalInflow += amount;
            const existing = inflowMap.get(label);
            inflowMap.set(label, {
              name: label,
              amount: (existing?.amount || 0) + amount,
              source,
              minDay: Math.min(existing?.minDay ?? f.dayOffset, f.dayOffset),
            });
          }
        }
      });

      const topInflows = Array.from(inflowMap.values())
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 3)
        .map(d => ({
          name: d.name,
          amount: d.amount,
          source: d.source,
          isPostIncome: firstMajorInflowDay !== null && d.minDay >= firstMajorInflowDay,
        }));

      const topOutflows = Array.from(outflowMap.values())
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 3)
        .map(d => ({
          name: d.name,
          amount: d.amount,
          source: d.source,
          isPostIncome: firstMajorInflowDay !== null && d.minDay >= firstMajorInflowDay,
        }));

      return {
        accountId,
        accountName: acc?.name || 'Unknown',
        color: acc?.color || undefined,
        startingBalance: startingBal,
        safeToSpend: Math.max(0, Math.min(startingBal, minBefore)),
        shortfall: minBefore < 0 ? Math.abs(minBefore) : 0,
        minBalance: absoluteMin,
        usageDetails: {
          totalInflow,
          totalOutflow,
          topInflows,
          topOutflows,
        },
      } as AccountSimulationSummary;
    });
  }
}
