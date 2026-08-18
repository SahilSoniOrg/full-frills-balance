import { AppConfig } from '@/src/constants/app-config';
import Account from '@/src/data/models/Account';
import Budget from '@/src/data/models/Budget';
import BudgetScope from '@/src/data/models/BudgetScope';
import Journal from '@/src/data/models/Journal';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import Transaction from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { BudgetUsage } from '@/src/services/budget/budgetReadService';
import { convertAmount } from '@/src/services/currencyConversion';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { AccountId, AccountType, WorkplaceId } from '@/src/types/domain';
import { isLoanSubtype } from '@/src/utils/accountSubtypeUtils';
import { logger } from '@/src/utils/logger';
import { Trace } from '@/src/utils/TraceService';
import dayjs from 'dayjs';
import { BudgetFlowGenerator } from './engines/BudgetFlowGenerator';
import { LiabilityFlowGenerator } from './engines/LiabilityFlowGenerator';
import { PlannedFlowGenerator } from './engines/PlannedFlowGenerator';
import { keepProjectablePlannedJournals } from './keepProjectablePlannedJournals';
import { FlowResolver } from './FlowResolver';
import { SimulationReportGenerator } from './SimulationReportGenerator';
import { Simulator } from './Simulator';
import { TimeContext } from './TimeContext';
import { toLiabilityMetadata } from './liabilityMetadata';
import { LiabilityMetadata, SimulationContext, SimulationRunResult } from './types';
import { getCorrespondingStatementDate, getNextDueDate } from './utils/liabilityUtils';

export type SimulationInput = {
  startingBalances: Map<AccountId, number>;
  plannedPayments: PlannedPayment[];
  plannedJournals: Journal[];
  liquidAssetIds: AccountId[];
  liabilityAccountBalances: { account: Account; balance: number }[];
  budgets: Budget[];
  usages: BudgetUsage[];
  allAccounts: Account[];
  resultCurrency: string;
  workplaceId: WorkplaceId;
  simulationDays?: number;
  trace?: Trace;
};

export class CashFlowSimulationService {
  /**
   * Cash flow simulation following the "Generate truth -> simulate once" architecture.
   */
  async simulate(input: SimulationInput): Promise<SimulationRunResult> {
    const {
      startingBalances,
      plannedPayments,
      plannedJournals,
      liquidAssetIds,
      liabilityAccountBalances,
      budgets,
      usages,
      allAccounts,
      resultCurrency,
      workplaceId,
      simulationDays = AppConfig.defaults.safeToSpendDays,
      trace,
    } = input;

    const time = new TimeContext(dayjs(), simulationDays);
    const simulationStartMs = time.getStartOfToday().valueOf();
    const simulationEndMs = time.getEndMs();

    const overallStart = Date.now();

    // 1. PHASE: NORMALIZE & PRE-FETCH
    const liquidAccountIdsSet = new Set(liquidAssetIds);
    const liabilityAccountIdsSet = new Set(liabilityAccountBalances.map(lb => lb.account.id));
    const accountMap = new Map(allAccounts.map(a => [a.id, a]));
    const projectablePlannedJournals = keepProjectablePlannedJournals(
      plannedJournals,
      plannedPayments,
    );

    // Execute independent fetches in parallel
    const [journalTxsMap, metadataMap] = await Promise.all([
      this.fetchJournalTransactions(projectablePlannedJournals, workplaceId),
      this.fetchMetadata(liabilityAccountBalances, workplaceId),
    ]);

    // P1 Perf: Pre-warm rates per unique base currency, then read sync
    // Replaces N separate convert(1, from, to) calls that each hit DB
    const baseCurrencies = new Set<string>();
    baseCurrencies.add(resultCurrency);
    allAccounts.forEach(a => {
      if (a.currencyCode) baseCurrencies.add(a.currencyCode);
    });
    budgets.forEach(b => {
      if (b.currencyCode) baseCurrencies.add(b.currencyCode);
    });
    plannedPayments.forEach(pp => {
      if (pp.currencyCode) baseCurrencies.add(pp.currencyCode);
    });
    journalTxsMap.forEach(txs => {
      txs.forEach(tx => {
        if (tx.currencyCode) baseCurrencies.add(tx.currencyCode);
      });
    });

    await Promise.all(
      Array.from(baseCurrencies).map(base =>
        exchangeRateService.fetchRatesForBase(base).catch(() => ({})),
      ),
    );

    const rateMap = new Map<string, number>();
    rateMap.set(resultCurrency, 1);
    await Promise.all(
      Array.from(baseCurrencies).map(async from => {
        if (from === resultCurrency) {
          rateMap.set(from, 1);
          return;
        }
        const converted = await convertAmount({
          amount: 1,
          fromCurrency: from,
          toCurrency: resultCurrency,
          mode: 'spot',
        });
        if (converted.ok) {
          rateMap.set(from, converted.amount);
        } else {
          logger.warn(
            `[CashFlowSimulationService] FX unavailable for ${from} -> ${resultCurrency}`,
          );
        }
      }),
    );

    const convert = (amount: number, from: string) => {
      const fromCurrency = from || resultCurrency;
      if (fromCurrency === resultCurrency) return amount;
      const rate = rateMap.get(fromCurrency);
      if (rate === undefined) {
        logger.warn(
          `[CashFlowSimulationService] Skipping amount in ${fromCurrency} (no FX rate to ${resultCurrency})`,
        );
        return 0;
      }
      return amount * rate;
    };

    // Normalize and Fetch remaining dependent data in parallel
    const [{ statementBalances, settledSinceStatement }, budgetCategoryMap] = await Promise.all([
      this.fetchStatementValues(
        liabilityAccountBalances,
        metadataMap,
        time,
        resultCurrency,
        rateMap, // Pass rateMap to avoid extra fetches
        workplaceId,
      ),
      this.fetchBudgetCategoryMap(budgets, allAccounts, workplaceId),
    ]);

    // Currency Normalization using explicit mapping (avoiding class spread).
    // Preserve period fields so BudgetFlowGenerator can burn DAILY/WEEKLY/etc.
    // correctly — dropping them silently defaults every budget to MONTHLY.
    const normalizedBudgets = budgets.map(
      b =>
        ({
          id: b.id,
          name: b.name,
          amount: convert(b.amount, b.currencyCode || resultCurrency),
          currencyCode: resultCurrency,
          assetAccountIds: b.assetAccountIds,
          intervalType: b.intervalType,
          intervalN: b.intervalN,
          startDate: b.startDate,
          recurrenceDay: b.recurrenceDay,
          recurrenceMonth: b.recurrenceMonth,
          createdAt: b.createdAt,
        }) as Budget,
    );

    const normalizedUsages = usages.map((u, i) => ({
      ...u,
      remaining: convert(u.remaining, budgets[i].currencyCode || resultCurrency),
    }));

    const normalizedPlannedPayments = plannedPayments.map(pp => ({
      id: pp.id,
      name: pp.name,
      amount: convert(pp.amount, pp.currencyCode || resultCurrency),
      currencyCode: resultCurrency,
      fromAccountId: pp.fromAccountId,
      toAccountId: pp.toAccountId,
      nextOccurrence: pp.nextOccurrence,
      intervalType: pp.intervalType,
      intervalN: pp.intervalN,
      recurrenceDay: pp.recurrenceDay,
      endDate: pp.endDate,
    }));

    const normalizedLiabilityBalances = liabilityAccountBalances.map(lb => ({
      account: lb.account,
      balance: convert(lb.balance, lb.account.currencyCode || resultCurrency),
    }));

    const expenseAccountIds = new Set(
      allAccounts.filter(a => a.accountType === AccountType.EXPENSE).map(a => a.id),
    );

    trace?.metric('normalization_and_fetch');
    logger.info(
      `[Trace] CashFlowSimulationService.simulate: Normalization & Pre-fetch: ${Date.now() - overallStart}ms`,
    );

    // 2. PHASE: BUILD CONTEXT
    const context: SimulationContext = {
      simulationStartMs,
      simulationDays,
      simulationEndMs,
      resultCurrency,
      liquidAccountIds: liquidAccountIdsSet,
      orderedLiquidAccountIds: liquidAssetIds,
      liabilityAccountIds: liabilityAccountIdsSet,
      accountMap,
      convert,
    };

    // 3. PHASE: GENERATE FLOWS
    const { flows: plannedFlows } = PlannedFlowGenerator.generate(
      context,
      normalizedPlannedPayments,
      projectablePlannedJournals,
      expenseAccountIds,
      journalTxsMap,
    );
    trace?.metric('flow_gen_planned');

    const budgetEntries = normalizedBudgets.map((budget, index) => ({
      budget,
      usage: normalizedUsages[index] || { remaining: 0 },
      categories: budgetCategoryMap.get(budget.id),
    }));

    const budgetEntriesWithCategories = budgetEntries.filter(
      entry => entry.categories && entry.categories.size > 0,
    );

    const filteredBudgets = budgetEntriesWithCategories.map(entry => entry.budget);
    const filteredUsages = budgetEntriesWithCategories.map(entry => entry.usage);

    const budgetFlows = BudgetFlowGenerator.generate(
      context,
      filteredBudgets,
      filteredUsages,
      budgetCategoryMap,
      plannedFlows,
    );
    trace?.metric('flow_gen_budget');

    const resolvedSpendingFlows = FlowResolver.resolveConflicts(
      [...budgetFlows, ...plannedFlows],
      budgetCategoryMap,
    );

    const liabilityFlows = LiabilityFlowGenerator.generate(
      context,
      resolvedSpendingFlows,
      normalizedLiabilityBalances,
      metadataMap,
      statementBalances,
      settledSinceStatement,
    );
    trace?.metric('flow_gen_liability');

    // SORTING SAFETY: Ensure all flows are globally sorted by dayOffset
    const allFlows = [...resolvedSpendingFlows, ...liabilityFlows].sort(
      (a, b) => a.dayOffset - b.dayOffset,
    );

    trace?.metric('flow_generation');
    logger.info(
      `[Trace] CashFlowSimulationService.simulate: Flow Generation: ${Date.now() - overallStart}ms`,
      {
        totalFlows: allFlows.length,
      },
    );

    // 3. PHASE: SIMULATE
    const startingBalancesEntries = Array.from(startingBalances.entries());
    const normalizedStartingBalances = new Map(
      startingBalancesEntries.map(([id, bal]) => {
        const acc = accountMap.get(id);
        return [id, convert(bal, acc?.currencyCode || resultCurrency)];
      }),
    );
    const simulationResult = Simulator.simulate(
      normalizedStartingBalances,
      allFlows,
      simulationDays,
      liquidAccountIdsSet,
      liquidAssetIds,
      0,
      simulationStartMs,
      trace,
    );
    trace?.metric('simulation_execution');

    // 4. PHASE: POST-PROCESS SUMMARIES
    const report = SimulationReportGenerator.generate(
      allFlows,
      accountMap,
      liabilityAccountBalances,
      context.liquidAccountIds,
    );
    trace?.metric('post_process_report');

    const accountSummaries = SimulationReportGenerator.generateAccountSummaries({
      allFlows,
      liquidAccountIdsSet,
      accountMap,
      normalizedStartingBalances,
      accountMinBalancesBeforeIncome: simulationResult.summary.accountMinBalancesBeforeIncome,
      accountMinBalances: simulationResult.summary.accountMinBalances,
      firstMajorInflowDay: simulationResult.summary.firstMajorInflowDay,
    });
    trace?.metric('post_process_summaries');

    const result: SimulationRunResult = {
      simulationResult,
      report,
      accountSummaries,
      allFlows,
      startingBalances: normalizedStartingBalances,
      liquidAccountIdsSet,
      liabilityAccountBalances,
      accountMap,
    };

    trace?.metric('total_duration');
    logger.info(
      `[Trace] CashFlowSimulationService.simulate: TOTAL: ${Date.now() - overallStart}ms`,
      {
        days: simulationDays,
        accounts: allAccounts.length,
        flows: allFlows.length,
      },
    );

    return result;
  }

  // --- Normalization Helpers ---

  private async fetchMetadata(lbs: { account: Account }[], workplaceId: WorkplaceId) {
    const map = new Map<string, LiabilityMetadata>();
    if (lbs.length === 0) return map;

    const ids = lbs.map(lb => lb.account.id);
    const metadataRecords = await accountRepository.findMetadataByAccountIds(workplaceId, ids);

    metadataRecords.forEach(meta => {
      map.set(meta.accountId, toLiabilityMetadata(meta));
    });

    return map;
  }

  private async fetchStatementValues(
    lbs: { account: Account }[],
    metadataMap: Map<string, LiabilityMetadata>,
    time: TimeContext,
    toCurrency: string,
    rateMap: Map<string, number>,
    workplaceId: WorkplaceId,
  ) {
    const balances = new Map<string, number>();
    const settledAmounts = new Map<string, number>();

    const convert = (amount: number, from: string) => {
      const fromCurrency = from || toCurrency;
      if (fromCurrency === toCurrency) {
        return Math.round((amount + Number.EPSILON) * 100) / 100;
      }
      const rate = rateMap.get(fromCurrency);
      if (rate === undefined) {
        logger.warn(
          `[CashFlowSimulationService] Skipping statement value in ${fromCurrency} (no FX rate to ${toCurrency})`,
        );
        return 0;
      }
      const val = amount * rate;
      return Math.round((val + Number.EPSILON) * 100) / 100;
    };

    await Promise.all(
      lbs.map(async lb => {
        const metadata = metadataMap.get(lb.account.id);
        const now = time.getStartOfToday();

        if (lb.account.accountSubtype === 'CREDIT_CARD' && metadata?.statementDay) {
          const dueDay = metadata.dueDay || AppConfig.insights.liabilityDefaultDueDay;
          const d1Date = getNextDueDate(now, dueDay);
          const s1Date = getCorrespondingStatementDate(d1Date, metadata.statementDay, dueDay);

          const [latestBalances, metrics] = await Promise.all([
            transactionRawRepository.getLatestBalancesRaw(
              workplaceId,
              [lb.account.id],
              s1Date.valueOf(),
            ),
            transactionRawRepository.getAccountPeriodMetricsRaw(
              workplaceId,
              lb.account.id,
              s1Date.valueOf(),
              now.endOf('day').valueOf(),
              lb.account.accountType,
            ),
          ]);

          const rawBal = Math.abs(latestBalances.get(lb.account.id) || 0);
          const statementBal = convert(rawBal, lb.account.currencyCode || toCurrency);
          balances.set(lb.account.id, statementBal);

          const rawSettled = metrics.totalDecrease;
          const settled = convert(rawSettled, lb.account.currencyCode || toCurrency);
          settledAmounts.set(lb.account.id, settled);
        } else if (isLoanSubtype(lb.account.accountSubtype)) {
          // For loans, calculate settlement since the previous due date
          const deductionDay =
            metadata?.dueDay ||
            metadata?.emiDay ||
            AppConfig.insights.liabilityFallbackDeductionDay;
          const nextDue = getNextDueDate(now, deductionDay);
          const prevDue = nextDue.subtract(1, 'month');

          // We check for any payments (totalDecrease) between prevDue and now
          const metrics = await transactionRawRepository.getAccountPeriodMetricsRaw(
            workplaceId,
            lb.account.id,
            prevDue.valueOf(),
            now.endOf('day').valueOf(),
            lb.account.accountType,
          );

          const rawSettled = metrics.totalDecrease;
          const settled = convert(rawSettled, lb.account.currencyCode || toCurrency);
          settledAmounts.set(lb.account.id, settled);
        }
      }),
    );
    return { statementBalances: balances, settledSinceStatement: settledAmounts };
  }

  private async fetchJournalTransactions(journals: Journal[], workplaceId: WorkplaceId) {
    const ids = journals.map(j => j.id);
    const txs = ids.length > 0 ? await transactionRepository.findByJournals(workplaceId, ids) : [];
    const map = new Map<string, Transaction[]>();
    for (const tx of txs) {
      const list = map.get(tx.journalId) || [];
      list.push(tx);
      map.set(tx.journalId, list);
    }
    return map;
  }

  private async fetchBudgetCategoryMap(
    budgets: Budget[],
    allAccounts: Account[],
    workplaceId: WorkplaceId,
  ) {
    const map = new Map<string, Set<string>>();
    if (budgets.length === 0) return map;

    const expenses = allAccounts.filter(a => a.accountType === AccountType.EXPENSE);

    // Build child map once for ALL accounts
    const childrenMap = new Map<string, string[]>();
    expenses.forEach(acc => {
      if (acc.parentAccountId) {
        const siblings = childrenMap.get(acc.parentAccountId) || [];
        siblings.push(acc.id);
        childrenMap.set(acc.parentAccountId, siblings);
      }
    });

    // Cache to avoid re-traversing subtrees
    const descendantCache = new Map<string, Set<string>>();

    const getDescendants = (id: string): Set<string> => {
      if (descendantCache.has(id)) return descendantCache.get(id)!;

      const result = new Set<string>();
      const children = childrenMap.get(id) || [];
      for (const childId of children) {
        result.add(childId);
        const childDescendants = getDescendants(childId);
        childDescendants.forEach(d => result.add(d));
      }

      descendantCache.set(id, result);
      return result;
    };

    // Batch fetch all scopes
    const allScopes = await budgetRepository.getScopesByBudgetIds(
      workplaceId,
      budgets.map(b => b.id),
    );
    const scopesByBudget = new Map<string, BudgetScope[]>();
    allScopes.forEach(s => {
      const list = scopesByBudget.get(s.budgetId) || [];
      list.push(s);
      scopesByBudget.set(s.budgetId, list);
    });

    budgets.forEach(budget => {
      const scopes = scopesByBudget.get(budget.id) || [];
      const leafIds = new Set<string>();
      for (const scope of scopes) {
        leafIds.add(scope.accountId);
        getDescendants(scope.accountId).forEach(id => leafIds.add(id));
      }
      map.set(budget.id, leafIds);
    });

    return map;
  }
}

export const cashFlowSimulationService = new CashFlowSimulationService();
