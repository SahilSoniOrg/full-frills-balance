import { AppConfig } from '@/src/constants/app-config';
import Account from '@/src/data/models/Account';
import Budget from '@/src/data/models/Budget';
import Journal from '@/src/data/models/Journal';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { BudgetUsage } from '@/src/services/budget/budgetReadService';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import dayjs from 'dayjs';
import { TimeContext } from './TimeContext';
import { BudgetEngine, CurrencyConverter } from './engines/BudgetEngine';
import { LiabilityEngine } from './engines/LiabilityEngine';
import { PlannedFlowEngine } from './engines/PlannedFlowEngine';
import { FlowType, SimulationResult } from './types';

export class CashFlowSimulationService {
  /**
   * Configured-day cash flow simulation for Safe to Spend.
   */
  async simulateSafeToSpend(
    startingBalance: number,
    plannedPayments: PlannedPayment[],
    plannedJournals: Journal[],
    liquidAssetIds: string[],
    liabilityAccountBalances: { account: Account; balance: number }[],
    budgets: Budget[],
    usages: BudgetUsage[],
    scopeGroups: any[][],
    allAccounts: Account[],
    resultCurrency: string,
  ): Promise<SimulationResult> {
    const simulationDays = AppConfig.defaults.safeToSpendDays;
    const time = new TimeContext(dayjs(), simulationDays);

    const converter: CurrencyConverter = {
      convert: async (amount, from, to) => {
        if (from === to) return amount;
        const result = await exchangeRateService.convert(amount, from, to);
        return result.convertedAmount;
      },
    };

    // 1. Data Pre-fetching
    const liabilityIds = liabilityAccountBalances.map(lb => lb.account.id);
    const metadataRecords = await Promise.all(
      liabilityAccountBalances.map(lb => lb.account.metadataRecords.fetch()),
    );
    const metadataMap = new Map(
      liabilityAccountBalances.map((lb, i) => [lb.account.id, metadataRecords[i][0]]),
    );

    const journalIds = plannedJournals.map(j => j.id);
    const journalTxs =
      journalIds.length > 0 ? await transactionRepository.findByJournals(journalIds) : [];
    const journalTxsMap = new Map<string, any[]>();
    for (const tx of journalTxs) {
      const list = journalTxsMap.get(tx.journalId) || [];
      list.push(tx);
      journalTxsMap.set(tx.journalId, list);
    }

    // Credits card statement balances
    const statementBalances = new Map<string, number>();
    const ccAccounts = liabilityAccountBalances.filter(
      lb => lb.account.accountSubtype === 'CREDIT_CARD',
    );
    if (ccAccounts.length > 0) {
      await Promise.all(
        ccAccounts.map(async lb => {
          const metadata = metadataMap.get(lb.account.id);
          if (metadata?.statementDay) {
            const dueDay = (metadata as any).dueDay || AppConfig.insights.liabilityDefaultDueDay;
            const d1Date = time.getStartOfToday().date(dueDay).startOf('day');
            const s1Date = d1Date
              .date(metadata.statementDay)
              .startOf('day')
              .subtract((metadata as any).dueDay <= metadata.statementDay ? 1 : 0, 'month');
            const balances = await transactionRawRepository.getLatestBalancesRaw(
              [lb.account.id],
              s1Date.valueOf(),
            );
            statementBalances.set(lb.account.id, balances.get(lb.account.id) || 0);
          }
        }),
      );
    }

    const accountMap = new Map(allAccounts.map(a => [a.id, a]));
    const liquidAccountIdsSet = new Set(liquidAssetIds);
    const liabilityAccountIdsSet = new Set(liabilityIds);

    // 2. Engine Execution
    const budgetEngine = new BudgetEngine(time, converter, resultCurrency);
    const budgetResults = await budgetEngine.run(budgets, usages, scopeGroups);

    const plannedEngine = new PlannedFlowEngine(time, converter, resultCurrency);
    const plannedResults = await plannedEngine.run(
      plannedPayments,
      plannedJournals,
      liquidAccountIdsSet,
      liabilityAccountIdsSet,
      accountMap,
      journalTxsMap,
    );

    const liabilityEngine = new LiabilityEngine(time, converter, resultCurrency);
    const liabilityResults = await liabilityEngine.run(
      liabilityAccountBalances,
      plannedResults.coverageMap,
      metadataMap,
      statementBalances,
    );

    // 3. Orchestration & Aggregation
    const allFlows = [...budgetResults.flows, ...plannedResults.flows, ...liabilityResults.flows];

    const allCommitments = [
      ...budgetResults.commitments,
      ...plannedResults.commitments,
      ...liabilityResults.commitments,
    ];

    // O(1) Indexing for simulation loop
    const flowByDayOffset = new Map<number, number>();
    const detailsByDayOffset = new Map<
      number,
      { name: string; amount: number; type: FlowType; context?: string }[]
    >();

    let totalFutureInflow = 0;
    const majorInflowThreshold = AppConfig.defaults.majorInflowThreshold || 1000;
    let firstMajorInflowDay: number | null = null;

    for (const flow of allFlows) {
      const { dayOffset, amount, name, type, context } = flow;

      // Accumulate net flow
      const current = flowByDayOffset.get(dayOffset) || 0;
      flowByDayOffset.set(dayOffset, current + amount);

      if (amount > 0) {
        totalFutureInflow += amount;
        if (amount >= majorInflowThreshold) {
          if (firstMajorInflowDay === null || dayOffset < firstMajorInflowDay) {
            firstMajorInflowDay = dayOffset;
          }
        }
      }

      // Add to details with boundary
      const detailsArray = detailsByDayOffset.get(dayOffset) || [];
      if (detailsArray.length < 20) {
        detailsArray.push({ name, amount: Math.abs(amount), type, context });
        detailsByDayOffset.set(dayOffset, detailsArray);
      }
    }

    // Index planned outflows strictly for O(1) budget reconciliation mapping
    const negativePlannedOutflowsByDayAndAccount = new Map<number, Map<string, number>>();
    for (const outflow of plannedResults.plannedOutflows) {
      if (outflow.amount > 0) {
        throw new Error(
          '[CashFlowSimulationService] Expected planned outflow to exclusively track negative amounts.',
        );
      }
      if (!outflow.accountId) {
        throw new Error(
          `[CashFlowSimulationService] Missing accountId constraint in planned outflow mapping: ${JSON.stringify(outflow)}`,
        );
      }
      const dayMap =
        negativePlannedOutflowsByDayAndAccount.get(outflow.dayOffset) || new Map<string, number>();
      dayMap.set(
        outflow.accountId,
        (dayMap.get(outflow.accountId) || 0) + Math.abs(outflow.amount),
      );
      negativePlannedOutflowsByDayAndAccount.set(outflow.dayOffset, dayMap);
    }

    const projections: SimulationResult['projections']['points'] = [];

    let currentBalance = startingBalance;
    let minBalance = currentBalance;
    let safeDaysCount: number | null = currentBalance < 0 ? 0 : null;

    projections.push({
      timestamp: time.getStartOfToday().valueOf(),
      value: currentBalance,
      isProjected: true,
    });

    for (let d = 0; d < simulationDays; d++) {
      const dailyBurn = budgetResults.dailyBudgetBurns[d] || 0;

      // O(1) Budget vs Planned Reconciliation
      let coveredPlannedOutflow = 0;
      const todayPlans = negativePlannedOutflowsByDayAndAccount.get(d);
      if (todayPlans) {
        for (const [accId, amt] of todayPlans.entries()) {
          if (budgetResults.budgetCoveredExpenseAccountIds.has(accId)) {
            coveredPlannedOutflow += amt;
          }
        }
      }

      coveredPlannedOutflow = Math.min(coveredPlannedOutflow, dailyBurn);
      const adjustedBurn = Math.max(dailyBurn - coveredPlannedOutflow, 0);

      currentBalance -= adjustedBurn;

      const netFlow = flowByDayOffset.get(d) || 0;
      currentBalance += netFlow;

      const dayOffset = d + 1;
      projections.push({
        timestamp: time.getTimestamp(dayOffset),
        value: currentBalance,
        isProjected: true,
        details: detailsByDayOffset.get(d),
        dailyBurn: adjustedBurn,
      });

      if (currentBalance < minBalance) minBalance = currentBalance;
      if (currentBalance < 0 && safeDaysCount === null) safeDaysCount = dayOffset;
    }

    const safeToSpend = Math.max(0, Math.min(startingBalance, minBalance));
    const totalCommittedPlanned = plannedResults.commitments.reduce((acc, c) => acc + c.amount, 0);

    // Collect Subtypes safely
    const committedSubtypes = new Set<string>();
    const debtSubtypes = new Set<string>();
    liabilityAccountBalances.forEach(lb => {
      if (lb.account.accountSubtype) debtSubtypes.add(lb.account.accountSubtype);
    });
    // For commitments, we don't have explicit subtypes in array right now, we can omit it since UI barely uses it,
    // or collect from accountMap
    allCommitments.forEach(c => {
      const acc = accountMap.get(c.accountId);
      if (acc?.accountSubtype) committedSubtypes.add(acc.accountSubtype);
    });

    if (Number.isNaN(safeToSpend) || Number.isNaN(minBalance) || Number.isNaN(totalFutureInflow)) {
      throw new Error(
        '[CashFlowSimulationService] Invariant violation: NaN encountered in simulation math.',
      );
    }
    if (
      !Number.isFinite(safeToSpend) ||
      !Number.isFinite(minBalance) ||
      !Number.isFinite(totalFutureInflow)
    ) {
      throw new Error(
        '[CashFlowSimulationService] Invariant violation: Infinity encountered in simulation math.',
      );
    }

    return {
      summary: {
        safeToSpend,
        shortfall: minBalance < 0 ? Math.abs(minBalance) : 0,
        trajectoryMinBalance: minBalance,
        safeDaysCount,
        totalFutureInflow,
        totalOrganicInflow: plannedResults.organicInflow,
        totalOrganicOutflow: plannedResults.organicOutflow,
        totalCommittedPlanned,
        firstMajorInflowDay,
      },
      breakdowns: {
        committed: allCommitments,
        debt: liabilityResults.debtEntries,
        income: plannedResults.income,
        budget: {
          currentMonthRemaining: budgetResults.currentMonthRemaining,
          nextMonthProjected: budgetResults.nextMonthProjected,
          nextMonthDays: Math.max(0, simulationDays - time.daysLeftInMonth()),
        },
        liabilities: liabilityResults,
      },
      projections: {
        points: projections,
        dailyBudgetBurns: budgetResults.dailyBudgetBurns,
        flowByDayOffset,
        safeToSpendDailyBreakdown: detailsByDayOffset,
      },
      metadata: {
        firstMajorInflowDay,
        committedSubtypes: Array.from(committedSubtypes) as any[],
        debtSubtypes: Array.from(debtSubtypes) as any[],
      },
    };
  }
}

export const cashFlowSimulationService = new CashFlowSimulationService();
