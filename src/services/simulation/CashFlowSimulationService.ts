import { AppConfig } from '@/src/constants/app-config';
import Account from '@/src/data/models/Account';
import Budget from '@/src/data/models/Budget';
import Journal from '@/src/data/models/Journal';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { BudgetUsage } from '@/src/services/budget/budgetReadService';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import dayjs from 'dayjs';
import { BudgetEngine, CurrencyConverter } from './engines/BudgetEngine';
import { LiabilityEngine } from './engines/LiabilityEngine';
import { PlannedFlowEngine } from './engines/PlannedFlowEngine';
import { TimeContext } from './TimeContext';
import { FlowType, ISimulationService, SimulationResult } from './types';
import { getCorrespondingStatementDate, getNextDueDate } from './utils/liabilityUtils';

export class CashFlowSimulationService implements ISimulationService {
  /**
   * Configured-day cash flow simulation for Safe to Spend (V1).
   */
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
    const simulationDays = AppConfig.defaults.safeToSpendDays;
    const time = new TimeContext(dayjs(), simulationDays);

    // 0. Data Preparation (Implementation specifics for V1)
    const scopeGroups = await Promise.all(budgets.map(b => budgetRepository.getScopes(b.id)));

    const settledAmountsSinceStatement = new Map<string, number>();
    const ccAccounts = liabilityAccountBalances.filter(
      lb => lb.account.accountSubtype === 'CREDIT_CARD',
    );

    await Promise.all(
      ccAccounts.map(async lb => {
        const metadataRecords = await lb.account.metadataRecords.fetch();
        const metadata = metadataRecords[0];
        if (metadata?.statementDay) {
          const dueDay = (metadata as any).dueDay || AppConfig.insights.liabilityDefaultDueDay;
          const now = time.getStartOfToday();
          const d1Date = getNextDueDate(now, dueDay);
          const s1Date = getCorrespondingStatementDate(d1Date, metadata.statementDay, dueDay);

          const metrics = await transactionRawRepository.getAccountPeriodMetricsRaw(
            lb.account.id,
            s1Date.valueOf(),
            now.endOf('day').valueOf(),
            false,
          );

          let settled = metrics.totalDecrease;
          if (lb.account.currencyCode && lb.account.currencyCode !== resultCurrency) {
            const { convertedAmount } = await exchangeRateService.convert(
              settled,
              lb.account.currencyCode,
              resultCurrency,
            );
            settled = convertedAmount;
          }
          settledAmountsSinceStatement.set(lb.account.id, settled);
        }
      }),
    );

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
    const ccAccountsInner = liabilityAccountBalances.filter(
      lb => lb.account.accountSubtype === 'CREDIT_CARD',
    );
    if (ccAccountsInner.length > 0) {
      await Promise.all(
        ccAccountsInner.map(async lb => {
          const metadata = metadataMap.get(lb.account.id);
          if (metadata?.statementDay) {
            const dueDay = (metadata as any).dueDay || AppConfig.insights.liabilityDefaultDueDay;
            const now = time.getStartOfToday();
            const d1Date = getNextDueDate(now, dueDay);
            const s1Date = getCorrespondingStatementDate(d1Date, metadata.statementDay, dueDay);
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
    const budgetResults = await budgetEngine.run(budgets, usages, scopeGroups, liquidAssetIds);

    const liabilityInitialBalancesMap = new Map(
      liabilityAccountBalances.map(lb => [lb.account.id, lb.balance]),
    );

    const plannedEngine = new PlannedFlowEngine(time, converter, resultCurrency);
    const plannedResults = await plannedEngine.run(
      plannedPayments,
      plannedJournals,
      liquidAccountIdsSet,
      liabilityAccountIdsSet,
      accountMap,
      journalTxsMap,
      liabilityInitialBalancesMap,
    );

    const liabilityEngine = new LiabilityEngine(time, converter, resultCurrency);
    const liabilityResults = await liabilityEngine.run(
      liabilityAccountBalances,
      plannedResults.coverageMap,
      metadataMap,
      statementBalances,
      liquidAccountIdsSet,
      liquidAssetIds, // Passing ordered liquid asset IDs for fallback flow attribution
      plannedResults.flows,
      settledAmountsSinceStatement,
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
    const flowByDayAndAccount = new Map<number, Map<string, number>>();
    const detailsByDayOffset = new Map<
      number,
      { name: string; amount: number; type: FlowType; context?: string }[]
    >();

    let totalFutureInflow = 0;
    const majorInflowThreshold = AppConfig.defaults.majorInflowThreshold || 1000;
    let firstMajorInflowDay: number | null = null;

    for (const flow of allFlows) {
      const { dayOffset, amount, name, type, context, accountId, source } = flow as any;

      // EXCEPTION: Budget burns are handled via budgetResults.dailyBudgetBurns in the simulation loop.
      // We only use these flows for the UI detail breakdown.
      const isSimulationFlow = source !== 'BUDGET';

      if (isSimulationFlow) {
        // Accumulate net flow (Global)
        // IMPORTANT: Global balance only reflects flows into/out of LIQUID asset accounts.
        // Internal transfers between liquid accounts net to 0.
        // Transfers to liabilities correctly show up as deductions from the liquid side.
        const isLiquidAccount = accountId && liquidAccountIdsSet.has(accountId);
        const isLiabilityInflow = accountId && liabilityAccountIdsSet.has(accountId) && amount > 0;
        const isInternalTransferToLiability =
          isLiabilityInflow &&
          flow.sourceAccountId &&
          liquidAccountIdsSet.has(flow.sourceAccountId);

        if (isLiquidAccount || (isLiabilityInflow && !isInternalTransferToLiability)) {
          const current = flowByDayOffset.get(dayOffset) || 0;
          flowByDayOffset.set(dayOffset, current + amount);
        }

        if (accountId) {
          const dayAccountMap = flowByDayAndAccount.get(dayOffset) || new Map<string, number>();
          dayAccountMap.set(accountId, (dayAccountMap.get(accountId) || 0) + amount);
          flowByDayAndAccount.set(dayOffset, dayAccountMap);
        }

        // Add to details with boundary
        const detailsArray = detailsByDayOffset.get(dayOffset) || [];
        if (detailsArray.length < 20) {
          detailsArray.push({ name, amount: Math.abs(amount), type, context });
          detailsByDayOffset.set(dayOffset, detailsArray);
        }
      }

      if (amount > 0) {
        if (isSimulationFlow) totalFutureInflow += amount;
        if (amount >= majorInflowThreshold) {
          if (firstMajorInflowDay === null || dayOffset < firstMajorInflowDay) {
            firstMajorInflowDay = dayOffset;
          }
        }
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

    // Track state for global and per-account
    const totalStartingBalance = Array.from(startingBalances.values()).reduce((a, b) => a + b, 0);
    let globalBalance = totalStartingBalance;
    let globalMinBalance = globalBalance;
    let safeDaysCount: number | null = globalBalance < 0 ? 0 : null;

    const accountCurrentBalances = new Map<string, number>(startingBalances);
    const accountMinBalances = new Map<string, number>(startingBalances);
    const accountMinBalancesBeforeIncome = new Map<string, number>(startingBalances);

    projections.push({
      timestamp: time.getStartOfToday().valueOf(),
      value: globalBalance,
      isProjected: true,
    });

    for (let d = 0; d < simulationDays; d++) {
      const globalDailyBurn = budgetResults.dailyBudgetBurns[d] || 0;

      // O(1) Budget vs Planned Reconciliation
      let globalCoveredPlannedOutflow = 0;
      const todayPlans = negativePlannedOutflowsByDayAndAccount.get(d);
      if (todayPlans) {
        for (const [accId, amt] of todayPlans.entries()) {
          // If this planned outflow is for an expense account covered by a budget...
          if (budgetResults.budgetCoveredExpenseAccountIds.has(accId)) {
            globalCoveredPlannedOutflow += amt;
          }
        }
      }

      globalCoveredPlannedOutflow = Math.min(globalCoveredPlannedOutflow, globalDailyBurn);
      const globalAdjustedBurn = Math.max(globalDailyBurn - globalCoveredPlannedOutflow, 0);

      // Apply to Global
      globalBalance -= globalAdjustedBurn;
      const globalNetFlow = flowByDayOffset.get(d) || 0;
      globalBalance += globalNetFlow;
      if (globalBalance < globalMinBalance) globalMinBalance = globalBalance;

      // Apply per-account
      for (const accountId of liquidAssetIds) {
        let accBalance = accountCurrentBalances.get(accountId) || 0;

        // Budget burn for this account
        const accDailyBurn = budgetResults.dailyAssetAccountBurns.get(accountId)?.[d] || 0;

        // Reconciliation for this account:
        // If we have a planned outflow from this EXACT asset account for a covered expense...
        // This is a bit tricky because plannedOutflows tracks the EXPENSE account ID in accId.
        // We need to know which ASSET account it came from.
        // PlannedFlowEngine results include 'flows' which have accountId (Asset Account) and amount (negative).
        // Let's find flows for this day and account.
        const dayAccFlowsMap = flowByDayAndAccount.get(d);
        const accNetFlow = dayAccFlowsMap?.get(accountId) || 0;

        // Simplified reconciliation: reduce this account's budget burn by its share of global reconciliation
        // Or better: use the same proportion.
        let accAdjustedBurn = accDailyBurn;
        if (globalDailyBurn > 0) {
          const reconciliationFactor = globalAdjustedBurn / globalDailyBurn;
          accAdjustedBurn = accDailyBurn * reconciliationFactor;
        }

        accBalance -= accAdjustedBurn;
        accBalance += accNetFlow;

        accountCurrentBalances.set(accountId, accBalance);

        // Track absolute min
        const currentMin = accountMinBalances.get(accountId) ?? accBalance;
        if (accBalance < currentMin) {
          accountMinBalances.set(accountId, accBalance);
        }

        // Track min before any major income
        if (firstMajorInflowDay === null || d < firstMajorInflowDay) {
          const currentMinBefore = accountMinBalancesBeforeIncome.get(accountId) ?? accBalance;
          if (accBalance < currentMinBefore) {
            accountMinBalancesBeforeIncome.set(accountId, accBalance);
          }
        }
      }

      const dayOffset = d + 1;
      projections.push({
        timestamp: time.getTimestamp(dayOffset),
        value: globalBalance,
        isProjected: true,
        details: detailsByDayOffset.get(d),
        dailyBurn: globalAdjustedBurn,
      });

      if (globalBalance < 0 && safeDaysCount === null) safeDaysCount = dayOffset;
    }

    const safeToSpend = Math.max(0, Math.min(totalStartingBalance, globalMinBalance));
    const totalCommittedPlanned = plannedResults.commitments.reduce((acc, c) => acc + c.amount, 0);

    // Build Account Summaries
    const accountSummaries = liquidAssetIds.map(accountId => {
      const start = startingBalances.get(accountId) || 0;
      const min = accountMinBalances.get(accountId) || 0;
      const minBeforeIncome = accountMinBalancesBeforeIncome.get(accountId) || 0;
      const acc = accountMap.get(accountId);

      // Collect usage details
      const accountFlows = allFlows.filter(f => f.accountId === accountId);
      const inflowItemsMap = new Map<
        string,
        { id?: string; amount: number; source: string; minDay: number }
      >();
      const outflowItemsMap = new Map<
        string,
        { id?: string; amount: number; source: string; minDay: number }
      >();
      let totalInflow = 0;
      let totalOutflow = 0;

      for (const f of accountFlows) {
        if (f.amount > 0) {
          totalInflow += f.amount;
          const existing = inflowItemsMap.get(f.name);
          inflowItemsMap.set(f.name, {
            amount: (existing?.amount || 0) + f.amount,
            id: existing?.id || f.id,
            source: (f as any).source || 'OTHER',
            minDay: Math.min(existing?.minDay ?? f.dayOffset, f.dayOffset),
          });
        } else if (f.amount < 0) {
          const absAmount = Math.abs(f.amount);
          totalOutflow += absAmount;
          const existing = outflowItemsMap.get(f.name);
          outflowItemsMap.set(f.name, {
            amount: (existing?.amount || 0) + absAmount,
            id: existing?.id || f.id,
            source: (f as any).source || 'OTHER',
            minDay: Math.min(existing?.minDay ?? f.dayOffset, f.dayOffset),
          });
        }
      }

      // Add budget burns to outflows
      // BudgetEngine now returns budget burns as flows, so they are already in accountFlows.
      // No manual aggregation needed.

      const topInflows = Array.from(inflowItemsMap.entries())
        .map(([name, data]) => ({
          id: data.id,
          name,
          amount: data.amount,
          source: data.source,
          isPostIncome: firstMajorInflowDay !== null && data.minDay >= firstMajorInflowDay,
        }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 3);

      const topOutflows = Array.from(outflowItemsMap.entries())
        .map(([name, data]) => ({
          id: data.id,
          name,
          amount: data.amount,
          source: data.source,
          isPostIncome: firstMajorInflowDay !== null && data.minDay >= firstMajorInflowDay,
        }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 3);

      return {
        accountId,
        accountName: acc?.name || 'Unknown',
        startingBalance: start,
        // Per users request, account-level shortfall/safe-to-spend should ignore dips after income
        safeToSpend: Math.max(0, Math.min(start, minBeforeIncome)),
        shortfall: minBeforeIncome < 0 ? Math.abs(minBeforeIncome) : 0,
        minBalance: min, // Still return absolute floor for "Floor" label
        usageDetails: {
          totalInflow,
          totalOutflow,
          topInflows,
          topOutflows,
        },
      };
    });

    // Collect Subtypes safely
    const committedSubtypes = new Set<string>();
    const debtSubtypes = new Set<string>();
    liabilityAccountBalances.forEach(lb => {
      if (lb.account.accountSubtype) debtSubtypes.add(lb.account.accountSubtype);
    });

    allCommitments.forEach(c => {
      const acc = accountMap.get(c.accountId);
      if (acc?.accountSubtype) committedSubtypes.add(acc.accountSubtype);
    });

    return {
      summary: {
        safeToSpend,
        shortfall: globalMinBalance < 0 ? Math.abs(globalMinBalance) : 0,
        trajectoryMinBalance: globalMinBalance,
        safeDaysCount,
        totalFutureInflow,
        totalOrganicInflow: plannedResults.organicInflow,
        totalOrganicOutflow: plannedResults.organicOutflow,
        totalCommittedPlanned,
        firstMajorInflowDay,
      },
      accountSummaries,
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
