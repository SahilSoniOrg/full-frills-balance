import Account, { AccountSubtype } from '@/src/data/models/Account';
import Budget from '@/src/data/models/Budget';
import Journal from '@/src/data/models/Journal';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import { BudgetUsage } from '@/src/services/budget/budgetReadService';
import { ISimulationService, SimulationResult } from '../types';
import { cashFlowSimulationServiceV2 } from './CashFlowSimulationServiceV2';

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

    // Adapt V2 results to the legacy SimulationResult interface
    const safeDaysCount = simulationResults.projections.findIndex(p => p.globalBalance <= 0);
    const allFlows = simulationResults.allFlows || [];
    const accountMap = new Map(allAccounts.map(a => [a.id, a]));

    const incomeFlows = allFlows.filter((f: any) => f.kind === 'INFLOW');
    const outcomeFlows = allFlows.filter((f: any) => f.kind === 'OUTFLOW');
    const firstMajorInflowDay =
      incomeFlows.length > 0 ? Math.min(...incomeFlows.map((f: any) => f.dayOffset)) : null;

    const incomeBreakdown = incomeFlows.map((f: any) => ({
      id: f.meta?.referenceId || 'income',
      name: f.meta?.label || 'Income',
      amount: f.amount,
      dayOffset: f.dayOffset,
      type: 'PLANNED' as any,
    }));

    // Group Committed (Planned + Budget) by Account
    const committedMap = new Map<string, any>();
    allFlows
      .filter(
        (f: any) =>
          f.kind === 'OUTFLOW' &&
          (f.meta?.source === 'PLANNED' ||
            f.meta?.source === 'BUDGET' ||
            f.meta?.source === 'RESOLVED'),
      )
      .forEach((f: any) => {
        const accId = (f as any).accountId || 'other';
        const acc = accountMap.get(accId);
        const entry = committedMap.get(accId) || {
          accountId: accId,
          accountName: acc?.name || 'Other',
          amount: 0,
          details: [],
        };
        entry.amount += f.amount;

        const effectiveSource =
          f.meta?.source === 'RESOLVED' ? f.meta.originalSource : f.meta?.source;

        if (effectiveSource === 'BUDGET') {
          const isPostIncome = firstMajorInflowDay !== null && f.dayOffset >= firstMajorInflowDay;
          const suffix = isPostIncome ? '_post' : '_pre';
          const detailId = (f.meta?.referenceId || 'budget') + suffix;

          const existing = entry.details.find((d: any) => d.id === detailId);
          if (existing) {
            existing.amount += f.amount;
          } else {
            entry.details.push({
              id: detailId,
              name: f.meta?.label || 'Budget Burn',
              amount: f.amount,
              dayOffset: isPostIncome ? firstMajorInflowDay : 0,
              type: 'BUDGET',
            });
          }
        } else {
          entry.details.push({
            id: f.meta?.referenceId || Math.random().toString(),
            name: f.meta?.label || 'Spending',
            amount: f.amount,
            dayOffset: f.dayOffset,
            type: 'PLANNED_PAYMENT',
          });
        }

        committedMap.set(accId, entry);
      });
    const committedBreakdown = Array.from(committedMap.values());

    // Group Debts (Liabilities) by Account
    const debtMap = new Map<string, any>();
    allFlows
      .filter((f: any) => f.kind === 'OUTFLOW' && f.meta?.source === 'LIABILITY')
      .forEach((f: any) => {
        const accId = (f as any).accountId;
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

    const totalFutureInflow = incomeFlows.reduce((sum: number, f: any) => sum + f.amount, 0);
    const totalCommittedPlanned = allFlows
      .filter((f: any) => f.kind === 'OUTFLOW' && f.meta?.source === 'PLANNED')
      .reduce((sum: number, f: any) => sum + f.amount, 0);

    const totalLiabilities = liabilityAccountBalances.reduce(
      (sum: number, b: any) => sum + b.balance,
      0,
    );

    const legacyResult: SimulationResult = {
      accountSummaries: simulationResults.accountSummaries as any,
      summary: {
        ...simulationResults.summary,
        safeDaysCount: safeDaysCount === -1 ? null : safeDaysCount,
        totalFutureInflow,
        totalOrganicInflow: totalFutureInflow,
        totalOrganicOutflow: outcomeFlows.reduce((sum: number, f: any) => sum + f.amount, 0),
        totalCommittedPlanned,
        firstMajorInflowDay,
      },
      breakdowns: {
        income: incomeBreakdown,
        committed: committedBreakdown as any,
        debt: debtBreakdown as any,
        budget: {
          currentMonthRemaining: allFlows
            .filter(
              (f: any) =>
                (f.meta?.source === 'BUDGET' || f.meta?.source === 'RESOLVED') && f.dayOffset < 30,
            )
            .reduce((sum: number, f: any) => sum + f.amount, 0),
          nextMonthProjected: 0,
          nextMonthDays: 0,
        },
        liabilities: {
          total: totalLiabilities,
          totalCreditCard: liabilityAccountBalances
            .filter(lb => lb.account.accountSubtype === AccountSubtype.CREDIT_CARD)
            .reduce((sum, b) => sum + b.balance, 0),
          totalOther: liabilityAccountBalances
            .filter(lb => lb.account.accountSubtype !== AccountSubtype.CREDIT_CARD)
            .reduce((sum, b) => sum + b.balance, 0),
          committed: allFlows
            .filter(
              (f: any) =>
                f.meta?.source === 'LIABILITY' ||
                (f.meta?.source === 'RESOLVED' && f.meta?.tags?.includes('LIABILITY_PAYMENT')),
            )
            .reduce((sum: number, f: any) => sum + f.amount, 0),
          committedCreditCard: allFlows
            .filter(
              (f: any) =>
                f.meta?.source === 'LIABILITY' ||
                (f.meta?.source === 'RESOLVED' && f.meta?.tags?.includes('LIABILITY_PAYMENT')),
            )
            .reduce((sum: number, f: any) => sum + f.amount, 0),
          committedOther: 0,
        },
      },
      projections: {
        points: simulationResults.projections.map(p => ({
          timestamp: p.timestamp,
          value: p.globalBalance,
          isProjected: true,
          details: p.flows.map((f: any) => {
            const label =
              f.meta?.label || (f.meta?.source === 'BUDGET' ? 'Budget Burn' : 'Spending');
            return {
              name: label,
              amount: f.amount,
              type: f.kind as any,
              context: f.meta?.source,
            };
          }),
        })),
        dailyBudgetBurns: [],
        flowByDayOffset: new Map(),
        safeToSpendDailyBreakdown: new Map(),
      },
      metadata: {
        firstMajorInflowDay,
        committedSubtypes: Array.from(
          new Set(
            allFlows
              .filter(
                (f: any) =>
                  f.kind === 'OUTFLOW' &&
                  (f.meta?.source === 'PLANNED' ||
                    f.meta?.source === 'BUDGET' ||
                    f.meta?.source === 'RESOLVED'),
              )
              .map((f: any) => {
                const acc = accountMap.get((f as any).accountId);
                return acc?.accountSubtype;
              })
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
}

export const simulationV2Adapter = new SimulationV2Adapter();
