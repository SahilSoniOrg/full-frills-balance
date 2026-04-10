import { AppConfig } from '@/src/constants/app-config';
import Account, { AccountSubtype } from '@/src/data/models/Account';
import dayjs from 'dayjs';
import {
  AccountCommitment,
  AccountSimulationSummary,
  DebtEntry,
  DebtType,
  FlowSource,
  FlowType,
  ProjectionPoint,
  SimulationResult,
} from '../../types';
import { Flow, FlowMeta, SimulationResultV2 } from '../types';

type AccountImpact = {
  accountId: string;
  amount: number;
  dayOffset: number;
  sourceAccountId?: string;
  meta?: FlowMeta;
};

export class LegacySimulationPresenter {
  static buildLegacySimulationResult({
    simulationResult,
    accountSummaries,
    allFlows,
    startingBalances,
    liquidAccountIdsSet,
    liabilityAccountBalances,
    accountMap,
  }: {
    simulationResult: SimulationResultV2;
    accountSummaries: AccountSimulationSummary[];
    allFlows: Flow[];
    startingBalances: Map<string, number>;
    liquidAccountIdsSet: Set<string>;
    liabilityAccountBalances: { account: Account; balance: number }[];
    accountMap: Map<string, Account>;
  }): SimulationResult {
    const liabilityAccountIdsSet = new Set(liabilityAccountBalances.map(lb => lb.account.id));
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
    const safeDaysCount = this.computeSafeDaysCount(
      startingBalances,
      liquidAccountIdsSet,
      simulationResult.projections,
    );

    const summary = simulationResult.summary;
    const firstMajorInflowDay = summary.firstMajorInflowDay;

    const incomeBreakdown: any[] = allFlows
      .filter(flow => flow.kind === 'INFLOW')
      .map(flow => ({
        id: flow.meta?.referenceId || 'income',
        name: flow.meta?.label || 'Income',
        amount: flow.amount,
        dayOffset: flow.dayOffset,
        type: FlowSource.PLANNED_PAYMENT,
      }));

    const committedMap = new Map<string, AccountCommitment>();
    allFlows
      .filter(flow => this.isCommitmentFlow(flow))
      .forEach(flow => {
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
          const detailId = `${flow.meta?.referenceId || 'budget'}${suffix}`;
          const existing = entry.details.find(d => d.id === detailId);

          if (existing) {
            existing.amount += flow.amount;
          } else {
            entry.details.push({
              id: detailId,
              name: flow.meta?.label || 'Budget Burn',
              amount: flow.amount,
              dayOffset: isPostIncome ? firstMajorInflowDay || 0 : 0,
              type: DebtType.BUDGET,
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
            type:
              target.detailType === 'PLANNED_PAYMENT'
                ? DebtType.PLANNED_PAYMENT
                : DebtType.FALLBACK,
          });
        }

        committedMap.set(target.accountId, entry);
      });
    const committedBreakdown = Array.from(committedMap.values());

    const debtMap = new Map<string, DebtEntry>();
    allFlows
      .filter(
        (flow): flow is Extract<Flow, { kind: 'OUTFLOW' }> =>
          flow.kind === 'OUTFLOW' && flow.meta?.source === 'LIABILITY',
      )
      .forEach(flow => {
        const accId = flow.meta?.referenceId || flow.accountId;
        const acc = accountMap.get(accId);
        const entry = debtMap.get(accId) || {
          accountId: accId,
          accountName: acc?.name || 'Liability',
          amount: 0,
          dayOffset: flow.dayOffset,
          type: 'LIABILITY' as any,
        };
        entry.amount += flow.amount;
        debtMap.set(accId, entry);
      });
    const debtBreakdown = Array.from(debtMap.values());

    const totalLiabilities = liabilityAccountBalances.reduce((sum, lb) => sum + lb.balance, 0);

    const liabilitiesBreakdown = {
      total: totalLiabilities,
      totalCreditCard: liabilityAccountBalances
        .filter(lb => lb.account.accountSubtype === 'CREDIT_CARD')
        .reduce((sum, lb) => sum + lb.balance, 0),
      totalOther: liabilityAccountBalances
        .filter(lb => lb.account.accountSubtype !== 'CREDIT_CARD')
        .reduce((sum, lb) => sum + lb.balance, 0),
      committed: allFlows
        .filter(flow => flow.meta?.source === 'LIABILITY')
        .reduce((sum, flow) => sum + flow.amount, 0),
      committedCreditCard: allFlows
        .filter(flow =>
          this.isLiabilityCommitmentForSubtype(flow, accountMap, 'CREDIT_CARD' as any),
        )
        .reduce((sum, flow) => sum + flow.amount, 0),
      committedOther: allFlows
        .filter(flow => flow.meta?.source === 'LIABILITY')
        .filter(
          flow => !this.isLiabilityCommitmentForSubtype(flow, accountMap, 'CREDIT_CARD' as any),
        )
        .reduce((sum, flow) => sum + flow.amount, 0),
    };

    const committedSubtypes = Array.from(
      new Set(
        committedBreakdown
          .map(entry => accountMap.get(entry.accountId)?.accountSubtype)
          .filter(Boolean),
      ),
    ) as any[];
    const debtSubtypes = Array.from(
      new Set(liabilityAccountBalances.map(lb => lb.account.accountSubtype).filter(Boolean)),
    ) as any[];

    const projectionPoints: ProjectionPoint[] = simulationResult.projections.map(point => ({
      timestamp: point.timestamp,
      dayOffset: point.dayOffset,
      value: point.globalBalance,
      isProjected: true,
      details: safeToSpendDailyBreakdown.get(point.dayOffset),
      dailyBurn: dailyBudgetBurns[point.dayOffset],
      accountBalances: point.accountBalances,
    }));

    return {
      summary: {
        safeToSpend: summary.safeToSpend,
        shortfall: summary.shortfall,
        trajectoryMinBalance: summary.trajectoryMinBalance,
        safeDaysCount,
        totalFutureInflow,
        totalOrganicOutflow,
        totalOrganicInflow,
        totalCommittedPlanned,
        firstMajorInflowDay,
      },
      accountSummaries,
      breakdowns: {
        income: incomeBreakdown,
        committed: committedBreakdown,
        debt: debtBreakdown,
        budget: budgetBreakdown,
        liabilities: liabilitiesBreakdown,
      },
      projections: {
        points: projectionPoints,
        dailyBudgetBurns,
        flowByDayOffset,
        safeToSpendDailyBreakdown,
      },
      allFlows,
      metadata: {
        firstMajorInflowDay,
        committedSubtypes,
        debtSubtypes,
      },
    };
  }

  private static buildLegacyProjectionMetadata(
    flows: Flow[],
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

  private static computeTotalFutureInflow(
    flows: Flow[],
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

  private static computePlannedTotals(flows: Flow[]) {
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

  private static buildBudgetBreakdown(dailyBudgetBurns: number[]) {
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

  private static computeSafeDaysCount(
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

  private static isCommitmentFlow(flow: Flow): boolean {
    const effectiveSource =
      flow.meta?.source === 'RESOLVED' ? flow.meta.originalSource : flow.meta?.source;

    if (flow.meta?.source === 'LIABILITY') return flow.kind === 'OUTFLOW';
    if (effectiveSource === 'BUDGET') return flow.kind === 'OUTFLOW';
    if (effectiveSource === 'PLANNED') return flow.kind === 'OUTFLOW' || flow.kind === 'TRANSFER';
    return false;
  }

  private static resolveCommitmentTarget(flow: Flow, accountMap: Map<string, Account>) {
    if (flow.meta?.source === 'LIABILITY') {
      const accountId =
        flow.meta?.referenceId || (flow.kind === 'TRANSFER' ? flow.toAccountId : flow.accountId);
      const acc = accountMap.get(accountId);
      return {
        accountId,
        accountName: acc?.name || flow.meta?.label || 'Liability',
        detailType: 'FALLBACK' as 'FALLBACK',
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

  private static explodeAccountImpacts(flows: Flow[]): AccountImpact[] {
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

  private static isLiabilityCommitmentForSubtype(
    flow: Flow,
    accountMap: Map<string, Account>,
    subtype: AccountSubtype,
  ) {
    if (flow.meta?.source !== 'LIABILITY') return false;
    const liabilityAccount = accountMap.get(flow.meta?.referenceId || '');
    return liabilityAccount?.accountSubtype === subtype;
  }
}
