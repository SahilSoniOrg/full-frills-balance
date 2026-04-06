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
    liquidAccountIds: string[],
  ): Promise<BudgetEngineResult> {
    const simulationDays = this.time.getSimulationDays();
    const daysLeftInMonth = this.time.daysLeftInMonth();
    const nextMonthDays = this.time.nextMonthDays();

    const accountMaxDailyBurns = new Map<string, number[]>();
    const accountBudgetBuckets = new Map<string, Map<string, { name: string; amount: number }>>();
    const dailyAssetAccountBurns = new Map<string, number[]>();

    const budgetCoveredExpenseAccountIds = new Set<string>();
    const dailyBudgetBurns = new Array(simulationDays).fill(0);
    let currentMonthRemaining = 0;
    let nextMonthProjected = 0;
    const commitmentsMap = new Map<string, AccountCommitment>();

    const getTargetAssetAccountIds = (budget: Budget): string[] => {
      if (budget.assetAccountIds) {
        const ids = budget.assetAccountIds.split(',').filter(id => id.trim().length > 0);
        if (ids.length > 0) return ids;
      }
      return liquidAccountIds.length > 0 ? [liquidAccountIds[0]] : [];
    };

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

      // Track burn against the ASSET accounts it draws from
      const targetAssetIds = getTargetAssetAccountIds(budget);
      if (targetAssetIds.length > 0) {
        const shareOfBurn = 1 / targetAssetIds.length;
        for (const assetId of targetAssetIds) {
          const assetBurns =
            dailyAssetAccountBurns.get(assetId) || new Array(simulationDays).fill(0);
          for (let i = 0; i < simulationDays; i++) {
            assetBurns[i] += burns[i] * shareOfBurn;
          }
          dailyAssetAccountBurns.set(assetId, assetBurns);
        }
      }

      // Maintain legacy expense-account based tracking for commitments view
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

    // Populate global daily burns from the asset accounts (which we consolidated above)
    for (const assetBurns of dailyAssetAccountBurns.values()) {
      for (let i = 0; i < simulationDays; i++) {
        dailyBudgetBurns[i] += assetBurns[i];
      }
    }

    // Aggregate commitments for XPENSE visualization
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

    const budgetFlows: any[] = [];
    for (const [assetId, assetBurns] of dailyAssetAccountBurns) {
      const totalAccountBurn = assetBurns.reduce((a, b) => a + b, 0);
      if (totalAccountBurn > 0) {
        budgetFlows.push({
          dayOffset: 0, // Used for summary totals, specific day less critical for usageDetails
          amount: -totalAccountBurn,
          name: 'Monthly Budget Burn',
          source: 'BUDGET',
          type: 'OUTFLOW',
          accountId: assetId,
        });
      }
    }

    return {
      flows: budgetFlows,
      dailyBudgetBurns,
      dailyAssetAccountBurns,
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
