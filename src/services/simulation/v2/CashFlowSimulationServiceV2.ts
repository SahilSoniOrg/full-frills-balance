import { AppConfig } from '@/src/constants/app-config';
import Account, { AccountSubtype, AccountType } from '@/src/data/models/Account';
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
import {
  AccountCommitment,
  AccountSimulationSummary,
  DebtEntry,
  DebtType,
  FlowSource,
  FlowType,
  IncomeEntry,
  ISimulationService,
  ProjectionPoint,
  SimulationResult,
} from '../types';
import { getCorrespondingStatementDate, getNextDueDate } from '../utils/liabilityUtils';
import { BudgetFlowGenerator } from './engines/BudgetFlowGenerator';
import { LiabilityFlowGenerator } from './engines/LiabilityFlowGenerator';
import { PlannedFlowGenerator } from './engines/PlannedFlowGenerator';
import { FlowResolver } from './FlowResolver';
import { Simulator } from './Simulator';
import { Flow, FlowMeta, SimulationContext, SimulationResultV2 } from './types';

export class CashFlowSimulationServiceV2 implements ISimulationService {
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
  ): Promise<SimulationResult> {
    const time = new TimeContext(dayjs(), simulationDays);
    const simulationStartMs = time.getStartOfToday().valueOf();
    const simulationEndMs = time.getEndMs();

    // 1. PHASE: NORMALIZE & PRE-FETCH
    const liquidAccountIdsSet = new Set(liquidAssetIds);
    const liabilityAccountIdsSet = new Set(liabilityAccountBalances.map(lb => lb.account.id));
    const accountMap = new Map(allAccounts.map(a => [a.id, a]));

    // Fetch journal transactions early to identify all required currencies
    const journalTxsMap = await this.fetchJournalTransactions(plannedJournals);

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

    // Also include currencies from journal transactions
    journalTxsMap.forEach(txs => {
      txs.forEach(tx => {
        if (tx.currencyCode) currencies.add(tx.currencyCode);
      });
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
      liquidAssetIds,
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

    // Final Post-processing (Map timestamps back in)
    simulationResult.projections.forEach(p => {
      p.timestamp = time.getTimestamp(p.dayOffset);
    });

    return this.buildLegacySimulationResult({
      simulationResult,
      accountSummaries,
      allFlows,
      startingBalances: normalizedStartingBalances,
      liquidAccountIdsSet,
      liabilityAccountBalances,
      accountMap,
    });
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

  private buildLegacySimulationResult({
    simulationResult,
    accountSummaries,
    allFlows,
    startingBalances,
    liquidAccountIdsSet,
    liabilityAccountBalances,
    accountMap,
  }: {
    simulationResult: SimulationResultV2;
    accountSummaries: AccountSimulationSummary[];
    allFlows: Flow[];
    startingBalances: Map<string, number>;
    liquidAccountIdsSet: Set<string>;
    liabilityAccountBalances: { account: Account; balance: number }[];
    accountMap: Map<string, Account>;
  }): SimulationResult {
    const liabilityAccountIdsSet = new Set(liabilityAccountBalances.map(lb => lb.account.id));
    const { dailyBudgetBurns, flowByDayOffset, safeToSpendDailyBreakdown } =
      this.buildLegacyProjectionMetadata(allFlows, liquidAccountIdsSet, liabilityAccountIdsSet);

    const budgetBreakdown = this.buildBudgetBreakdown(dailyBudgetBurns);
    const totalFutureInflow = this.computeTotalFutureInflow(
      allFlows,
      liquidAccountIdsSet,
      liabilityAccountIdsSet,
    );
    const { totalOrganicInflow, totalOrganicOutflow, totalCommittedPlanned } =
      this.computePlannedTotals(allFlows);
    const safeDaysCount = this.computeSafeDaysCount(
      startingBalances,
      liquidAccountIdsSet,
      simulationResult.projections,
    );

    const summary = simulationResult.summary;
    const firstMajorInflowDay = summary.firstMajorInflowDay;

    const incomeBreakdown: IncomeEntry[] = allFlows
      .filter(flow => flow.kind === 'INFLOW')
      .map(flow => ({
        id: flow.meta?.referenceId || 'income',
        name: flow.meta?.label || 'Income',
        amount: flow.amount,
        dayOffset: flow.dayOffset,
        type: FlowSource.PLANNED_PAYMENT,
      }));

    const committedMap = new Map<string, AccountCommitment>();
    allFlows
      .filter(flow => this.isCommitmentFlow(flow))
      .forEach(flow => {
        const target = this.resolveCommitmentTarget(flow, accountMap);
        const entry = committedMap.get(target.accountId) || {
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
              type: DebtType.BUDGET,
            });
          }
        } else {
          entry.details.push({
            id:
              flow.meta?.referenceId ||
              `${target.accountId}-${flow.dayOffset}-${flow.amount}-${target.detailType}`,
            name: flow.meta?.label || target.accountName || 'Spending',
            amount: flow.amount,
            dayOffset: flow.dayOffset,
            type:
              target.detailType === 'PLANNED_PAYMENT'
                ? DebtType.PLANNED_PAYMENT
                : DebtType.FALLBACK,
          });
        }

        committedMap.set(target.accountId, entry);
      });
    const committedBreakdown = Array.from(committedMap.values());

    const debtMap = new Map<string, DebtEntry>();
    allFlows
      .filter(
        (flow): flow is Extract<Flow, { kind: 'OUTFLOW' }> =>
          flow.kind === 'OUTFLOW' && flow.meta?.source === 'LIABILITY',
      )
      .forEach(flow => {
        const accId = flow.meta?.referenceId || flow.accountId;
        const acc = accountMap.get(accId);
        const entry = debtMap.get(accId) || {
          accountId: accId,
          accountName: acc?.name || 'Liability',
          amount: 0,
          dayOffset: flow.dayOffset,
          type: 'LIABILITY' as any,
        };
        entry.amount += flow.amount;
        debtMap.set(accId, entry);
      });
    const debtBreakdown = Array.from(debtMap.values());

    const totalLiabilities = liabilityAccountBalances.reduce((sum, lb) => sum + lb.balance, 0);

    const liabilitiesBreakdown = {
      total: totalLiabilities,
      totalCreditCard: liabilityAccountBalances
        .filter(lb => lb.account.accountSubtype === AccountSubtype.CREDIT_CARD)
        .reduce((sum, lb) => sum + lb.balance, 0),
      totalOther: liabilityAccountBalances
        .filter(lb => lb.account.accountSubtype !== AccountSubtype.CREDIT_CARD)
        .reduce((sum, lb) => sum + lb.balance, 0),
      committed: allFlows
        .filter(flow => flow.meta?.source === 'LIABILITY')
        .reduce((sum, flow) => sum + flow.amount, 0),
      committedCreditCard: allFlows
        .filter(flow =>
          this.isLiabilityCommitmentForSubtype(flow, accountMap, AccountSubtype.CREDIT_CARD),
        )
        .reduce((sum, flow) => sum + flow.amount, 0),
      committedOther: allFlows
        .filter(flow => flow.meta?.source === 'LIABILITY')
        .filter(
          flow =>
            !this.isLiabilityCommitmentForSubtype(flow, accountMap, AccountSubtype.CREDIT_CARD),
        )
        .reduce((sum, flow) => sum + flow.amount, 0),
    };

    const committedSubtypes = Array.from(
      new Set(
        committedBreakdown
          .map(entry => accountMap.get(entry.accountId)?.accountSubtype)
          .filter(Boolean),
      ),
    ) as any[];
    const debtSubtypes = Array.from(
      new Set(liabilityAccountBalances.map(lb => lb.account.accountSubtype).filter(Boolean)),
    ) as any[];

    const projectionPoints: ProjectionPoint[] = simulationResult.projections.map(point => ({
      timestamp: point.timestamp,
      dayOffset: point.dayOffset,
      value: point.globalBalance,
      isProjected: true,
      details: safeToSpendDailyBreakdown.get(point.dayOffset),
      dailyBurn: dailyBudgetBurns[point.dayOffset],
      accountBalances: point.accountBalances,
    }));

    return {
      summary: {
        safeToSpend: summary.safeToSpend,
        shortfall: summary.shortfall,
        trajectoryMinBalance: summary.trajectoryMinBalance,
        safeDaysCount,
        totalFutureInflow,
        totalOrganicOutflow,
        totalOrganicInflow,
        totalCommittedPlanned,
        firstMajorInflowDay,
      },
      accountSummaries,
      breakdowns: {
        income: incomeBreakdown,
        committed: committedBreakdown,
        debt: debtBreakdown,
        budget: budgetBreakdown,
        liabilities: liabilitiesBreakdown,
      },
      projections: {
        points: projectionPoints,
        dailyBudgetBurns,
        flowByDayOffset,
        safeToSpendDailyBreakdown,
      },
      allFlows,
      metadata: {
        firstMajorInflowDay,
        committedSubtypes,
        debtSubtypes,
      },
    };
  }

  private buildLegacyProjectionMetadata(
    flows: Flow[],
    liquidAccountIds: Set<string>,
    liabilityAccountIds: Set<string>,
  ) {
    const simulationDays = AppConfig.defaults.safeToSpendDays;
    const dailyBudgetBurns = new Array(simulationDays).fill(0);
    const flowByDayOffset = new Map<number, number>();
    const safeToSpendDailyBreakdown = new Map<
      number,
      { name: string; amount: number; type: FlowType; context?: string }[]
    >();

    for (const flow of flows) {
      const effectiveSource =
        flow.meta?.source === 'RESOLVED' ? flow.meta.originalSource : flow.meta?.source;
      if (effectiveSource === 'BUDGET') {
        dailyBudgetBurns[flow.dayOffset] += flow.amount;
      }
    }

    for (const flow of this.explodeAccountImpacts(flows)) {
      const isSimulationFlow = flow.meta?.source !== 'BUDGET';
      if (!isSimulationFlow) continue;

      const isLiquidAccount = liquidAccountIds.has(flow.accountId);
      const isLiabilityInflow = liabilityAccountIds.has(flow.accountId) && flow.amount > 0;
      const isInternalTransferToLiability =
        isLiabilityInflow && !!flow.sourceAccountId && liquidAccountIds.has(flow.sourceAccountId);

      if (isLiquidAccount || (isLiabilityInflow && !isInternalTransferToLiability)) {
        flowByDayOffset.set(
          flow.dayOffset,
          (flowByDayOffset.get(flow.dayOffset) || 0) + flow.amount,
        );
      }

      const details = safeToSpendDailyBreakdown.get(flow.dayOffset) || [];
      if (details.length < 20) {
        details.push({
          name: flow.meta?.label || 'Transaction',
          amount: Math.abs(flow.amount),
          type: flow.amount >= 0 ? FlowType.INFLOW : FlowType.OUTFLOW,
          context: flow.meta?.source,
        });
        safeToSpendDailyBreakdown.set(flow.dayOffset, details);
      }
    }

    return { dailyBudgetBurns, flowByDayOffset, safeToSpendDailyBreakdown };
  }

  private computeTotalFutureInflow(
    flows: Flow[],
    liquidAccountIds: Set<string>,
    liabilityAccountIds: Set<string>,
  ) {
    return this.explodeAccountImpacts(flows).reduce((sum, flow) => {
      const isSimulationFlow = flow.meta?.source !== 'BUDGET';
      if (!isSimulationFlow || flow.amount <= 0) return sum;

      if (liquidAccountIds.has(flow.accountId) || liabilityAccountIds.has(flow.accountId)) {
        return sum + flow.amount;
      }

      return sum;
    }, 0);
  }

  private computePlannedTotals(flows: Flow[]) {
    let totalOrganicInflow = 0;
    let totalOrganicOutflow = 0;
    let totalCommittedPlanned = 0;

    for (const flow of flows) {
      const isPlannedOrigin =
        flow.meta?.source === 'PLANNED' ||
        (flow.meta?.source === 'RESOLVED' && flow.meta.originalSource === 'PLANNED');

      if (!isPlannedOrigin) continue;

      if (flow.kind === 'INFLOW') {
        totalOrganicInflow += flow.amount;
      } else if (flow.kind === 'OUTFLOW') {
        totalOrganicOutflow += flow.amount;
        totalCommittedPlanned += flow.amount;
      } else {
        totalOrganicInflow += flow.amount;
        totalOrganicOutflow += flow.amount;
        totalCommittedPlanned += flow.amount;
      }
    }

    return { totalOrganicInflow, totalOrganicOutflow, totalCommittedPlanned };
  }

  private buildBudgetBreakdown(dailyBudgetBurns: number[]) {
    const now = dayjs().startOf('day');
    const daysLeftInMonth = now.daysInMonth() - now.date() + 1;
    let currentMonthRemaining = 0;
    let nextMonthProjected = 0;

    dailyBudgetBurns.forEach((amount, index) => {
      if (index < daysLeftInMonth) {
        currentMonthRemaining += amount;
      } else {
        nextMonthProjected += amount;
      }
    });

    return {
      currentMonthRemaining,
      nextMonthProjected,
      nextMonthDays: Math.max(0, AppConfig.defaults.safeToSpendDays - daysLeftInMonth),
    };
  }

  private computeSafeDaysCount(
    startingBalances: Map<string, number>,
    liquidAccountIds: Set<string>,
    projections: { dayOffset: number; globalBalance: number }[],
  ) {
    let startingGlobal = 0;
    for (const [accountId, balance] of startingBalances.entries()) {
      if (liquidAccountIds.has(accountId)) {
        startingGlobal += balance;
      }
    }

    if (startingGlobal < 0) return 0;

    const firstNegativeProjection = projections.find(p => p.globalBalance < 0);
    return firstNegativeProjection ? firstNegativeProjection.dayOffset + 1 : null;
  }

  private isCommitmentFlow(flow: Flow): boolean {
    const effectiveSource =
      flow.meta?.source === 'RESOLVED' ? flow.meta.originalSource : flow.meta?.source;

    if (flow.meta?.source === 'LIABILITY') return flow.kind === 'OUTFLOW';
    if (effectiveSource === 'BUDGET') return flow.kind === 'OUTFLOW';
    if (effectiveSource === 'PLANNED') return flow.kind === 'OUTFLOW' || flow.kind === 'TRANSFER';
    return false;
  }

  private resolveCommitmentTarget(flow: Flow, accountMap: Map<string, Account>) {
    if (flow.meta?.source === 'LIABILITY') {
      const accountId =
        flow.meta?.referenceId || (flow.kind === 'TRANSFER' ? flow.toAccountId : flow.accountId);
      const acc = accountMap.get(accountId);
      return {
        accountId,
        accountName: acc?.name || flow.meta?.label || 'Liability',
        detailType: 'FALLBACK' as 'FALLBACK',
      };
    }

    const effectiveSource =
      flow.meta?.source === 'RESOLVED' ? flow.meta.originalSource : flow.meta?.source;
    const accountId =
      flow.meta?.categoryId ||
      (flow.kind === 'TRANSFER' ? flow.toAccountId : flow.accountId) ||
      'other';
    const acc = accountMap.get(accountId);

    return {
      accountId,
      accountName: acc?.name || flow.meta?.label || 'Other',
      detailType: effectiveSource === 'BUDGET' ? 'BUDGET' : 'PLANNED_PAYMENT',
    };
  }

  private explodeAccountImpacts(flows: Flow[]): AccountImpact[] {
    return flows.flatMap(flow => {
      if (flow.kind === 'INFLOW') {
        return [
          {
            accountId: flow.accountId,
            amount: flow.amount,
            dayOffset: flow.dayOffset,
            meta: flow.meta,
          },
        ];
      }

      if (flow.kind === 'OUTFLOW') {
        return [
          {
            accountId: flow.accountId,
            amount: -flow.amount,
            dayOffset: flow.dayOffset,
            sourceAccountId: flow.accountId,
            meta: flow.meta,
          },
        ];
      }

      return [
        {
          accountId: flow.fromAccountId,
          amount: -flow.amount,
          dayOffset: flow.dayOffset,
          sourceAccountId: flow.fromAccountId,
          meta: flow.meta,
        },
        {
          accountId: flow.toAccountId,
          amount: flow.amount,
          dayOffset: flow.dayOffset,
          sourceAccountId: flow.fromAccountId,
          meta: flow.meta,
        },
      ];
    });
  }

  private isLiabilityCommitmentForSubtype(
    flow: Flow,
    accountMap: Map<string, Account>,
    subtype: AccountSubtype,
  ) {
    if (flow.meta?.source !== 'LIABILITY') return false;
    const liabilityAccount = accountMap.get(flow.meta?.referenceId || '');
    return liabilityAccount?.accountSubtype === subtype;
  }
}

type AccountImpact = {
  accountId: string;
  amount: number;
  dayOffset: number;
  sourceAccountId?: string;
  meta?: FlowMeta;
};

export const cashFlowSimulationServiceV2 = new CashFlowSimulationServiceV2();
