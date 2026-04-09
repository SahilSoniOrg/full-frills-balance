import { AppConfig } from '@/src/constants/app-config';
import Account, { AccountType } from '@/src/data/models/Account';
import Budget from '@/src/data/models/Budget';
import Journal from '@/src/data/models/Journal';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { BudgetUsage } from '@/src/services/budget/budgetReadService';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import dayjs from 'dayjs';
import { TimeContext } from '../TimeContext';
import { getCorrespondingStatementDate, getNextDueDate } from '../utils/liabilityUtils';
import { BudgetFlowGenerator } from './engines/BudgetFlowGenerator';
import { LiabilityFlowGenerator } from './engines/LiabilityFlowGenerator';
import { PlannedFlowGenerator } from './engines/PlannedFlowGenerator';
import { FlowResolver } from './FlowResolver';
import { Simulator } from './Simulator';
import { AccountSimulationSummary, SimulationContext, SimulationResultV2 } from './types';

export class CashFlowSimulationServiceV2 {
  /**
   * WIP V2 Simulation following the "Generate truth -> simulate once" architecture.
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
  ): Promise<SimulationResultV2> {
    const time = new TimeContext(dayjs(), simulationDays);
    const simulationStartMs = time.getStartOfToday().valueOf();
    const simulationEndMs = time.getEndMs();

    // 1. PHASE: NORMALIZE & PRE-FETCH
    const liquidAccountIdsSet = new Set(liquidAssetIds);
    const liabilityAccountIdsSet = new Set(liabilityAccountBalances.map(lb => lb.account.id));
    const accountMap = new Map(allAccounts.map(a => [a.id, a]));

    // Build unique currency list for pre-loading rates
    const currencies = new Set<string>();
    currencies.add(resultCurrency);
    allAccounts.forEach(a => {
      if (a.currencyCode) currencies.add(a.currencyCode);
    });
    budgets.forEach(b => {
      if (b.currencyCode) currencies.add(b.currencyCode);
    });
    plannedPayments.forEach(pp => {
      if (pp.currencyCode) currencies.add(pp.currencyCode);
    });

    const rateMap = new Map<string, number>();
    await Promise.all(
      Array.from(currencies).map(async from => {
        const { convertedAmount } = await exchangeRateService.convert(1, from, resultCurrency);
        rateMap.set(from, convertedAmount);
      }),
    );

    const convert = (amount: number, from: string) =>
      Math.round(amount * (rateMap.get(from) || 1) * 100) / 100;

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

    // Metadata & Statements
    const metadataMap = await this.fetchMetadata(liabilityAccountBalances);
    const { statementBalances, settledSinceStatement } = await this.fetchStatementValues(
      liabilityAccountBalances,
      metadataMap,
      time,
      resultCurrency,
    );
    const journalTxsMap = await this.fetchJournalTransactions(plannedJournals);
    const budgetCategoryMap = await this.fetchBudgetCategoryMap(budgets, allAccounts);
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

    const budgetFlows = BudgetFlowGenerator.generate(
      context,
      normalizedBudgets,
      normalizedUsages,
      time.daysLeftInMonth(),
      time.nextMonthDays(),
      budgetCategoryMap,
    );

    // Resolve conflicts (e.g., Budget vs Planned)
    const resolvedSpendingFlows = FlowResolver.resolveConflicts([...budgetFlows, ...plannedFlows]);

    const liabilityFlows = LiabilityFlowGenerator.generate(
      context,
      resolvedSpendingFlows,
      normalizedLiabilityBalances as any,
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
    );

    // 4. PHASE: POST-PROCESS SUMMARIES
    const firstMajorInflowDay = simulationResult.summary.firstMajorInflowDay;
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
        const inflowMap = new Map<string, { amount: number; source: string; minDay: number }>();
        const outflowMap = new Map<string, { amount: number; source: string; minDay: number }>();

        allFlows.forEach(f => {
          // Handle Inflows / Outflows / Transfers
          let isRelevant = false;
          let amount = f.amount;
          let isDebit = false;

          if (f.kind === 'INFLOW' && f.accountId === accountId) {
            isRelevant = true;
            isDebit = false;
          } else if (f.kind === 'OUTFLOW' && f.accountId === accountId) {
            isRelevant = true;
            isDebit = true;
          } else if (f.kind === 'TRANSFER') {
            if (f.fromAccountId === accountId) {
              isRelevant = true;
              isDebit = true;
            } else if (f.toAccountId === accountId) {
              isRelevant = true;
              isDebit = false;
            }
          }

          if (isRelevant) {
            const label = f.meta?.label || 'Transaction';
            const source = (f.meta as any)?.source || 'OTHER';
            if (isDebit) {
              totalOutflow += amount;
              const existing = outflowMap.get(label);
              outflowMap.set(label, {
                amount: (existing?.amount || 0) + amount,
                source,
                minDay: Math.min(existing?.minDay ?? f.dayOffset, f.dayOffset),
              });
            } else {
              totalInflow += amount;
              const existing = inflowMap.get(label);
              inflowMap.set(label, {
                amount: (existing?.amount || 0) + amount,
                source,
                minDay: Math.min(existing?.minDay ?? f.dayOffset, f.dayOffset),
              });
            }
          }
        });

        const topInflows = Array.from(inflowMap.entries())
          .map(([name, d]) => ({
            name,
            amount: d.amount,
            source: d.source,
            isPostIncome: firstMajorInflowDay !== null && d.minDay >= firstMajorInflowDay,
          }))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 3);

        const topOutflows = Array.from(outflowMap.entries())
          .map(([name, d]) => ({
            name,
            amount: d.amount,
            source: d.source,
            isPostIncome: firstMajorInflowDay !== null && d.minDay >= firstMajorInflowDay,
          }))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 3);

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
        };
      },
    );

    simulationResult.accountSummaries = accountSummaries;

    // Final Post-processing (Map timestamps back in)
    simulationResult.projections.forEach(p => {
      p.timestamp = time.getTimestamp(p.dayOffset);
    });

    simulationResult.allFlows = allFlows;

    return simulationResult;
  }

  // --- Normalization Helpers ---

  private async fetchMetadata(lbs: { account: Account }[]) {
    const records = await Promise.all(
      lbs.map(lb => lb.account.metadataRecords?.fetch?.() || Promise.resolve([])),
    );
    return new Map(lbs.map((lb, i) => [lb.account.id, records[i][0]]));
  }

  private async fetchStatementValues(
    lbs: { account: Account }[],
    metadataMap: Map<string, any>,
    time: TimeContext,
    toCurrency: string,
  ) {
    const balances = new Map<string, number>();
    const settledAmounts = new Map<string, number>();
    const ccAccounts = lbs.filter(lb => lb.account.accountSubtype === 'CREDIT_CARD');

    await Promise.all(
      ccAccounts.map(async lb => {
        const metadata = metadataMap.get(lb.account.id);
        if (metadata?.statementDay) {
          const dueDay = metadata.dueDay || AppConfig.insights.liabilityDefaultDueDay;
          const now = time.getStartOfToday();
          const d1Date = getNextDueDate(now, dueDay);
          const s1Date = getCorrespondingStatementDate(d1Date, metadata.statementDay, dueDay);

          // 1. Fetch balance at statement date
          const latestBalances = await transactionRawRepository.getLatestBalancesRaw(
            [lb.account.id],
            s1Date.valueOf(),
          );
          let statementBal = Math.abs(latestBalances.get(lb.account.id) || 0);
          if (lb.account.currencyCode && lb.account.currencyCode !== toCurrency) {
            const { convertedAmount } = await exchangeRateService.convert(
              statementBal,
              lb.account.currencyCode,
              toCurrency,
            );
            statementBal = convertedAmount;
          }
          balances.set(lb.account.id, statementBal);

          // 2. Fetch settled payments made between s1Date and now
          // For liabilities, a payment is a DEBIT (money into account)
          const metrics = await transactionRawRepository.getAccountPeriodMetricsRaw(
            lb.account.id,
            s1Date.valueOf(),
            now.endOf('day').valueOf(),
            false, // isAssetOrExpense = false for Liability
          );

          // metrics.totalDecrease for liability = DEBIT (payments)
          let settled = metrics.totalDecrease;
          if (lb.account.currencyCode && lb.account.currencyCode !== toCurrency) {
            const { convertedAmount } = await exchangeRateService.convert(
              settled,
              lb.account.currencyCode,
              toCurrency,
            );
            settled = convertedAmount;
          }
          settledAmounts.set(lb.account.id, settled);
        }
      }),
    );
    return { statementBalances: balances, settledSinceStatement: settledAmounts };
  }

  private async fetchJournalTransactions(journals: Journal[]) {
    const ids = journals.map(j => j.id);
    const txs = ids.length > 0 ? await transactionRepository.findByJournals(ids) : [];
    const map = new Map<string, any[]>();
    for (const tx of txs) {
      const list = map.get(tx.journalId) || [];
      list.push(tx);
      map.set(tx.journalId, list);
    }
    return map;
  }

  private async fetchBudgetCategoryMap(budgets: Budget[], allAccounts: Account[]) {
    const map = new Map<string, Set<string>>();
    const expenses = allAccounts.filter(a => a.accountType === AccountType.EXPENSE);

    // Build tree for descendant resolution
    const childrenMap = new Map<string, string[]>();
    expenses.forEach(acc => {
      if (acc.parentAccountId) {
        const siblings = childrenMap.get(acc.parentAccountId) || [];
        siblings.push(acc.id);
        childrenMap.set(acc.parentAccountId, siblings);
      }
    });

    const getDescendants = (id: string, result: Set<string>) => {
      const children = childrenMap.get(id) || [];
      for (const childId of children) {
        result.add(childId);
        getDescendants(childId, result);
      }
    };

    await Promise.all(
      budgets.map(async budget => {
        const scopes = await budgetRepository.getScopes(budget.id);
        const leafIds = new Set<string>();
        for (const scope of scopes) {
          const accId = scope.account.id;
          leafIds.add(accId);
          getDescendants(accId, leafIds);
        }
        map.set(budget.id, leafIds);
      }),
    );

    return map;
  }
}

export const cashFlowSimulationServiceV2 = new CashFlowSimulationServiceV2();
