import { AppConfig } from '@/src/constants/app-config';
import Account from '@/src/data/models/Account';
import dayjs from 'dayjs';
import {
  AccountCommitment,
  DebtEntry,
  DebtType,
  Flow,
  FlowSource,
  IncomeEntry,
  SimulationEngineResult,
  SimulationReport,
} from './types';

export class SimulationReportGenerator {
  static generate(
    allFlows: Flow[],
    simulationResult: SimulationEngineResult,
    accountMap: Map<string, Account>,
    liabilityAccountBalances: { account: Account; balance: number }[],
  ): SimulationReport {
    const now = dayjs().startOf('day');
    const firstMajorInflowDay = simulationResult.summary?.firstMajorInflowDay ?? null;

    const income = this.generateIncome(allFlows);
    const committed = this.generateCommitted(allFlows, accountMap, firstMajorInflowDay);
    const debt = this.generateDebt(allFlows, accountMap);
    const budget = this.generateBudgetSummary(allFlows, now);
    const liabilities = this.generateLiabilities(allFlows, accountMap, liabilityAccountBalances);

    return {
      summary: this.generateSummary(income, allFlows, firstMajorInflowDay, committed),
      income,
      committed,
      debt,
      budget,
      liabilities,
    };
  }

  private static generateSummary(
    income: IncomeEntry[],
    allFlows: Flow[],
    firstMajorInflowDay: number | null,
    committed: AccountCommitment[],
  ) {
    const totalFutureInflow = income.reduce((sum, f) => sum + f.amount, 0);
    const totalPlannedInflow = income
      .filter(f => f.type === FlowSource.PLANNED_PAYMENT)
      .reduce((sum, f) => sum + f.amount, 0);
    /**
     * SUMMARY CALCULATION
     * This is the primary location where raw flows are interpreted to derive
     * high-level organic metrics (Inflow/Outflow).
     */
    const totalPlannedOutflow = allFlows
      .filter(
        f =>
          f.dayOffset >= 0 &&
          f.kind === 'OUTFLOW' &&
          (f.meta?.source === 'PLANNED' || f.meta?.originalSource === 'PLANNED'),
      )
      .reduce((sum, f) => sum + f.amount, 0);
    const totalCommittedPlanned = committed.reduce((sum, acc) => sum + acc.amount, 0);

    return {
      firstMajorInflowDay,
      totalFutureInflow,
      totalPlannedInflow,
      totalPlannedOutflow,
      totalCommittedPlanned,
    };
  }

  private static generateIncome(allFlows: Flow[]): IncomeEntry[] {
    return allFlows
      .filter(flow => flow.dayOffset >= 0 && flow.kind === 'INFLOW')
      .map(flow => ({
        id: flow.meta?.referenceId || 'income',
        name: flow.meta?.label || 'Income',
        amount: flow.amount,
        dayOffset: flow.dayOffset,
        type: flow.meta?.source === 'BUDGET' ? FlowSource.BUDGET : FlowSource.PLANNED_PAYMENT,
      }));
  }

  private static generateCommitted(
    allFlows: Flow[],
    accountMap: Map<string, Account>,
    firstMajorInflowDay: number | null,
  ): AccountCommitment[] {
    const committedMap = new Map<string, AccountCommitment>();
    allFlows
      .filter(flow => flow.dayOffset >= 0 && this.isCommitmentFlow(flow))
      .forEach(flow => {
        const target = this.resolveCommitmentTarget(flow, accountMap);
        const entry: AccountCommitment = committedMap.get(target.accountId) || {
          accountId: target.accountId,
          accountName: target.accountName,
          amount: 0,
          details: [],
        };
        entry.amount += flow.amount;

        if (target.detailType === DebtType.BUDGET) {
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
            id: flow.meta?.referenceId || `${target.accountId}-${flow.dayOffset}-${flow.amount}`,
            name: flow.meta?.label || target.accountName || 'Spending',
            amount: flow.amount,
            dayOffset: flow.dayOffset,
            type:
              target.detailType === DebtType.PLANNED_PAYMENT
                ? DebtType.PLANNED_PAYMENT
                : DebtType.FALLBACK,
          });
        }

        committedMap.set(target.accountId, entry);
      });

    return Array.from(committedMap.values());
  }

  private static generateDebt(allFlows: Flow[], accountMap: Map<string, Account>): DebtEntry[] {
    const debtMap = new Map<string, DebtEntry>();
    allFlows
      .filter(
        flow => flow.dayOffset >= 0 && flow.kind === 'OUTFLOW' && flow.meta?.source === 'LIABILITY',
      )
      .forEach(flow => {
        const accId = flow.meta?.referenceId || this.getFlowAccountId(flow);
        const acc = accountMap.get(accId);
        const entry = debtMap.get(accId) || {
          accountId: accId,
          accountName: acc?.name || 'Liability',
          amount: 0,
          dayOffset: flow.dayOffset,
          type: DebtType.FALLBACK,
        };
        entry.amount += flow.amount;
        debtMap.set(accId, entry);
      });
    return Array.from(debtMap.values());
  }

  private static generateBudgetSummary(allFlows: Flow[], now: dayjs.Dayjs) {
    const daysLeftInMonth = now.daysInMonth() - now.date() + 1;
    let currentMonthRemaining = 0;
    let nextMonthProjected = 0;

    allFlows.forEach(flow => {
      if (flow.dayOffset < 0) return;
      const isBudget =
        flow.meta?.source === 'BUDGET' ||
        (flow.meta?.source === 'RESOLVED' && flow.meta.originalSource === 'BUDGET');
      if (isBudget && flow.kind === 'OUTFLOW') {
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
    const CC_SUBTYPE = 'CREDIT_CARD';

    return {
      total: totalLiabilities,
      totalCreditCard: liabilityAccountBalances
        .filter(lb => lb.account.accountSubtype === CC_SUBTYPE)
        .reduce((sum, lb) => sum + lb.balance, 0),
      totalOther: liabilityAccountBalances
        .filter(lb => lb.account.accountSubtype !== CC_SUBTYPE)
        .reduce((sum, lb) => sum + lb.balance, 0),
      committed: allFlows
        .filter(flow => flow.dayOffset >= 0 && flow.meta?.source === 'LIABILITY')
        .reduce((sum, flow) => sum + flow.amount, 0),
      committedCreditCard: allFlows
        .filter(
          flow =>
            flow.dayOffset >= 0 &&
            flow.meta?.source === 'LIABILITY' &&
            accountMap.get(flow.meta?.referenceId || '')?.accountSubtype === CC_SUBTYPE,
        )
        .reduce((sum, flow) => sum + flow.amount, 0),
      committedOther: allFlows
        .filter(
          flow =>
            flow.dayOffset >= 0 &&
            flow.meta?.source === 'LIABILITY' &&
            accountMap.get(flow.meta?.referenceId || '')?.accountSubtype !== CC_SUBTYPE,
        )
        .reduce((sum, flow) => sum + flow.amount, 0),
    };
  }

  private static isCommitmentFlow(flow: Flow): boolean {
    const effectiveSource =
      flow.meta?.source === 'RESOLVED' ? flow.meta.originalSource : flow.meta?.source;
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
        detailType: DebtType.FALLBACK,
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
      detailType: effectiveSource === 'BUDGET' ? DebtType.BUDGET : DebtType.PLANNED_PAYMENT,
    };
  }

  private static getFlowAccountId(flow: Flow): string {
    if (flow.kind === 'TRANSFER') {
      return flow.fromAccountId;
    }
    return flow.accountId;
  }
}
