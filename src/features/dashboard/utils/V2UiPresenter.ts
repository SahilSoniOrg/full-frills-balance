import { AppConfig } from '@/src/constants/app-config';
import Account from '@/src/data/models/Account';
import dayjs from 'dayjs';
import { Flow, SimulationResultV2 } from '@/src/services/simulation/v2/types';

export interface V2UiIncomeEntry {
  id: string;
  name: string;
  amount: number;
  dayOffset: number;
  type: 'PLANNED_PAYMENT' | 'TRANSFER' | 'BUDGET';
}

export interface V2UiCommitmentDetail {
  id: string;
  name: string;
  amount: number;
  type: 'BUDGET' | 'PLANNED_PAYMENT' | 'FALLBACK';
  dayOffset?: number;
}

export interface V2UiAccountCommitment {
  accountId: string;
  accountName: string;
  amount: number;
  details: V2UiCommitmentDetail[];
}

export interface V2UiDebtEntry {
  accountId: string;
  accountName: string;
  amount: number;
  dayOffset: number;
}

export interface V2UiBreakdowns {
  income: V2UiIncomeEntry[];
  committed: V2UiAccountCommitment[];
  debt: V2UiDebtEntry[];
  budget: {
    currentMonthRemaining: number;
    nextMonthProjected: number;
    nextMonthDays: number;
  };
  liabilities: {
    total: number;
    totalCreditCard: number;
    totalOther: number;
    committed: number;
    committedCreditCard: number;
    committedOther: number;
  };
}

export class V2UiPresenter {
  static deriveBreakdowns(
    allFlows: Flow[],
    simulationResult: SimulationResultV2,
    accountMap: Map<string, Account>,
    liabilityAccountBalances: { account: Account; balance: number }[],
  ): V2UiBreakdowns {
    const firstMajorInflowDay = simulationResult.summary?.firstMajorInflowDay ?? null;

    // 1. Income Breakdown
    const income: V2UiIncomeEntry[] = allFlows
      .filter(flow => flow.dayOffset >= 0 && flow.kind === 'INFLOW')
      .map(flow => ({
        id: flow.meta?.referenceId || 'income',
        name: flow.meta?.label || 'Income',
        amount: flow.amount,
        dayOffset: flow.dayOffset,
        type: (flow.meta?.source === 'BUDGET' ? 'BUDGET' : 'PLANNED_PAYMENT') as any,
      }));

    // 2. Committed Breakdown (Bills & Budgets)
    const committedMap = new Map<string, V2UiAccountCommitment>();
    allFlows
      .filter(flow => flow.dayOffset >= 0 && this.isCommitmentFlow(flow))
      .forEach(flow => {
        const target = this.resolveCommitmentTarget(flow, accountMap);
        const entry: V2UiAccountCommitment = committedMap.get(target.accountId) || {
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
              type: 'BUDGET',
            });
          }
        } else {
          entry.details.push({
            id: flow.meta?.referenceId || `${target.accountId}-${flow.dayOffset}-${flow.amount}`,
            name: flow.meta?.label || target.accountName || 'Spending',
            amount: flow.amount,
            dayOffset: flow.dayOffset,
            type: target.detailType === 'PLANNED_PAYMENT' ? 'PLANNED_PAYMENT' : 'FALLBACK',
          });
        }

        committedMap.set(target.accountId, entry);
      });

    // 3. Debt Breakdown
    const debtMap = new Map<string, V2UiDebtEntry>();
    allFlows
      .filter(
        flow => flow.dayOffset >= 0 && flow.kind === 'OUTFLOW' && flow.meta?.source === 'LIABILITY',
      )
      .forEach(flow => {
        const accId = flow.meta?.referenceId || (flow as any).accountId;
        const acc = accountMap.get(accId);
        const entry = debtMap.get(accId) || {
          accountId: accId,
          accountName: acc?.name || 'Liability',
          amount: 0,
          dayOffset: flow.dayOffset,
        };
        entry.amount += flow.amount;
        debtMap.set(accId, entry);
      });

    // 4. Budget Summary
    const now = dayjs().startOf('day');
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

    // 5. Liabilities Summary
    const totalLiabilities = liabilityAccountBalances.reduce((sum, lb) => sum + lb.balance, 0);
    const CC_SUBTYPE = 'CREDIT_CARD';

    const liabilities = {
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

    return {
      income,
      committed: Array.from(committedMap.values()),
      debt: Array.from(debtMap.values()),
      budget: {
        currentMonthRemaining,
        nextMonthProjected,
        nextMonthDays: Math.max(0, AppConfig.defaults.safeToSpendDays - daysLeftInMonth),
      },
      liabilities,
    };
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
        flow.meta?.referenceId ||
        (flow.kind === 'TRANSFER' ? flow.toAccountId : (flow as any).accountId);
      const acc = accountMap.get(accountId);
      return {
        accountId,
        accountName: acc?.name || flow.meta?.label || 'Liability',
        detailType: 'FALLBACK' as const,
      };
    }

    const effectiveSource =
      flow.meta?.source === 'RESOLVED' ? flow.meta.originalSource : flow.meta?.source;
    const accountId =
      flow.meta?.categoryId ||
      (flow.kind === 'TRANSFER' ? flow.toAccountId : (flow as any).accountId) ||
      'other';
    const acc = accountMap.get(accountId);

    return {
      accountId,
      accountName: acc?.name || flow.meta?.label || 'Other',
      detailType: effectiveSource === 'BUDGET' ? ('BUDGET' as const) : ('PLANNED_PAYMENT' as const),
    };
  }
}
