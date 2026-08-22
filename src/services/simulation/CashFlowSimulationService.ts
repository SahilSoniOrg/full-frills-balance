import { AppConfig } from '@/src/constants/app-config';
import Account from '@/src/data/models/Account';
import Budget from '@/src/data/models/Budget';
import Journal from '@/src/data/models/Journal';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import { BudgetUsage } from '@/src/services/budget/types';
import { convertAmount } from '@/src/services/currencyConversion';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { AccountId, AccountType, WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { Trace } from '@/src/utils/TraceService';
import dayjs from 'dayjs';
import { budgetProjectionProvider } from '@/src/services/budget/budgetProjectionProvider';
import { plannedPaymentProjectionProvider } from '@/src/services/planned-payment/plannedPaymentProjectionProvider';
import { keepProjectablePlannedJournals } from '@/src/services/planned-payment/projectablePlannedJournals';
import { ProjectionComposer } from './ProjectionComposer';
import { SimulationReportGenerator } from './SimulationReportGenerator';
import { Simulator } from './Simulator';
import { TimeContext } from './TimeContext';
import { SimulationContext, SimulationRunResult } from './types';
import {
  fetchBudgetCategoryMap,
  fetchJournalTransactions,
  fetchMetadata,
  fetchStatementValues,
} from './simulationDataPrefetcher';

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
      fetchJournalTransactions(projectablePlannedJournals, workplaceId),
      fetchMetadata(liabilityAccountBalances, workplaceId),
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
      fetchStatementValues(
        liabilityAccountBalances,
        metadataMap,
        time,
        resultCurrency,
        rateMap, // Pass rateMap to avoid extra fetches
        workplaceId,
      ),
      fetchBudgetCategoryMap(budgets, allAccounts, workplaceId),
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

    // 3. PHASE: GENERATE RAW DOMAIN FLOWS
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

    const [plannedFlows, budgetFlows] = await Promise.all([
      plannedPaymentProjectionProvider.generate(context, {
        plannedPayments: normalizedPlannedPayments,
        projectablePlannedJournals,
        expenseAccountIds,
        journalTransactionsMap: journalTxsMap,
      }),
      budgetProjectionProvider.generate(context, {
        budgets: filteredBudgets,
        usages: filteredUsages,
        budgetCategoryMap,
      }),
    ]);
    trace?.metric('flow_gen_domain');

    // 4. PHASE: COMPOSE VIA PROJECTION COMPOSER
    const allFlows = ProjectionComposer.compose({
      plannedFlows,
      budgetFlows,
      budgetCategoryMap,
      liabilityInput: {
        liabilityBalances: normalizedLiabilityBalances,
        metadataMap,
        statementBalances,
        settledSinceStatement,
      },
      context,
    });

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
}

export const cashFlowSimulationService = new CashFlowSimulationService();
