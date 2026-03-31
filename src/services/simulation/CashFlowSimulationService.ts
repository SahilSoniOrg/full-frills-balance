import { AppConfig } from '@/src/constants/app-config';
import Account, { AccountSubtype, AccountType } from '@/src/data/models/Account';
import Budget from '@/src/data/models/Budget';
import Journal from '@/src/data/models/Journal';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import { TransactionType } from '@/src/data/models/Transaction';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { BudgetUsage } from '@/src/services/budget/budgetReadService';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { getLiquidNetWorthDelta } from '@/src/utils/accountingHelpers';
import { logger } from '@/src/utils/logger';
import { Money } from '@/src/utils/money';
import dayjs from 'dayjs';

export class CashFlowSimulationService {
  /**
   * Configured-day cash flow simulation for Safe to Spend.
   */
  async simulateSafeToSpend(
    startingBalance: Money,
    plannedPayments: PlannedPayment[],
    plannedJournals: Journal[],
    liquidAssetIds: string[],
    liabilityAccountBalances: { account: Account; balance: Money }[],
    budgets: Budget[],
    usages: BudgetUsage[],
    scopeGroups: any[][],
    allAccounts: Account[],
    resultCurrency: string,
  ): Promise<{
    safeToSpend: number;
    shortfall: number;
    trajectoryMinBalance: number;
    totalFutureInflow: number;
    committedBudget: number;
    committedPlanned: number;
    committedPlannedPayments: number;
    committedPlannedJournals: number;
    committedLiabilities: number;
    committedLiabilitiesCC: number;
    committedLiabilitiesOther: number;
    totalLiabilities: number;
    totalLiabilitiesCC: number;
    totalLiabilitiesOther: number;
    currentMonthBudgetRemaining: number;
    nextMonthBudgetProjected: number;
    nextMonthProjectionDays: number;
    dailyBudgetBurns: number[];
    flowByDayOffset: Map<number, number>;
    committedBreakdown: {
      accountId: string;
      accountName: string;
      amount: number;
      details: {
        id: string;
        name: string;
        amount: number;
        type: 'BUDGET' | 'PLANNED_PAYMENT' | 'PLANNED_JOURNAL';
        dayOffset?: number;
      }[];
    }[];
    debtBreakdown: {
      accountId: string;
      accountName: string;
      amount: number;
      type: 'FALLBACK' | 'PLANNED_PAYMENT' | 'PLANNED_JOURNAL';
      dayOffset: number;
    }[];
    incomeBreakdown: {
      id: string;
      name: string;
      amount: number;
      dayOffset: number;
      type: 'PLANNED_PAYMENT' | 'PLANNED_JOURNAL';
    }[];
    firstMajorInflowDay: number | null;
    committedSubtypes: AccountSubtype[];
    debtSubtypes: AccountSubtype[];
    totalOrganicOutflow: number;
    totalOrganicInflow: number;
    projectionPoints: {
      timestamp: number;
      value: number;
      isProjected: boolean;
      details?: { name: string; amount: number; type: 'INFLOW' | 'OUTFLOW' | 'CC_DATE' }[];
      dailyBurn?: number;
    }[];
    safeToSpendDailyBreakdown: Map<
      number,
      { name: string; amount: number; type: 'INFLOW' | 'OUTFLOW' | 'CC_DATE' }[]
    >;
    safeDaysCount: number | null;
  }> {
    const now = dayjs().startOf('day');
    const SIMULATION_DAYS = AppConfig.defaults.safeToSpendDays;

    const flows = await this.getSimulationFlows(
      SIMULATION_DAYS,
      now,
      plannedPayments,
      plannedJournals,
      new Set(liquidAssetIds),
      liabilityAccountBalances,
      budgets,
      usages,
      scopeGroups,
      allAccounts,
      resultCurrency,
    );

    let currentBalance = startingBalance;
    let minBalance = currentBalance;
    const projectionPoints: {
      timestamp: number;
      value: number;
      isProjected: boolean;
      details?: { name: string; amount: number; type: 'INFLOW' | 'OUTFLOW' | 'CC_DATE' }[];
      dailyBurn?: number;
    }[] = [];
    let safeDaysCount: number | null = startingBalance.amount < 0 ? 0 : null;

    projectionPoints.push({
      timestamp: now.valueOf(),
      value: currentBalance.amount,
      isProjected: true,
    });

    for (let d = 0; d < SIMULATION_DAYS; d++) {
      const dailyBurn = Array.isArray(flows.effectiveDailyDrain)
        ? flows.effectiveDailyDrain[d] || 0
        : flows.effectiveDailyDrain;

      // P1: Granular Budget vs Planned Reconciliation
      let coveredPlannedOutflow = 0;
      const dayPlans = flows.plannedOutflowByDayOffsetAndAccount.get(d);
      if (dayPlans) {
        for (const [accId, amt] of dayPlans.entries()) {
          if (amt < 0 && flows.budgetCoveredExpenseAccountIds.has(accId)) {
            coveredPlannedOutflow += Math.abs(amt);
          }
        }
      }

      // Clamp budget reconciliation to prevent over-subtraction from shared/mixed scopes
      coveredPlannedOutflow = Math.min(coveredPlannedOutflow, dailyBurn);

      const adjustedBurn = Math.max(dailyBurn - coveredPlannedOutflow, 0);

      currentBalance = currentBalance.subtract(Money.from(adjustedBurn, resultCurrency));

      const offsetFlow = flows.flowByDayOffset.get(d) || 0;
      currentBalance = currentBalance.add(Money.from(offsetFlow, resultCurrency));

      const dayOffset = d + 1;
      const dayDetails = flows.detailsByDayOffset.get(d);

      projectionPoints.push({
        timestamp: now.add(dayOffset, 'day').valueOf(),
        value: currentBalance.amount,
        isProjected: true,
        details: dayDetails,
        dailyBurn: adjustedBurn,
      });

      if (currentBalance.amount < minBalance.amount) minBalance = currentBalance;

      if (currentBalance.amount < 0 && safeDaysCount === null) {
        safeDaysCount = dayOffset;
      } else if (currentBalance.amount >= 0 && safeDaysCount !== null) {
        // If it was negative but is now recovered, we might want to track this.
        // For now, we'll keep the first broke day as the metric, but log the recovery.
        if (AppConfig.features.debug?.safeToSpendLogs) {
          logger.info(`[SafeToSpend] Balance recovered at day ${dayOffset}`);
        }
      }
    }

    // Dynamic Buffer Logic:
    // Safe to Spend = min(Today's Cash, Lowest point in simulation)
    // This means future income "buffers" future bills, but doesn't increase today's limit.
    const safeToSpendValue = Math.min(startingBalance.amount, minBalance.amount);

    return {
      safeToSpend: Math.max(0, safeToSpendValue),
      shortfall: minBalance.amount < 0 ? Math.abs(minBalance.amount) : 0,
      trajectoryMinBalance: minBalance.amount,
      totalFutureInflow: flows.totalFutureInflow,
      committedBudget: flows.committedBudget,
      committedPlanned: flows.committedPlanned,
      committedPlannedPayments: flows.committedPlannedPayments,
      committedPlannedJournals: flows.committedJournals,
      committedLiabilities: flows.committedLiabilities,
      committedLiabilitiesCC: flows.committedLiabilitiesCC,
      committedLiabilitiesOther: flows.committedLiabilitiesOther,
      totalLiabilities: flows.totalLiabilities,
      totalLiabilitiesCC: flows.totalLiabilitiesCC,
      totalLiabilitiesOther: flows.totalLiabilitiesOther,
      currentMonthBudgetRemaining: flows.currentMonthBudgetRemaining,
      nextMonthBudgetProjected: flows.nextMonthBudgetProjected,
      nextMonthProjectionDays: flows.nextMonthProjectionDays,
      dailyBudgetBurns: flows.dailyBudgetBurns,
      flowByDayOffset: flows.flowByDayOffset,
      committedBreakdown: flows.committedBreakdown,
      debtBreakdown: flows.debtBreakdown,
      incomeBreakdown: flows.incomeBreakdown,
      firstMajorInflowDay: flows.firstMajorInflowDay,
      committedSubtypes: flows.committedSubtypes,
      debtSubtypes: flows.debtSubtypes,
      totalOrganicOutflow: flows.totalOrganicOutflow,
      totalOrganicInflow: flows.totalOrganicInflow,
      projectionPoints,
      safeToSpendDailyBreakdown: flows.detailsByDayOffset,
      safeDaysCount,
    };
  }

  async getSimulationFlows(
    simulationDays: number,
    now: dayjs.Dayjs,
    plannedPayments: PlannedPayment[],
    plannedJournals: Journal[],
    liquidAccountIds: Set<string>,
    liabilityAccountBalances: { account: Account; balance: Money }[],
    budgets: Budget[],
    usages: BudgetUsage[],
    scopeGroups: any[][],
    allAccounts: Account[],
    resultCurrency: string,
  ): Promise<{
    flowByDayOffset: Map<number, number>;
    organicNetFlow: number;
    effectiveDailyDrain: number | number[];
    totalFutureInflow: number;
    committedBudget: number;
    committedPlanned: number;
    committedPlannedPayments: number;
    committedJournals: number;
    committedLiabilities: number;
    committedLiabilitiesCC: number;
    committedLiabilitiesOther: number;
    totalLiabilities: number;
    totalLiabilitiesCC: number;
    totalLiabilitiesOther: number;
    currentMonthBudgetRemaining: number;
    nextMonthBudgetProjected: number;
    nextMonthProjectionDays: number;
    dailyBudgetBurns: number[];
    committedBreakdown: {
      accountId: string;
      accountName: string;
      amount: number;
      details: {
        id: string;
        name: string;
        amount: number;
        type: 'BUDGET' | 'PLANNED_PAYMENT' | 'PLANNED_JOURNAL';
        dayOffset?: number;
      }[];
    }[];
    debtBreakdown: {
      accountId: string;
      accountName: string;
      amount: number;
      type: 'FALLBACK' | 'PLANNED_PAYMENT' | 'PLANNED_JOURNAL';
      dayOffset: number;
    }[];
    incomeBreakdown: {
      id: string;
      name: string;
      amount: number;
      dayOffset: number;
      type: 'PLANNED_PAYMENT' | 'PLANNED_JOURNAL';
    }[];
    firstMajorInflowDay: number | null;
    committedSubtypes: AccountSubtype[];
    debtSubtypes: AccountSubtype[];
    totalOrganicOutflow: number;
    totalOrganicInflow: number;
    detailsByDayOffset: Map<
      number,
      { name: string; amount: number; type: 'INFLOW' | 'OUTFLOW' | 'CC_DATE' }[]
    >;
    plannedOutflowByDayOffsetAndAccount: Map<number, Map<string, number>>;
    budgetCoveredExpenseAccountIds: Set<string>;
  }> {
    const flowByDayOffset = new Map<number, number>();
    const plannedOutflowByDayOffsetAndAccount = new Map<number, Map<string, number>>();
    const rateCache = new Map<string, number>();

    let futureInflow = Money.from(0, resultCurrency);
    let planned = Money.from(0, resultCurrency);
    let plannedPaymentsSum = Money.from(0, resultCurrency);
    let plannedJournalsSum = Money.from(0, resultCurrency);
    let liabilities = Money.from(0, resultCurrency);
    let liabilitiesCC = Money.from(0, resultCurrency);
    let liabilitiesOther = Money.from(0, resultCurrency);
    let totalLiabs = Money.from(0, resultCurrency);
    let totalLiabsCC = Money.from(0, resultCurrency);
    let totalLiabsOther = Money.from(0, resultCurrency);
    let totalNonDebtInflow = Money.from(0, resultCurrency);
    let totalNonDebtOutflow = Money.from(0, resultCurrency);

    const committedBreakdownMap = new Map<
      string,
      {
        accountId: string;
        accountName: string;
        amount: number;
        details: {
          id: string;
          name: string;
          amount: number;
          type: 'BUDGET' | 'PLANNED_PAYMENT' | 'PLANNED_JOURNAL';
          dayOffset?: number;
        }[];
      }
    >();
    const debtBreakdownMap = new Map<
      string,
      {
        accountId: string;
        accountName: string;
        amount: number;
        type: 'FALLBACK' | 'PLANNED_PAYMENT' | 'PLANNED_JOURNAL';
        dayOffset: number;
      }
    >();
    const committedSubtypesSet = new Set<AccountSubtype>();
    const debtSubtypesSet = new Set<AccountSubtype>();
    const incomeBreakdownList: {
      id: string;
      name: string;
      amount: number;
      dayOffset: number;
      type: 'PLANNED_PAYMENT' | 'PLANNED_JOURNAL';
    }[] = [];
    let firstMajorInflowDay: number | null = null;
    const MAJOR_INFLOW_THRESHOLD = AppConfig.defaults.majorInflowThreshold;

    const detailsByDayOffset = new Map<
      number,
      { name: string; amount: number; type: 'INFLOW' | 'OUTFLOW' | 'CC_DATE' }[]
    >();
    const addDetail = (
      dayOffset: number,
      name: string,
      amount: number,
      type: 'INFLOW' | 'OUTFLOW' | 'CC_DATE',
    ) => {
      if (dayOffset < 0 || dayOffset >= simulationDays) return;
      const current = detailsByDayOffset.get(dayOffset) || [];
      if (current.length >= 20) return;
      current.push({ name, amount, type });
      detailsByDayOffset.set(dayOffset, current);
    };

    const liabilityAccountIds = new Set(liabilityAccountBalances.map(lb => lb.account.id));

    const addFlow = (
      dayOffset: number,
      amount: number,
      context?: string,
      sourceType?: 'PLANNED' | 'LIABILITY' | 'BUDGET',
      accountId?: string,
    ) => {
      if (dayOffset < 0 || dayOffset >= simulationDays) return;
      const current = flowByDayOffset.get(dayOffset) || 0;
      flowByDayOffset.set(dayOffset, current + amount);

      if (amount > 0) futureInflow = futureInflow.add(Money.from(amount, resultCurrency));
      if (amount < 0 && (sourceType === 'PLANNED' || sourceType === 'BUDGET')) {
        let dayMap = plannedOutflowByDayOffsetAndAccount.get(dayOffset);
        if (!dayMap) {
          dayMap = new Map<string, number>();
          plannedOutflowByDayOffsetAndAccount.set(dayOffset, dayMap);
        }
        const accId = accountId || 'unknown';
        dayMap.set(accId, (dayMap.get(accId) || 0) + Math.abs(amount));
        totalNonDebtOutflow = totalNonDebtOutflow.add(Money.from(Math.abs(amount), resultCurrency));
      } else if (amount > 0 && sourceType === 'PLANNED') {
        totalNonDebtInflow = totalNonDebtInflow.add(Money.from(amount, resultCurrency));
      }

      if (context && AppConfig.features.debug?.safeToSpendLogs) {
        logger.info(`[SafeToSpend] Flow: ${context} impact ${amount} on day ${dayOffset}`);
      }
    };

    const addCommitment = (
      amount: number,
      type: 'PLAN_PAYMENT' | 'PLAN_JOURNAL' | 'LIABILITY_CC' | 'LIABILITY_OTHER',
      context?: string,
      dayOffset?: number,
      targetAccountId?: string,
    ) => {
      if (amount <= 0) return;
      const commitMoney = Money.from(amount, resultCurrency);

      if (type === 'PLAN_PAYMENT' || type === 'PLAN_JOURNAL') {
        if (type === 'PLAN_PAYMENT') plannedPaymentsSum = plannedPaymentsSum.add(commitMoney);
        if (type === 'PLAN_JOURNAL') plannedJournalsSum = plannedJournalsSum.add(commitMoney);
        planned = planned.add(commitMoney);

        if (targetAccountId && liabilityAccountIds.has(targetAccountId)) {
          const acc = accountById.get(targetAccountId);
          if (!acc) return;
          liabilities = liabilities.add(commitMoney);
          if (acc.accountSubtype === AccountSubtype.CREDIT_CARD) {
            liabilitiesCC = liabilitiesCC.add(commitMoney);
          } else {
            liabilitiesOther = liabilitiesOther.add(commitMoney);
          }
        }
      } else if (type === 'LIABILITY_CC' || type === 'LIABILITY_OTHER') {
        liabilities = liabilities.add(commitMoney);
        if (type === 'LIABILITY_CC') {
          liabilitiesCC = liabilitiesCC.add(commitMoney);
        } else {
          liabilitiesOther = liabilitiesOther.add(commitMoney);
        }
      }

      if (context && AppConfig.features.debug?.safeToSpendLogs) {
        logger.info(
          `[SafeToSpend] Committed: ${context} amount ${amount} on day ${dayOffset ?? 'N/A'}`,
        );
      }
    };

    const daysLeftInMonth = now.daysInMonth() - now.date() + 1;
    const dailyBudgetBurns = new Array(simulationDays).fill(0);
    const nextMonthDays = now.add(1, 'month').daysInMonth();
    const accountMaxDailyBurns = new Map<string, number[]>();
    const accountBudgetBuckets = new Map<string, Map<string, { name: string; amount: number }>>();
    const budgetCoveredExpenseAccountIds = new Set<string>();

    const accountById = new Map(allAccounts.map(account => [account.id, account]));
    liabilityAccountBalances.forEach(lb => {
      if (!accountById.has(lb.account.id)) accountById.set(lb.account.id, lb.account);
    });

    const convertWithCache = async (amount: number, from: string, to: string): Promise<number> => {
      if (from === to) return amount;
      const cacheKey = `${from}_${to}`;
      let rate = rateCache.get(cacheKey);
      if (rate === undefined) {
        try {
          const result = await exchangeRateService.convert(1, from, to);
          rate = result.convertedAmount;
          rateCache.set(cacheKey, rate);
        } catch (e) {
          throw new Error(`Simulation failed: currency conversion error from ${from} to ${to}`);
        }
      }
      return amount * rate;
    };

    await Promise.all(
      usages.map(async (usage, idx) => {
        const budget = budgets[idx];
        const scope = (scopeGroups[idx] || []) as any[];
        if (scope.length === 0) return;

        const remaining = Math.max(0, usage.remaining);
        if (remaining === 0 && budget.amount === 0) return;

        const budgetCurrency = budget.currencyCode || resultCurrency;
        let remainingInDefault = await convertWithCache(remaining, budgetCurrency, resultCurrency);
        let amountInDefault = await convertWithCache(budget.amount, budgetCurrency, resultCurrency);

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
          if (!accountById.has(accountId)) accountById.set(accountId, s.account);

          const acc = accountById.get(accountId);
          if (!acc) continue;
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
      }),
    );

    for (const burns of accountMaxDailyBurns.values()) {
      for (let i = 0; i < simulationDays; i++) {
        dailyBudgetBurns[i] += burns[i];
      }
    }

    let currentMonthBudgRem = Money.from(0, resultCurrency);
    let nextMonthBudgProj = Money.from(0, resultCurrency);
    for (let i = 0; i < simulationDays; i++) {
      const burn = Money.from(dailyBudgetBurns[i], resultCurrency);
      if (i < daysLeftInMonth) {
        currentMonthBudgRem = currentMonthBudgRem.add(burn);
      } else {
        nextMonthBudgProj = nextMonthBudgProj.add(burn);
      }
    }

    const committedBudg = currentMonthBudgRem.add(nextMonthBudgProj);
    const effectiveDailyDrain = dailyBudgetBurns;
    const nextMonthProjectionDays = Math.max(0, simulationDays - daysLeftInMonth);

    for (const [accountId, burns] of accountMaxDailyBurns) {
      const acc = accountById.get(accountId);
      const totalAmount = burns.reduce((sum, b) => sum + b, 0);
      if (totalAmount <= 0) continue;

      const budgetsMap = accountBudgetBuckets.get(accountId);
      const details = budgetsMap
        ? Array.from(budgetsMap.entries()).map(([budgetId, b]) => ({
            id: budgetId,
            name: b.name,
            amount: b.amount,
            type: 'BUDGET' as const,
          }))
        : [];

      committedBreakdownMap.set(accountId, {
        accountId,
        accountName: acc?.name || 'Unknown',
        amount: totalAmount,
        details: details.sort((a, b) => b.amount - a.amount),
      });

      if (acc?.accountSubtype) committedSubtypesSet.add(acc.accountSubtype);
    }

    const plannedLiabilityCoverageMap = new Map<string, number>();
    const endMs = now.add(simulationDays, 'day').valueOf();

    for (const pp of plannedPayments) {
      if (!liabilityAccountIds.has(pp.toAccountId)) continue;

      let amountDefault = await convertWithCache(
        pp.amount,
        pp.currencyCode || resultCurrency,
        resultCurrency,
      );

      let curr = pp.nextOccurrence;
      while (curr <= endMs) {
        if (dayjs(curr).isAfter(now.subtract(1, 'minute'))) {
          plannedLiabilityCoverageMap.set(
            pp.toAccountId,
            (plannedLiabilityCoverageMap.get(pp.toAccountId) || 0) + amountDefault,
          );
        }
        if (!pp.intervalN || pp.intervalN <= 0) break;
        if (pp.intervalType === 'DAILY') curr = dayjs(curr).add(pp.intervalN, 'day').valueOf();
        else if (pp.intervalType === 'WEEKLY')
          curr = dayjs(curr).add(pp.intervalN, 'week').valueOf();
        else if (pp.intervalType === 'MONTHLY')
          curr = dayjs(curr).add(pp.intervalN, 'month').valueOf();
        else if (pp.intervalType === 'YEARLY')
          curr = dayjs(curr).add(pp.intervalN, 'year').valueOf();
        else break;
      }
    }

    if (plannedJournals.length > 0) {
      const journalCoveredTxs = await transactionRepository.findByJournals(
        plannedJournals.map(j => j.id),
      );
      const journalById = new Map(plannedJournals.map(j => [j.id, j]));

      for (const tx of journalCoveredTxs) {
        if (!liabilityAccountIds.has(tx.accountId)) continue;
        if (tx.transactionType !== TransactionType.DEBIT) continue;

        const journal = journalById.get(tx.journalId);
        if (!journal) continue;

        const occurrenceMs = journal.journalDate;
        if (occurrenceMs <= now.subtract(1, 'minute').valueOf() || occurrenceMs > endMs) continue;

        let amountDefault = await convertWithCache(
          tx.amount,
          tx.currencyCode || resultCurrency,
          resultCurrency,
        );
        plannedLiabilityCoverageMap.set(
          tx.accountId,
          (plannedLiabilityCoverageMap.get(tx.accountId) || 0) + amountDefault,
        );
      }
    }

    for (const lb of liabilityAccountBalances) {
      const convMoney = lb.balance;
      if (convMoney.amount <= 0) continue;

      totalLiabs = totalLiabs.add(convMoney);
      const acc = accountById.get(lb.account.id);
      if (!acc) continue;

      if (acc.accountSubtype === AccountSubtype.CREDIT_CARD) {
        totalLiabsCC = totalLiabsCC.add(convMoney);
      } else {
        totalLiabsOther = totalLiabsOther.add(convMoney);
      }

      const metadataRecord = (await lb.account.metadataRecords.fetch())[0];
      const todayDay = now.date();
      const statementDay = metadataRecord?.statementDay;
      const dueDay = metadataRecord?.dueDay || AppConfig.insights.liabilityDefaultDueDay;
      const coverageAmount = plannedLiabilityCoverageMap.get(lb.account.id) || 0;

      if (lb.account.accountSubtype === AccountSubtype.CREDIT_CARD && statementDay) {
        let d1Date = now.date(dueDay).startOf('day');
        if (d1Date.isBefore(now, 'day')) d1Date = d1Date.add(1, 'month');
        let s1Date = d1Date.date(statementDay).startOf('day');
        if (dueDay <= statementDay) s1Date = s1Date.subtract(1, 'month');

        let amountDueAtD1 = convMoney.amount;
        let amountDueAtD2 = 0;

        if (now.isAfter(s1Date, 'day')) {
          const balancesAtStatement = await transactionRawRepository.getLatestBalancesRaw(
            [lb.account.id],
            s1Date.valueOf(),
          );
          const statementBalanceRaw = Math.abs(balancesAtStatement.get(lb.account.id) || 0);
          const convStatement = await convertWithCache(
            statementBalanceRaw,
            lb.account.currencyCode || resultCurrency,
            resultCurrency,
          );
          amountDueAtD1 = Math.min(convMoney.amount, convStatement);
          amountDueAtD2 = Math.max(0, convMoney.amount - amountDueAtD1);
        }

        const EPSILON = AppConfig.insights.liabilityCommitmentTolerance || 0.01;
        const coverageForD1 = Math.min(coverageAmount, amountDueAtD1);
        const coverageForD2 = Math.min(Math.max(0, coverageAmount - coverageForD1), amountDueAtD2);

        if (amountDueAtD1 > EPSILON) {
          const unsettled = Math.max(0, amountDueAtD1 - coverageForD1);
          if (unsettled > EPSILON) {
            const dayOffset = d1Date.diff(now.startOf('day'), 'day');
            addFlow(
              dayOffset,
              -unsettled,
              `Liability (Current bill): ${lb.account.name}`,
              'LIABILITY',
              lb.account.id,
            );
            addCommitment(
              unsettled,
              'LIABILITY_CC',
              `Liability (Current bill): ${lb.account.name}`,
              dayOffset,
            );
            addDetail(dayOffset, `${lb.account.name} CC`, unsettled, 'OUTFLOW');
            debtBreakdownMap.set(`${lb.account.id}-d1`, {
              accountId: lb.account.id,
              accountName: `${lb.account.name} (Current)`,
              amount: unsettled,
              type: 'FALLBACK',
              dayOffset,
            });
          }
        }
        if (amountDueAtD2 > EPSILON) {
          const unsettled = Math.max(0, amountDueAtD2 - coverageForD2);
          if (unsettled > EPSILON) {
            const d2Date = d1Date.add(1, 'month');
            const dayOffset = d2Date.diff(now.startOf('day'), 'day');
            if (dayOffset < simulationDays) {
              addFlow(
                dayOffset,
                -unsettled,
                `Liability (Future spending): ${lb.account.name}`,
                'LIABILITY',
                lb.account.id,
              );
              addCommitment(
                unsettled,
                'LIABILITY_CC',
                `Liability (Future spending): ${lb.account.name}`,
                dayOffset,
              );
              addDetail(dayOffset, `${lb.account.name} CC (Future)`, unsettled, 'OUTFLOW');
              debtBreakdownMap.set(`${lb.account.id}-d2`, {
                accountId: lb.account.id,
                accountName: `${lb.account.name} (Future)`,
                amount: unsettled,
                type: 'FALLBACK',
                dayOffset,
              });
            }
          }
        }
        if (lb.account.accountSubtype) debtSubtypesSet.add(lb.account.accountSubtype);
      } else {
        const unsettledAmount = Math.max(0, convMoney.amount - coverageAmount);
        const EPSILON = AppConfig.insights.liabilityCommitmentTolerance || 0.01;
        if (unsettledAmount > EPSILON) {
          let deductionDay =
            metadataRecord?.dueDay ||
            metadataRecord?.emiDay ||
            AppConfig.insights.liabilityFallbackDeductionDay;
          let targetDate = now.date(deductionDay);
          if (deductionDay <= todayDay) targetDate = targetDate.add(1, 'month');
          const dayOffset = targetDate.startOf('day').diff(now.startOf('day'), 'day');
          const type =
            lb.account.accountSubtype === AccountSubtype.CREDIT_CARD
              ? 'LIABILITY_CC'
              : 'LIABILITY_OTHER';
          addFlow(
            dayOffset,
            -unsettledAmount,
            `Liability (Unsettled): ${lb.account.name}`,
            'LIABILITY',
            lb.account.id,
          );
          addCommitment(
            unsettledAmount,
            type,
            `Liability (Unsettled): ${lb.account.name}`,
            dayOffset,
          );
          debtBreakdownMap.set(lb.account.id, {
            accountId: lb.account.id,
            accountName: lb.account.name,
            amount: unsettledAmount,
            type: 'FALLBACK',
            dayOffset,
          });
          if (lb.account.accountSubtype) debtSubtypesSet.add(lb.account.accountSubtype);
        }
      }
    }

    const journalCoveredPPIds = new Set<string>(
      plannedJournals.map(pj => pj.plannedPaymentId).filter((id): id is string => Boolean(id)),
    );
    for (const pp of plannedPayments) {
      if (journalCoveredPPIds.has(pp.id)) continue;
      const isLiquidFrom =
        liquidAccountIds.has(pp.fromAccountId) || liabilityAccountIds.has(pp.fromAccountId);
      const isLiquidTo =
        liquidAccountIds.has(pp.toAccountId) || liabilityAccountIds.has(pp.toAccountId);
      if (!isLiquidFrom && !isLiquidTo) continue;

      const isInternalTransfer =
        (liquidAccountIds.has(pp.fromAccountId) || liabilityAccountIds.has(pp.fromAccountId)) &&
        (liquidAccountIds.has(pp.toAccountId) || liabilityAccountIds.has(pp.toAccountId));

      let curr = pp.nextOccurrence;
      while (curr <= endMs) {
        if (dayjs(curr).isAfter(now.subtract(1, 'minute'))) {
          const dayOffset = dayjs(curr).startOf('day').diff(now.startOf('day'), 'day');
          let amountDefault = await convertWithCache(
            pp.amount,
            pp.currencyCode || resultCurrency,
            resultCurrency,
          );

          if (isInternalTransfer) {
            const isDebtPaymentCommitment = liabilityAccountIds.has(pp.toAccountId);
            if (isDebtPaymentCommitment) {
              addCommitment(
                amountDefault,
                'PLAN_PAYMENT',
                `Debt Payment: ${pp.name || 'unnamed'}`,
                dayOffset,
                pp.toAccountId,
              );

              const accId = pp.toAccountId;
              const acc = accountById.get(accId);
              const existing = committedBreakdownMap.get(accId) || {
                accountId: accId,
                accountName: acc?.name || pp.name || 'Expense',
                amount: 0,
                details: [] as {
                  id: string;
                  name: string;
                  amount: number;
                  type: 'BUDGET' | 'PLANNED_PAYMENT' | 'PLANNED_JOURNAL';
                  dayOffset?: number;
                }[],
              };
              existing.amount += amountDefault;
              existing.details.push({
                id: pp.id,
                name: pp.name || 'unnamed',
                amount: amountDefault,
                type: 'PLANNED_PAYMENT',
                dayOffset,
              });
              committedBreakdownMap.set(accId, existing);
              if (acc?.accountSubtype) committedSubtypesSet.add(acc.accountSubtype);
            }
            curr = this.getNextOccurrence(curr, pp);
            continue;
          }

          const impact = isLiquidTo ? amountDefault : -amountDefault;
          const accountIdForFlow = impact < 0 ? pp.fromAccountId : pp.toAccountId;

          addFlow(
            dayOffset,
            impact,
            `Planned Payment: ${pp.name || 'unnamed'}`,
            'PLANNED',
            accountIdForFlow,
          );

          const isOutflowToExternal = impact < 0;
          if (isOutflowToExternal) {
            addCommitment(
              amountDefault,
              'PLAN_PAYMENT',
              `Planned Payment: ${pp.name || 'unnamed'}`,
              dayOffset,
              pp.toAccountId,
            );

            const accId = pp.toAccountId;
            const acc = accountById.get(accId);
            const existing = committedBreakdownMap.get(accId) || {
              accountId: accId,
              accountName: acc?.name || pp.name || 'Expense',
              amount: 0,
              details: [] as {
                id: string;
                name: string;
                amount: number;
                type: 'BUDGET' | 'PLANNED_PAYMENT' | 'PLANNED_JOURNAL';
                dayOffset?: number;
              }[],
            };
            existing.amount += amountDefault;
            existing.details.push({
              id: pp.id,
              name: pp.name || 'unnamed',
              amount: amountDefault,
              type: 'PLANNED_PAYMENT',
              dayOffset,
            });
            committedBreakdownMap.set(accId, existing);
            if (acc?.accountSubtype) committedSubtypesSet.add(acc.accountSubtype);
          }

          addDetail(
            dayOffset,
            pp.name || 'Planned',
            Math.abs(amountDefault),
            impact > 0 ? 'INFLOW' : 'OUTFLOW',
          );

          if (impact > 0) {
            incomeBreakdownList.push({
              id: pp.id,
              name: pp.name || 'Income',
              amount: amountDefault,
              dayOffset,
              type: 'PLANNED_PAYMENT',
            });
            if (
              amountDefault >= MAJOR_INFLOW_THRESHOLD &&
              (firstMajorInflowDay === null || dayOffset < firstMajorInflowDay)
            )
              firstMajorInflowDay = dayOffset;
          }
        }
        curr = this.getNextOccurrence(curr, pp);
      }
    }

    if (plannedJournals.length > 0) {
      const allPlannedTxs = await transactionRepository.findByJournals(
        plannedJournals.map(j => j.id),
      );
      const txByJournalId = new Map<string, any[]>();
      for (const tx of allPlannedTxs) {
        const list = txByJournalId.get(tx.journalId) || [];
        list.push(tx);
        txByJournalId.set(tx.journalId, list);
      }

      for (const journal of plannedJournals) {
        const journalTxs = txByJournalId.get(journal.id) || [];
        const isInternalTransfer = journalTxs.every(
          tx => liquidAccountIds.has(tx.accountId) || liabilityAccountIds.has(tx.accountId),
        );

        for (const tx of journalTxs) {
          if (!liquidAccountIds.has(tx.accountId) && !liabilityAccountIds.has(tx.accountId))
            continue;
          const occurrenceMs = journal.journalDate;
          if (occurrenceMs <= now.subtract(1, 'minute').valueOf() || occurrenceMs >= endMs)
            continue;

          const dayOffset = dayjs(occurrenceMs).startOf('day').diff(now.startOf('day'), 'day');
          let amountDefault = await convertWithCache(
            tx.amount,
            tx.currencyCode || resultCurrency,
            resultCurrency,
          );

          if (isInternalTransfer) {
            const isInternalCommitToDebt =
              liabilityAccountIds.has(tx.accountId) && tx.transactionType === TransactionType.DEBIT;
            if (isInternalCommitToDebt) {
              addCommitment(
                amountDefault,
                'PLAN_JOURNAL',
                `Planned Journal Tx (Debt): ${journal.description}`,
                dayOffset,
                tx.accountId,
              );

              const accId = tx.accountId;
              const acc = accountById.get(accId);
              const existing = committedBreakdownMap.get(accId) || {
                accountId: accId,
                accountName: acc?.name || journal.description || 'Expense',
                amount: 0,
                details: [] as {
                  id: string;
                  name: string;
                  amount: number;
                  type: 'BUDGET' | 'PLANNED_PAYMENT' | 'PLANNED_JOURNAL';
                  dayOffset?: number;
                }[],
              };
              existing.amount += amountDefault;
              existing.details.push({
                id: journal.id,
                name: journal.description || 'journal',
                amount: amountDefault,
                type: 'PLANNED_JOURNAL',
                dayOffset,
              });
              committedBreakdownMap.set(accId, existing);
              if (acc?.accountSubtype) committedSubtypesSet.add(acc.accountSubtype);
            }
            continue;
          }

          const acc = accountById.get(tx.accountId);
          if (!acc) {
            throw new Error(`Missing account for tx ${tx.id}`);
          }
          const impact = acc
            ? getLiquidNetWorthDelta(amountDefault, acc.accountType, tx.transactionType)
            : tx.transactionType === TransactionType.DEBIT
              ? amountDefault
              : -amountDefault;
          addFlow(
            dayOffset,
            impact,
            `Planned Journal Tx: ${journal.description}`,
            'PLANNED',
            tx.accountId,
          );

          const isOutflowFromLiquid = tx.transactionType === TransactionType.CREDIT;
          if (isOutflowFromLiquid) {
            addCommitment(
              amountDefault,
              'PLAN_JOURNAL',
              `Planned Journal Outflow: ${journal.description}`,
              dayOffset,
              tx.accountId,
            );

            const accId = tx.accountId;
            const acc = accountById.get(accId);
            const existing = committedBreakdownMap.get(accId) || {
              accountId: accId,
              accountName: acc?.name || journal.description || 'Expense',
              amount: 0,
              details: [] as {
                id: string;
                name: string;
                amount: number;
                type: 'BUDGET' | 'PLANNED_PAYMENT' | 'PLANNED_JOURNAL';
                dayOffset?: number;
              }[],
            };
            existing.amount += amountDefault;
            existing.details.push({
              id: journal.id,
              name: journal.description || 'journal',
              amount: amountDefault,
              type: 'PLANNED_JOURNAL',
              dayOffset,
            });
            committedBreakdownMap.set(accId, existing);
            if (acc?.accountSubtype) committedSubtypesSet.add(acc.accountSubtype);
          }

          addDetail(
            dayOffset,
            journal.description || 'Planned',
            Math.abs(amountDefault),
            impact > 0 ? 'INFLOW' : 'OUTFLOW',
          );

          if (impact > 0) {
            incomeBreakdownList.push({
              id: journal.id,
              name: journal.description || 'journal',
              amount: amountDefault,
              dayOffset,
              type: 'PLANNED_JOURNAL',
            });
            if (
              amountDefault >= MAJOR_INFLOW_THRESHOLD &&
              (firstMajorInflowDay === null || dayOffset < firstMajorInflowDay)
            )
              firstMajorInflowDay = dayOffset;
          }
        }
      }
    }

    return {
      flowByDayOffset,
      plannedOutflowByDayOffsetAndAccount,
      organicNetFlow: 0,
      effectiveDailyDrain,
      totalFutureInflow: futureInflow.amount,
      committedBudget: committedBudg.amount,
      committedPlanned: planned.amount,
      committedPlannedPayments: plannedPaymentsSum.amount,
      committedJournals: plannedJournalsSum.amount,
      committedLiabilities: liabilities.amount,
      committedLiabilitiesCC: liabilitiesCC.amount,
      committedLiabilitiesOther: liabilitiesOther.amount,
      totalLiabilities: totalLiabs.amount,
      totalLiabilitiesCC: totalLiabsCC.amount,
      totalLiabilitiesOther: totalLiabsOther.amount,
      currentMonthBudgetRemaining: currentMonthBudgRem.amount,
      nextMonthBudgetProjected: nextMonthBudgProj.amount,
      nextMonthProjectionDays,
      dailyBudgetBurns,
      committedBreakdown: Array.from(committedBreakdownMap.values()).sort(
        (a, b) => b.amount - a.amount,
      ),
      debtBreakdown: Array.from(debtBreakdownMap.values()).sort((a, b) => b.amount - a.amount),
      incomeBreakdown: incomeBreakdownList.sort((a, b) => a.dayOffset - b.dayOffset),
      firstMajorInflowDay,
      committedSubtypes: Array.from(committedSubtypesSet),
      debtSubtypes: Array.from(debtSubtypesSet),
      totalOrganicOutflow: totalNonDebtOutflow.amount,
      totalOrganicInflow: totalNonDebtInflow.amount,
      detailsByDayOffset,
      budgetCoveredExpenseAccountIds,
    };
  }

  private getNextOccurrence(curr: number, pp: PlannedPayment): number {
    if (pp.intervalType === 'DAILY')
      return dayjs(curr)
        .add(pp.intervalN || 1, 'day')
        .valueOf();
    if (pp.intervalType === 'WEEKLY')
      return dayjs(curr)
        .add(pp.intervalN || 1, 'week')
        .valueOf();
    if (pp.intervalType === 'MONTHLY')
      return dayjs(curr)
        .add(pp.intervalN || 1, 'month')
        .valueOf();
    if (pp.intervalType === 'YEARLY')
      return dayjs(curr)
        .add(pp.intervalN || 1, 'year')
        .valueOf();
    throw new Error(
      `Simulation failed: Unsupported intervalType ${pp.intervalType} for planned payment ${pp.id}`,
    );
  }
}

export const cashFlowSimulationService = new CashFlowSimulationService();
