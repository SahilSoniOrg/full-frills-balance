import { AppConfig } from '@/src/constants/app-config';
import { AccountType } from '@/src/data/models/Account';
import Budget from '@/src/data/models/Budget';
import { BudgetUsage } from '@/src/services/budget/budgetReadService';
import { TimeContext } from '../TimeContext';
import { AccountCommitment, BudgetEngineResult, DebtType } from '../types';

export interface CurrencyConverter {
  convert(amount: number, from: string, to: string): Promise<number>;
}

export class BudgetEngine {
  private readonly time: TimeContext;
  private readonly converter: CurrencyConverter;
  private readonly resultCurrency: string;

  constructor(time: TimeContext, converter: CurrencyConverter, resultCurrency: string) {
    this.time = time;
    this.converter = converter;
    this.resultCurrency = resultCurrency;
  }

  async run(
    budgets: Budget[],
    usages: BudgetUsage[],
    scopeGroups: any[][],
  ): Promise<BudgetEngineResult> {
    const simulationDays = this.time.getSimulationDays();
    const daysLeftInMonth = this.time.daysLeftInMonth();
    const nextMonthDays = this.time.nextMonthDays();

    const accountMaxDailyBurns = new Map<string, number[]>();
    const accountBudgetBuckets = new Map<string, Map<string, { name: string; amount: number }>>();

    const budgetCoveredExpenseAccountIds = new Set<string>();
    const dailyBudgetBurns = new Array(simulationDays).fill(0);
    let currentMonthRemaining = 0;
    let nextMonthProjected = 0;
    const commitmentsMap = new Map<string, AccountCommitment>();

    for (let idx = 0; idx < usages.length; idx++) {
      const usage = usages[idx];
      const budget = budgets[idx];
      const scope = (scopeGroups[idx] || []) as any[];
      if (scope.length === 0) continue;

      const remaining = Math.max(0, usage.remaining);
      if (remaining === 0 && budget.amount === 0) continue;

      const budgetCurrency = budget.currencyCode || this.resultCurrency;
      const remainingInDefault = await this.converter.convert(
        remaining,
        budgetCurrency,
        this.resultCurrency,
      );
      const amountInDefault = await this.converter.convert(
        budget.amount,
        budgetCurrency,
        this.resultCurrency,
      );

      const isSmoothed = AppConfig.defaults.budgetMode === 'SMOOTHED';
      const burns = new Array(simulationDays).fill(0);

      if (isSmoothed) {
        const totalInWindow =
          remainingInDefault +
          Math.max(0, simulationDays - daysLeftInMonth) *
            (amountInDefault / Math.max(1, nextMonthDays));
        const smoothedDaily = totalInWindow / simulationDays;
        burns.fill(smoothedDaily);
      } else {
        const useConstant30 = AppConfig.insights.useConstant30DayBurn ?? true;
        const minDays = AppConfig.insights.burnRateLookbackMinDays ?? 7;
        const nextMonthDailyRate = amountInDefault / (useConstant30 ? 30 : nextMonthDays);
        const currentMonthDailyRate =
          remainingInDefault /
          (useConstant30 ? Math.max(daysLeftInMonth, minDays) : Math.max(1, daysLeftInMonth));

        for (let i = 0; i < simulationDays; i++) {
          burns[i] = i < daysLeftInMonth ? currentMonthDailyRate : nextMonthDailyRate;
        }
      }

      for (const s of scope) {
        const accountId = s.account.id;
        const acc = s.account;

        if (acc.accountType === AccountType.EXPENSE) {
          budgetCoveredExpenseAccountIds.add(accountId);
        }

        const existingBurns =
          accountMaxDailyBurns.get(accountId) || new Array(simulationDays).fill(0);
        for (let i = 0; i < simulationDays; i++) {
          existingBurns[i] = Math.max(existingBurns[i], burns[i] / scope.length);
        }
        accountMaxDailyBurns.set(accountId, existingBurns);

        let accountBudgets = accountBudgetBuckets.get(accountId);
        if (!accountBudgets) {
          accountBudgets = new Map();
          accountBudgetBuckets.set(accountId, accountBudgets);
        }
        const totalContribution = burns.reduce((a, b) => a + b, 0);
        accountBudgets.set(budget.id, {
          name: budget.name,
          amount: totalContribution / scope.length,
        });
      }
    }

    // Aggregate across all accounts
    for (const [accountId, accountBurns] of accountMaxDailyBurns) {
      const accScope = Array.from(accountBudgetBuckets.get(accountId)?.values() || []);
      const totalAccountAmount = accountBurns.reduce((sum, b) => sum + b, 0);

      if (totalAccountAmount > 0) {
        const accountName = this.findAccountName(accountId, scopeGroups);

        commitmentsMap.set(accountId, {
          accountId,
          accountName: accountName || 'Unknown',
          amount: totalAccountAmount,
          details: accScope
            .map(b => ({
              id: b.name,
              name: b.name,
              amount: b.amount,
              type: DebtType.BUDGET,
            }))
            .sort((a, b) => b.amount - a.amount),
        });

        for (let i = 0; i < simulationDays; i++) {
          dailyBudgetBurns[i] += accountBurns[i];
        }
      }
    }

    // Calculate month summaries
    for (let i = 0; i < simulationDays; i++) {
      if (i < daysLeftInMonth) {
        currentMonthRemaining += dailyBudgetBurns[i];
      } else {
        nextMonthProjected += dailyBudgetBurns[i];
      }
    }

    return {
      flows: [], // Budget doesn't produce atomic flows right now, just aggregate burns
      dailyBudgetBurns,
      commitments: Array.from(commitmentsMap.values()),
      budgetCoveredExpenseAccountIds,
      currentMonthRemaining,
      nextMonthProjected,
    };
  }

  private findAccountName(accountId: string, scopeGroups: any[][]): string | undefined {
    for (const group of scopeGroups) {
      for (const s of group) {
        if (s.account.id === accountId) return s.account.name;
      }
    }
    return undefined;
  }
}
