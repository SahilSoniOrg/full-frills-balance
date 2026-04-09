import { AppConfig } from '@/src/constants/app-config';
import Account, { AccountSubtype } from '@/src/data/models/Account';
import Budget from '@/src/data/models/Budget';
import Journal from '@/src/data/models/Journal';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import { BudgetUsage } from '@/src/services/budget/budgetReadService';
import dayjs from 'dayjs';
import { FlowType, ISimulationService, SimulationResult } from '../types';
import { cashFlowSimulationServiceV2 } from './CashFlowSimulationServiceV2';
import { Flow as FlowV2 } from './types';

type AccountImpact = {
  accountId: string;
  amount: number;
  dayOffset: number;
  sourceAccountId?: string;
  meta?: FlowV2['meta'];
};

export class SimulationV2Adapter implements ISimulationService {
  async simulate(
    startingBalances: Map<string, number>,
    plannedPayments: PlannedPayment[],
    plannedJournals: Journal[],
    liquidAssetIds: string[],
    liabilityAccountBalances: { account: Account; balance: number }[],
    budgets: Budget[],
    usages: BudgetUsage[],
    allAccounts: Account[],
    resultCurrency: string,
  ): Promise<SimulationResult> {
    const simulationResults = await cashFlowSimulationServiceV2.simulate(
      startingBalances,
      plannedPayments,
      plannedJournals,
      liquidAssetIds,
      liabilityAccountBalances,
      budgets,
      usages,
      allAccounts,
      resultCurrency,
    );

    const allFlows = simulationResults.allFlows || [];
    const accountMap = new Map(allAccounts.map(a => [a.id, a]));
    const liquidAccountIdsSet = new Set(liquidAssetIds);
    const liabilityAccountIdsSet = new Set(liabilityAccountBalances.map(lb => lb.account.id));
    const firstMajorInflowDay = simulationResults.summary.firstMajorInflowDay;
    const safeDaysCount = this.computeSafeDaysCount(
      startingBalances,
      liquidAccountIdsSet,
      simulationResults.projections,
    );

    const incomeFlows = allFlows.filter((f: FlowV2) => f.kind === 'INFLOW');
    const incomeBreakdown = incomeFlows.map((f: FlowV2) => ({
      id: f.meta?.referenceId || 'income',
      name: f.meta?.label || 'Income',
      amount: f.amount,
      dayOffset: f.dayOffset,
      type: 'PLANNED' as any,
    }));

    const { dailyBudgetBurns, flowByDayOffset, safeToSpendDailyBreakdown } =
      this.buildLegacyProjectionMetadata(allFlows, liquidAccountIdsSet, liabilityAccountIdsSet);
    const budgetBreakdown = this.buildBudgetBreakdown(dailyBudgetBurns);
    const totalFutureInflow = this.computeTotalFutureInflow(
      allFlows,
      liquidAccountIdsSet,
      liabilityAccountIdsSet,
    );
    const { totalOrganicInflow, totalOrganicOutflow, totalCommittedPlanned } =
      this.computePlannedTotals(allFlows);

    const committedMap = new Map<string, any>();
    allFlows
      .filter((flow: FlowV2) => this.isCommitmentFlow(flow))
      .forEach((flow: FlowV2) => {
        const target = this.resolveCommitmentTarget(flow, accountMap);
        const entry = committedMap.get(target.accountId) || {
          accountId: target.accountId,
          accountName: target.accountName,
          amount: 0,
          details: [],
        };
        entry.amount += flow.amount;

        if (target.detailType === 'BUDGET') {
          const isPostIncome =
            firstMajorInflowDay !== null && flow.dayOffset >= firstMajorInflowDay;
          const suffix = isPostIncome ? '_post' : '_pre';
          const detailId = (flow.meta?.referenceId || 'budget') + suffix;
          const existing = entry.details.find((d: any) => d.id === detailId);

          if (existing) {
            existing.amount += flow.amount;
          } else {
            entry.details.push({
              id: detailId,
              name: flow.meta?.label || 'Budget Burn',
              amount: flow.amount,
              dayOffset: isPostIncome ? firstMajorInflowDay : 0,
              type: 'BUDGET',
            });
          }
        } else {
          entry.details.push({
            id:
              flow.meta?.referenceId ||
              `${target.accountId}-${flow.dayOffset}-${flow.amount}-${target.detailType}`,
            name: flow.meta?.label || target.accountName || 'Spending',
            amount: flow.amount,
            dayOffset: flow.dayOffset,
            type: target.detailType,
          });
        }

        committedMap.set(target.accountId, entry);
      });
    const committedBreakdown = Array.from(committedMap.values());

    const debtMap = new Map<string, any>();
    allFlows
      .filter(
        (f: FlowV2): f is Extract<FlowV2, { kind: 'OUTFLOW' }> =>
          f.kind === 'OUTFLOW' && f.meta?.source === 'LIABILITY',
      )
      .forEach(f => {
        const accId = f.meta?.referenceId || f.accountId;
        const acc = accountMap.get(accId);
        const entry = debtMap.get(accId) || {
          accountId: accId,
          accountName: acc?.name || 'Liability',
          amount: 0,
          dayOffset: f.dayOffset,
          type: 'LIABILITY' as any,
        };
        entry.amount += f.amount;
        debtMap.set(accId, entry);
      });
    const debtBreakdown = Array.from(debtMap.values());

    const totalLiabilities = liabilityAccountBalances.reduce(
      (sum: number, b: any) => sum + b.balance,
      0,
    );

    const legacyResult: SimulationResult = {
      accountSummaries: simulationResults.accountSummaries as any,
      summary: {
        ...simulationResults.summary,
        safeDaysCount,
        totalFutureInflow,
        totalOrganicInflow,
        totalOrganicOutflow,
        totalCommittedPlanned,
        firstMajorInflowDay,
      },
      breakdowns: {
        income: incomeBreakdown,
        committed: committedBreakdown as any,
        debt: debtBreakdown as any,
        budget: budgetBreakdown,
        liabilities: {
          total: totalLiabilities,
          totalCreditCard: liabilityAccountBalances
            .filter(lb => lb.account.accountSubtype === AccountSubtype.CREDIT_CARD)
            .reduce((sum, b) => sum + b.balance, 0),
          totalOther: liabilityAccountBalances
            .filter(lb => lb.account.accountSubtype !== AccountSubtype.CREDIT_CARD)
            .reduce((sum, b) => sum + b.balance, 0),
          committed: allFlows
            .filter((f: FlowV2) => f.meta?.source === 'LIABILITY')
            .reduce((sum: number, f: any) => sum + f.amount, 0),
          committedCreditCard: allFlows
            .filter((f: FlowV2) =>
              this.isLiabilityCommitmentForSubtype(f, accountMap, AccountSubtype.CREDIT_CARD),
            )
            .reduce((sum: number, f: any) => sum + f.amount, 0),
          committedOther: allFlows
            .filter((f: FlowV2) => f.meta?.source === 'LIABILITY')
            .filter(
              (f: FlowV2) =>
                !this.isLiabilityCommitmentForSubtype(f, accountMap, AccountSubtype.CREDIT_CARD),
            )
            .reduce((sum: number, f: any) => sum + f.amount, 0),
        },
      },
      projections: {
        points: simulationResults.projections.map(p => ({
          timestamp: p.timestamp,
          value: p.globalBalance,
          isProjected: true,
          details: p.flows.map((f: any) => ({
            name: f.meta?.label || (f.meta?.source === 'BUDGET' ? 'Budget Burn' : 'Spending'),
            amount: f.amount,
            type: f.kind as any,
            context: f.meta?.source,
          })),
        })),
        dailyBudgetBurns,
        flowByDayOffset,
        safeToSpendDailyBreakdown,
      },
      metadata: {
        firstMajorInflowDay,
        committedSubtypes: Array.from(
          new Set(
            allFlows
              .filter((f: FlowV2) => this.isCommitmentFlow(f))
              .map((f: FlowV2) => this.resolveCommitmentTarget(f, accountMap).accountId)
              .map(accountId => accountMap.get(accountId)?.accountSubtype)
              .filter(Boolean),
          ),
        ) as any[],
        debtSubtypes: Array.from(
          new Set(liabilityAccountBalances.map(lb => lb.account.accountSubtype).filter(Boolean)),
        ) as any[],
      },
    };

    return legacyResult;
  }

  private isCommitmentFlow(flow: FlowV2): boolean {
    const effectiveSource =
      flow.meta?.source === 'RESOLVED' ? flow.meta.originalSource : flow.meta?.source;

    if (flow.meta?.source === 'LIABILITY') return flow.kind === 'OUTFLOW';
    if (effectiveSource === 'BUDGET') return flow.kind === 'OUTFLOW';
    if (effectiveSource === 'PLANNED') return flow.kind === 'OUTFLOW' || flow.kind === 'TRANSFER';
    return false;
  }

  private resolveCommitmentTarget(flow: FlowV2, accountMap: Map<string, Account>) {
    if (flow.meta?.source === 'LIABILITY') {
      const accountId =
        flow.meta?.referenceId || (flow.kind === 'TRANSFER' ? flow.toAccountId : flow.accountId);
      const acc = accountMap.get(accountId);
      return {
        accountId,
        accountName: acc?.name || flow.meta?.label || 'Liability',
        detailType: 'FALLBACK',
      };
    }

    const effectiveSource =
      flow.meta?.source === 'RESOLVED' ? flow.meta.originalSource : flow.meta?.source;
    const accountId =
      flow.meta?.categoryId ||
      (flow.kind === 'TRANSFER' ? flow.toAccountId : flow.accountId) ||
      'other';
    const acc = accountMap.get(accountId);

    return {
      accountId,
      accountName: acc?.name || flow.meta?.label || 'Other',
      detailType: effectiveSource === 'BUDGET' ? 'BUDGET' : 'PLANNED_PAYMENT',
    };
  }

  private explodeAccountImpacts(flows: FlowV2[]): AccountImpact[] {
    return flows.flatMap(flow => {
      if (flow.kind === 'INFLOW') {
        return [
          {
            accountId: flow.accountId,
            amount: flow.amount,
            dayOffset: flow.dayOffset,
            meta: flow.meta,
          },
        ];
      }

      if (flow.kind === 'OUTFLOW') {
        return [
          {
            accountId: flow.accountId,
            amount: -flow.amount,
            dayOffset: flow.dayOffset,
            sourceAccountId: flow.accountId,
            meta: flow.meta,
          },
        ];
      }

      return [
        {
          accountId: flow.fromAccountId,
          amount: -flow.amount,
          dayOffset: flow.dayOffset,
          sourceAccountId: flow.fromAccountId,
          meta: flow.meta,
        },
        {
          accountId: flow.toAccountId,
          amount: flow.amount,
          dayOffset: flow.dayOffset,
          sourceAccountId: flow.fromAccountId,
          meta: flow.meta,
        },
      ];
    });
  }

  private buildLegacyProjectionMetadata(
    flows: FlowV2[],
    liquidAccountIds: Set<string>,
    liabilityAccountIds: Set<string>,
  ) {
    const simulationDays = AppConfig.defaults.safeToSpendDays;
    const dailyBudgetBurns = new Array(simulationDays).fill(0);
    const flowByDayOffset = new Map<number, number>();
    const safeToSpendDailyBreakdown = new Map<
      number,
      { name: string; amount: number; type: FlowType; context?: string }[]
    >();

    for (const flow of flows) {
      const effectiveSource =
        flow.meta?.source === 'RESOLVED' ? flow.meta.originalSource : flow.meta?.source;
      if (effectiveSource === 'BUDGET') {
        dailyBudgetBurns[flow.dayOffset] += flow.amount;
      }
    }

    for (const flow of this.explodeAccountImpacts(flows)) {
      const isSimulationFlow = flow.meta?.source !== 'BUDGET';
      if (!isSimulationFlow) continue;

      const isLiquidAccount = liquidAccountIds.has(flow.accountId);
      const isLiabilityInflow = liabilityAccountIds.has(flow.accountId) && flow.amount > 0;
      const isInternalTransferToLiability =
        isLiabilityInflow && !!flow.sourceAccountId && liquidAccountIds.has(flow.sourceAccountId);

      if (isLiquidAccount || (isLiabilityInflow && !isInternalTransferToLiability)) {
        flowByDayOffset.set(
          flow.dayOffset,
          (flowByDayOffset.get(flow.dayOffset) || 0) + flow.amount,
        );
      }

      const details = safeToSpendDailyBreakdown.get(flow.dayOffset) || [];
      if (details.length < 20) {
        details.push({
          name: flow.meta?.label || 'Transaction',
          amount: Math.abs(flow.amount),
          type: flow.amount >= 0 ? FlowType.INFLOW : FlowType.OUTFLOW,
          context: flow.meta?.source,
        });
        safeToSpendDailyBreakdown.set(flow.dayOffset, details);
      }
    }

    return { dailyBudgetBurns, flowByDayOffset, safeToSpendDailyBreakdown };
  }

  private computeTotalFutureInflow(
    flows: FlowV2[],
    liquidAccountIds: Set<string>,
    liabilityAccountIds: Set<string>,
  ) {
    return this.explodeAccountImpacts(flows).reduce((sum, flow) => {
      const isSimulationFlow = flow.meta?.source !== 'BUDGET';
      if (!isSimulationFlow || flow.amount <= 0) return sum;

      if (liquidAccountIds.has(flow.accountId) || liabilityAccountIds.has(flow.accountId)) {
        return sum + flow.amount;
      }

      return sum;
    }, 0);
  }

  private computePlannedTotals(flows: FlowV2[]) {
    let totalOrganicInflow = 0;
    let totalOrganicOutflow = 0;
    let totalCommittedPlanned = 0;

    for (const flow of flows) {
      const isPlannedOrigin =
        flow.meta?.source === 'PLANNED' ||
        (flow.meta?.source === 'RESOLVED' && flow.meta.originalSource === 'PLANNED');

      if (!isPlannedOrigin) continue;

      if (flow.kind === 'INFLOW') {
        totalOrganicInflow += flow.amount;
      } else if (flow.kind === 'OUTFLOW') {
        totalOrganicOutflow += flow.amount;
        totalCommittedPlanned += flow.amount;
      } else {
        totalOrganicInflow += flow.amount;
        totalOrganicOutflow += flow.amount;
        totalCommittedPlanned += flow.amount;
      }
    }

    return { totalOrganicInflow, totalOrganicOutflow, totalCommittedPlanned };
  }

  private buildBudgetBreakdown(dailyBudgetBurns: number[]) {
    const now = dayjs().startOf('day');
    const daysLeftInMonth = now.daysInMonth() - now.date() + 1;
    let currentMonthRemaining = 0;
    let nextMonthProjected = 0;

    dailyBudgetBurns.forEach((amount, index) => {
      if (index < daysLeftInMonth) {
        currentMonthRemaining += amount;
      } else {
        nextMonthProjected += amount;
      }
    });

    return {
      currentMonthRemaining,
      nextMonthProjected,
      nextMonthDays: Math.max(0, AppConfig.defaults.safeToSpendDays - daysLeftInMonth),
    };
  }

  private computeSafeDaysCount(
    startingBalances: Map<string, number>,
    liquidAccountIds: Set<string>,
    projections: { dayOffset: number; globalBalance: number }[],
  ) {
    let startingGlobal = 0;
    for (const [accountId, balance] of startingBalances.entries()) {
      if (liquidAccountIds.has(accountId)) {
        startingGlobal += balance;
      }
    }

    if (startingGlobal < 0) return 0;

    const firstNegativeProjection = projections.find(p => p.globalBalance < 0);
    return firstNegativeProjection ? firstNegativeProjection.dayOffset + 1 : null;
  }

  private isLiabilityCommitmentForSubtype(
    flow: FlowV2,
    accountMap: Map<string, Account>,
    subtype: AccountSubtype,
  ) {
    if (flow.meta?.source !== 'LIABILITY') return false;
    const liabilityAccount = accountMap.get(flow.meta?.referenceId || '');
    return liabilityAccount?.accountSubtype === subtype;
  }
}

export const simulationV2Adapter = new SimulationV2Adapter();
