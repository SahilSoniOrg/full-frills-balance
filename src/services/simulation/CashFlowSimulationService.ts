import { AppConfig } from '@/src/constants/app-config';
import Account, { AccountType } from '@/src/data/models/Account';
import AccountMetadata from '@/src/data/models/AccountMetadata';
import Budget from '@/src/data/models/Budget';
import BudgetScope from '@/src/data/models/BudgetScope';
import Journal from '@/src/data/models/Journal';
import PlannedPayment from '@/src/data/models/PlannedPayment';

import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import Transaction from '@/src/data/models/Transaction';
import { BudgetUsage } from '@/src/services/budget/budgetReadService';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import dayjs from 'dayjs';
import { BudgetFlowGenerator } from './engines/BudgetFlowGenerator';
import { LiabilityFlowGenerator } from './engines/LiabilityFlowGenerator';
import { PlannedFlowGenerator } from './engines/PlannedFlowGenerator';
import { FlowResolver } from './FlowResolver';
import { SimulationReportGenerator } from './SimulationReportGenerator';
import { Simulator } from './Simulator';
import { TimeContext } from './TimeContext';
import { AccountSimulationSummary, Flow, SimulationContext, SimulationRunResult } from './types';
import { getCorrespondingStatementDate, getNextDueDate } from './utils/liabilityUtils';

export class CashFlowSimulationService {
  /**
   * Cash flow simulation following the "Generate truth -> simulate once" architecture.
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
    simulationDays: number = AppConfig.defaults.safeToSpendDays,
  ): Promise<SimulationRunResult> {
    const time = new TimeContext(dayjs(), simulationDays);
    const simulationStartMs = time.getStartOfToday().valueOf();
    const simulationEndMs = time.getEndMs();

    // 1. PHASE: NORMALIZE & PRE-FETCH
    const liquidAccountIdsSet = new Set(liquidAssetIds);
    const liabilityAccountIdsSet = new Set(liabilityAccountBalances.map(lb => lb.account.id));
    const accountMap = new Map(allAccounts.map(a => [a.id, a]));

    // Execute independent fetches in parallel
    const [journalTxsMap, metadataMap] = await Promise.all([
      this.fetchJournalTransactions(plannedJournals),
      this.fetchMetadata(liabilityAccountBalances),
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
    for (const from of baseCurrencies) {
      rateMap.set(from, exchangeRateService.getRateSafe(from, resultCurrency));
    }

    const convert = (amount: number, from: string) => amount * (rateMap.get(from) || 1);

    // Normalize and Fetch remaining dependent data in parallel
    const [{ statementBalances, settledSinceStatement }, budgetCategoryMap] = await Promise.all([
      this.fetchStatementValues(
        liabilityAccountBalances,
        metadataMap,
        time,
        resultCurrency,
        rateMap, // Pass rateMap to avoid extra fetches
      ),
      this.fetchBudgetCategoryMap(budgets, allAccounts),
    ]);

    // Currency Normalization using explicit mapping (avoiding class spread)
    const normalizedBudgets = budgets.map(
      b =>
        ({
          id: b.id,
          name: b.name,
          amount: convert(b.amount, b.currencyCode || resultCurrency),
          currencyCode: resultCurrency,
          assetAccountIds: b.assetAccountIds,
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
      plannedJournals,
      expenseAccountIds,
      journalTxsMap,
    );

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
      time.daysLeftInMonth(),
      time.nextMonthDays(),
      budgetCategoryMap,
      plannedFlows,
    );

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

    // SORTING SAFETY: Ensure all flows are globally sorted by dayOffset
    const allFlows = [...resolvedSpendingFlows, ...liabilityFlows].sort(
      (a, b) => a.dayOffset - b.dayOffset,
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
    );

    // 4. PHASE: POST-PROCESS SUMMARIES
    const firstMajorInflowDay = simulationResult.summary.firstMajorInflowDay;
    const report = SimulationReportGenerator.generate(
      allFlows,
      accountMap,
      liabilityAccountBalances,
      context.liquidAccountIds,
    );

    // Pre-group all flows by account for O(1) inside account loop
    const flowsByAccount = new Map<string, Flow[]>();
    allFlows.forEach(f => {
      if (f.kind === 'TRANSFER') {
        const fromList = flowsByAccount.get(f.fromAccountId) || [];
        fromList.push(f);
        flowsByAccount.set(f.fromAccountId, fromList);

        const toList = flowsByAccount.get(f.toAccountId) || [];
        toList.push(f);
        flowsByAccount.set(f.toAccountId, toList);
      } else {
        const list = flowsByAccount.get(f.accountId) || [];
        list.push(f);
        flowsByAccount.set(f.accountId, list);
      }
    });

    const accountSummaries: AccountSimulationSummary[] = Array.from(liquidAccountIdsSet).map(
      accountId => {
        const acc = accountMap.get(accountId);
        const startingBal = normalizedStartingBalances.get(accountId) || 0;
        const minBefore =
          simulationResult.summary.accountMinBalancesBeforeIncome.get(accountId) ?? startingBal;
        const absoluteMin =
          simulationResult.summary.accountMinBalances.get(accountId) ?? startingBal;

        // Usage Details
        let totalInflow = 0;
        let totalOutflow = 0;
        const inflowMap = new Map<
          string,
          { name: string; amount: number; source: string; minDay: number }
        >();
        const outflowMap = new Map<
          string,
          { name: string; amount: number; source: string; minDay: number }
        >();

        const accFlows = flowsByAccount.get(accountId) || [];
        accFlows.forEach(f => {
          let amount = f.amount;
          let isDebit = false;
          let isRelevant = true;

          if (f.kind === 'INFLOW' && f.accountId === accountId) {
            isDebit = false;
          } else if (f.kind === 'OUTFLOW' && f.accountId === accountId) {
            isDebit = true;
          } else if (f.kind === 'TRANSFER') {
            if (f.fromAccountId === accountId) {
              isDebit = true;
            } else if (f.toAccountId === accountId) {
              isDebit = false;
            } else {
              isRelevant = false;
            }
          } else {
            isRelevant = false;
          }

          if (isRelevant) {
            const label = f.label || 'Transaction';
            const source = f.origin;
            if (isDebit) {
              totalOutflow += amount;
              const existing = outflowMap.get(label);
              outflowMap.set(label, {
                name: label,
                amount: (existing?.amount || 0) + amount,
                source,
                minDay: Math.min(existing?.minDay ?? f.dayOffset, f.dayOffset),
              });
            } else {
              totalInflow += amount;
              const existing = inflowMap.get(label);
              inflowMap.set(label, {
                name: label,
                amount: (existing?.amount || 0) + amount,
                source,
                minDay: Math.min(existing?.minDay ?? f.dayOffset, f.dayOffset),
              });
            }
          }
        });

        const topInflows = Array.from(inflowMap.values())
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 3)
          .map(d => ({
            name: d.name,
            amount: d.amount,
            source: d.source,
            isPostIncome: firstMajorInflowDay !== null && d.minDay >= firstMajorInflowDay,
          }));

        const topOutflows = Array.from(outflowMap.values())
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 3)
          .map(d => ({
            name: d.name,
            amount: d.amount,
            source: d.source,
            isPostIncome: firstMajorInflowDay !== null && d.minDay >= firstMajorInflowDay,
          }));

        return {
          accountId,
          accountName: acc?.name || 'Unknown',
          startingBalance: startingBal,
          safeToSpend: Math.max(0, Math.min(startingBal, minBefore)),
          shortfall: minBefore < 0 ? Math.abs(minBefore) : 0,
          minBalance: absoluteMin,
          usageDetails: {
            totalInflow,
            totalOutflow,
            topInflows,
            topOutflows,
          },
        } as AccountSimulationSummary;
      },
    );

    // Final Post-processing (Map timestamps back in)
    simulationResult.projections.forEach(p => {
      p.timestamp = time.getTimestamp(p.dayOffset);
    });

    return {
      simulationResult,
      report,
      accountSummaries,
      allFlows,
      startingBalances: normalizedStartingBalances,
      liquidAccountIdsSet,
      liabilityAccountBalances,
      accountMap,
    };
  }

  // --- Normalization Helpers ---

  private async fetchMetadata(lbs: { account: Account }[]) {
    const map = new Map<string, any>();
    if (lbs.length === 0) return map;

    const ids = lbs.map(lb => lb.account.id);
    const metadataRecords = await accountRepository.findMetadataByAccountIds(ids);

    metadataRecords.forEach(meta => {
      map.set(meta.accountId, meta);
    });

    return map;
  }

  private async fetchStatementValues(
    lbs: { account: Account }[],
    metadataMap: Map<string, AccountMetadata>,
    time: TimeContext,
    toCurrency: string,
    rateMap: Map<string, number>,
  ) {
    const balances = new Map<string, number>();
    const settledAmounts = new Map<string, number>();
    const ccAccounts = lbs.filter(lb => lb.account.accountSubtype === 'CREDIT_CARD');

    const convert = (amount: number, from: string) =>
      Math.round(amount * (rateMap.get(from) || 1) * 100) / 100;

    await Promise.all(
      ccAccounts.map(async lb => {
        const metadata = metadataMap.get(lb.account.id);
        if (metadata?.statementDay) {
          const dueDay = metadata.dueDay || AppConfig.insights.liabilityDefaultDueDay;
          const now = time.getStartOfToday();
          const d1Date = getNextDueDate(now, dueDay);
          const s1Date = getCorrespondingStatementDate(d1Date, metadata.statementDay, dueDay);

          const [latestBalances, metrics] = await Promise.all([
            transactionRawRepository.getLatestBalancesRaw([lb.account.id], s1Date.valueOf()),
            transactionRawRepository.getAccountPeriodMetricsRaw(
              lb.account.id,
              s1Date.valueOf(),
              now.endOf('day').valueOf(),
              false,
            ),
          ]);

          const rawBal = Math.abs(latestBalances.get(lb.account.id) || 0);
          const statementBal = convert(rawBal, lb.account.currencyCode || toCurrency);
          balances.set(lb.account.id, statementBal);

          const rawSettled = metrics.totalDecrease;
          const settled = convert(rawSettled, lb.account.currencyCode || toCurrency);
          settledAmounts.set(lb.account.id, settled);
        }
      }),
    );
    return { statementBalances: balances, settledSinceStatement: settledAmounts };
  }

  private async fetchJournalTransactions(journals: Journal[]) {
    const ids = journals.map(j => j.id);
    const txs = ids.length > 0 ? await transactionRepository.findByJournals(ids) : [];
    const map = new Map<string, Transaction[]>();
    for (const tx of txs) {
      const list = map.get(tx.journalId) || [];
      list.push(tx);
      map.set(tx.journalId, list);
    }
    return map;
  }

  private async fetchBudgetCategoryMap(budgets: Budget[], allAccounts: Account[]) {
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
    const allScopes = await budgetRepository.getScopesByBudgetIds(budgets.map(b => b.id));
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
