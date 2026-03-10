import { AppConfig } from '@/src/constants';
import Account, { AccountSubtype, AccountType } from '@/src/data/models/Account';
import Budget from '@/src/data/models/Budget';
import Journal from '@/src/data/models/Journal';
import { BudgetUsage } from '@/src/services/budget/budgetReadService';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { logger } from '@/src/utils/logger';
import { Money } from '@/src/utils/money';
import dayjs from 'dayjs';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import { TransactionType } from '@/src/data/models/Transaction';

export class CashFlowSimulationService {
    /**
     * Configured-day cash flow simulation for Safe to Spend.
     */
    async simulateSafeToSpend(
        startingBalance: Money,
        plannedPayments: PlannedPayment[],
        plannedJournals: Journal[],
        liquidAssetIds: string[],
        liabilityAccountBalances: { account: Account, balance: Money }[],
        budgets: Budget[],
        usages: BudgetUsage[],
        scopeGroups: any[][],
        allAccounts: Account[],
        resultCurrency: string,
    ): Promise<{
        safeToSpend: number;
        shortfall: number;
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
        committedAmountByAccount: {
            accountId: string,
            accountName: string,
            amount: number,
            budgets: { budgetId: string, name: string, amount: number }[]
        }[];
        projectionPoints: { timestamp: number, value: number, isProjected: boolean }[];
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
            resultCurrency
        );

        let currentBalance = startingBalance;
        let minBalance = currentBalance;
        const projectionPoints: { timestamp: number, value: number, isProjected: boolean }[] = [];
        let safeDaysCount: number | null = null;

        projectionPoints.push({ timestamp: now.valueOf(), value: currentBalance.amount, isProjected: true });

        for (let d = 0; d < SIMULATION_DAYS; d++) {
            const drain = Array.isArray(flows.effectiveDailyDrain) ? (flows.effectiveDailyDrain[d] || 0) : flows.effectiveDailyDrain;
            currentBalance = currentBalance.subtract(Money.from(drain, resultCurrency));
            
            const offsetFlow = flows.flowByDayOffset.get(d) || 0;
            currentBalance = currentBalance.add(Money.from(offsetFlow, resultCurrency));
            
            const dayOffset = d + 1;
            projectionPoints.push({
                timestamp: now.add(dayOffset, 'day').valueOf(),
                value: currentBalance.amount,
                isProjected: true
            });

            if (currentBalance.amount < minBalance.amount) minBalance = currentBalance;
            if (currentBalance.amount < 0 && safeDaysCount === null) {
                safeDaysCount = dayOffset;
            }
        }

        return {
            safeToSpend: Math.max(0, minBalance.amount),
            shortfall: minBalance.amount < 0 ? Math.abs(minBalance.amount) : 0,
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
            committedAmountByAccount: flows.committedAmountByAccount,
            projectionPoints,
            safeDaysCount
        };
    }

    async getSimulationFlows(
        simulationDays: number,
        now: dayjs.Dayjs,
        plannedPayments: PlannedPayment[],
        plannedJournals: Journal[],
        liquidAccountIds: Set<string>,
        liabilityAccountBalances: { account: Account, balance: Money }[],
        budgets: Budget[],
        usages: BudgetUsage[],
        scopeGroups: any[][],
        allAccounts: Account[],
        resultCurrency: string,
    ): Promise<{
        flowByDayOffset: Map<number, number>,
        organicNetFlow: number,
        effectiveDailyDrain: number | number[],
        totalFutureInflow: number,
        committedBudget: number,
        committedPlanned: number,
        committedPlannedPayments: number,
        committedJournals: number,
        committedLiabilities: number,
        committedLiabilitiesCC: number,
        committedLiabilitiesOther: number,
        totalLiabilities: number,
        totalLiabilitiesCC: number,
        totalLiabilitiesOther: number,
        currentMonthBudgetRemaining: number,
        nextMonthBudgetProjected: number,
        nextMonthProjectionDays: number,
        dailyBudgetBurns: number[],
        committedAmountByAccount: {
            accountId: string,
            accountName: string,
            amount: number,
            budgets: { budgetId: string, name: string, amount: number }[]
        }[]
    }> {
        const flowByDayOffset = new Map<number, number>();
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

        const liabilityAccountIds = new Set(liabilityAccountBalances.map(lb => lb.account.id));
        const liabilityAccountSubtypes = new Map(liabilityAccountBalances.map(lb => [lb.account.id, lb.account.accountSubtype]));

        const addFlow = (dayOffset: number, amount: number, type: 'PLAN_PAYMENT' | 'PLAN_JOURNAL' | 'LIABILITY_CC' | 'LIABILITY_OTHER' | 'DAILY_BUDGET' | 'OTHER' = 'OTHER', context?: string, commitAmount?: number) => {
            if (dayOffset < 0 || dayOffset > simulationDays) return;
            const current = flowByDayOffset.get(dayOffset) || 0;
            flowByDayOffset.set(dayOffset, current + amount);

            if (amount > 0) futureInflow = futureInflow.add(Money.from(amount, resultCurrency));

            const effectiveCommit = commitAmount ?? (amount < 0 ? Math.abs(amount) : 0);
            const commitMoney = Money.from(effectiveCommit, resultCurrency);

            if (effectiveCommit > 0) {
                if (type === 'PLAN_PAYMENT' || type === 'PLAN_JOURNAL') {
                    if (type === 'PLAN_PAYMENT') plannedPaymentsSum = plannedPaymentsSum.add(commitMoney);
                    if (type === 'PLAN_JOURNAL') plannedJournalsSum = plannedJournalsSum.add(commitMoney);
                    planned = planned.add(commitMoney);
                    logger.info(`[SafeToSpend] Committed: ${context || 'Planned'} impact ${effectiveCommit} on day ${dayOffset}`);
                } else if (type === 'LIABILITY_CC' || type === 'LIABILITY_OTHER') {
                    liabilities = liabilities.add(commitMoney);
                    if (type === 'LIABILITY_CC') {
                        liabilitiesCC = liabilitiesCC.add(commitMoney);
                    } else {
                        liabilitiesOther = liabilitiesOther.add(commitMoney);
                    }
                    logger.info(`[SafeToSpend] Committed: ${context || 'Liability'} impact ${effectiveCommit} on day ${dayOffset}`);
                }
            }

            if (context && type !== 'PLAN_PAYMENT' && type !== 'PLAN_JOURNAL') {
                logger.info(`[SafeToSpend] Flow: ${context} impact ${amount} on day ${dayOffset}`);
            }
        };

        // budget calculation logic
        const currentMonth = now.format('YYYY-MM');
        const daysLeftInMonth = now.daysInMonth() - now.date() + 1;
        const dailyBudgetBurns = new Array(simulationDays).fill(0);
        const nextMonthDays = now.add(1, 'month').daysInMonth();
        const accountMaxDailyBurns = new Map<string, number[]>();
        const accountBudgetBuckets = new Map<string, Map<string, { name: string, amount: number }>>();
        const budgetCoveredExpenseAccountIds = new Set<string>();
        const accountById = new Map(allAccounts.map(account => [account.id, account]));

        await Promise.all(
            usages.map(async (usage, idx) => {
                const budget = budgets[idx];
                if (budget.startMonth !== currentMonth) return;

                const scope = (scopeGroups[idx] || []) as any[];
                if (scope.length === 0) return;

                const remaining = Math.max(0, usage.remaining);
                if (remaining === 0 && budget.amount === 0) return;

                const budgetCurrency = budget.currencyCode || resultCurrency;
                let remainingInDefault = remaining;
                let amountInDefault = budget.amount;

                if (budgetCurrency !== resultCurrency) {
                    try {
                        const { convertedAmount: convRem } = await exchangeRateService.convert(
                            remaining, budgetCurrency, resultCurrency
                        );
                        remainingInDefault = convRem;

                        const { convertedAmount: convAmt } = await exchangeRateService.convert(
                            budget.amount, budgetCurrency, resultCurrency
                        );
                        amountInDefault = convAmt;
                    } catch (e) {
                        logger.error('Failed to convert budget remaining for simulation', e);
                    }
                }

                const currentMonthDaily = remainingInDefault / Math.max(1, daysLeftInMonth);
                const nextMonthDaily = amountInDefault / Math.max(1, nextMonthDays);

                const shareOfCurrent = currentMonthDaily / scope.length;
                const shareOfNext = nextMonthDaily / scope.length;

                for (const s of scope) {
                    const accountId = s.account.id;
                    const acc = accountById.get(accountId);
                    if (acc?.accountType === AccountType.EXPENSE) {
                        budgetCoveredExpenseAccountIds.add(accountId);
                    }

                    let burns = accountMaxDailyBurns.get(accountId);
                    if (!burns) {
                        burns = new Array(simulationDays).fill(0);
                        accountMaxDailyBurns.set(accountId, burns);
                    }
                    for (let i = 0; i < simulationDays; i++) {
                        const dailyShare = i < daysLeftInMonth ? shareOfCurrent : shareOfNext;
                        burns[i] = Math.max(burns[i], dailyShare);
                    }

                    let accountBudgets = accountBudgetBuckets.get(accountId);
                    if (!accountBudgets) {
                        accountBudgets = new Map();
                        accountBudgetBuckets.set(accountId, accountBudgets);
                    }
                    const totalContribution = (shareOfCurrent * daysLeftInMonth) + (shareOfNext * (simulationDays - daysLeftInMonth));
                    accountBudgets.set(budget.id, { name: budget.name, amount: totalContribution });
                }
            })
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

        const committedAmountByAccount = Array.from(accountMaxDailyBurns.entries())
            .map(([accountId, burns]) => {
                const budgetsMap = accountBudgetBuckets.get(accountId);
                const budgetsList = budgetsMap ? Array.from(budgetsMap.entries()).map(([budgetId, b]) => ({
                    budgetId,
                    name: b.name,
                    amount: b.amount
                })) : [];

                return {
                    accountId,
                    accountName: accountById.get(accountId)?.name || 'Unknown',
                    amount: burns.reduce((sum, b) => sum + b, 0),
                    budgets: budgetsList.sort((a, b) => b.amount - a.amount)
                };
            })
            .filter(a => a.amount > 0)
            .sort((a, b) => b.amount - a.amount);

        const manualPaymentAccountIds = new Set<string>();
        for (const pp of plannedPayments) manualPaymentAccountIds.add(pp.toAccountId);
        if (plannedJournals.length > 0) {
            const plannedTxs = await transactionRepository.findByJournals(plannedJournals.map(j => j.id));
            for (const tx of plannedTxs) manualPaymentAccountIds.add(tx.accountId);
        }

        for (const lb of liabilityAccountBalances) {
            const balanceMoney = lb.balance; // Already in resultCurrency from InsightService
            if (balanceMoney.amount <= 0) continue;

            const convMoney = balanceMoney;

            totalLiabs = totalLiabs.add(convMoney);
            if (lb.account.accountSubtype === AccountSubtype.CREDIT_CARD) {
                totalLiabsCC = totalLiabsCC.add(convMoney);
            } else {
                totalLiabsOther = totalLiabsOther.add(convMoney);
            }

            if (manualPaymentAccountIds.has(lb.account.id)) {
                continue;
            }

            try {
                const metadataRecords = lb.account.metadataRecords
                    ? await lb.account.metadataRecords.fetch()
                    : [];
                const metadata = metadataRecords[0];

                const today = now.date();
                const statementDay = metadata?.statementDay;
                const dueDay = metadata?.dueDay || AppConfig.insights.liabilityDefaultDueDay;

                if (lb.account.accountSubtype === AccountSubtype.CREDIT_CARD && statementDay) {
                    let deductionMoney = convMoney;
                    let targetDueDate: dayjs.Dayjs;

                    if (today > statementDay) {
                        const statementDate = now.date(statementDay).startOf('day').valueOf();
                        const balancesAtStatement = await transactionRawRepository.getLatestBalancesRaw([lb.account.id], statementDate);
                        const statementBalanceRaw = balancesAtStatement.get(lb.account.id) || 0;
                        const statementBalance = Math.abs(statementBalanceRaw);
                        
                        const convStatement = (await exchangeRateService.convert(statementBalance, lb.account.currencyCode || resultCurrency, resultCurrency)).convertedAmount;
                        deductionMoney = Money.from(convStatement, resultCurrency);
                        
                        targetDueDate = now.date(dueDay);
                        if (dueDay <= today) {
                            targetDueDate = targetDueDate.add(1, 'month');
                        }
                    } else {
                        deductionMoney = convMoney;
                        targetDueDate = now.date(dueDay).add(1, 'month');
                    }

                    const dayOffset = targetDueDate.startOf('day').diff(now, 'day');
                    addFlow(dayOffset, -deductionMoney.amount, 'LIABILITY_CC', `Liability: ${lb.account.name} (Credit Card Statement)`);
                } else {
                    let deductionDay = metadata?.dueDay || metadata?.emiDay || AppConfig.insights.liabilityFallbackDeductionDay;
                    let targetDate = now.date(deductionDay);
                    if (deductionDay <= today) {
                        targetDate = targetDate.add(1, 'month');
                    }
                    const dayOffset = targetDate.startOf('day').diff(now, 'day');
                    addFlow(dayOffset, -convMoney.amount, 'LIABILITY_OTHER', `Liability: ${lb.account.name} (Other)`);
                }
            } catch (e) {
                logger.error('getSimulationFlows: liability metadata failed', e);
                addFlow(AppConfig.insights.liabilityErrorFallbackOffsetDays, -convMoney.amount, 'LIABILITY_OTHER');
            }
        }

        const endMs = now.add(simulationDays, 'day').valueOf();
        const journalCoveredPPIds = new Set<string>(plannedJournals.map(pj => pj.plannedPaymentId).filter((id): id is string => Boolean(id)));

        for (const pp of plannedPayments) {
            if (journalCoveredPPIds.has(pp.id)) {
                logger.info(`[SafeToSpend] Skipping PP ${pp.name}: covered by planned journal`);
                continue;
            }

            const isLiquidFrom = liquidAccountIds.has(pp.fromAccountId) || liabilityAccountIds.has(pp.fromAccountId);
            const isLiquidTo = liquidAccountIds.has(pp.toAccountId) || liabilityAccountIds.has(pp.toAccountId);

            if (!isLiquidFrom && !isLiquidTo) {
                logger.info(`[SafeToSpend] Skipping PP ${pp.name}: neither side is liquid (from: ${pp.fromAccountId}, to: ${pp.toAccountId})`);
                continue;
            }

            const isInternalTransfer = (liquidAccountIds.has(pp.fromAccountId) || liabilityAccountIds.has(pp.fromAccountId)) &&
                (liquidAccountIds.has(pp.toAccountId) || liabilityAccountIds.has(pp.toAccountId));

            // Budget exclusion logic:
            // If the destination is covered by a budget, we MUST still simulate this PP if it's an outflow from liquid.
            // However, to avoid double counting, we should ideally subtract this PP amount from the budget drain that day.
            // For now, if it's explicitly planned, we prioritize the PP and let the budget handle the "residual".
            // If we skip the PP here, it won't show up in "Committed Planned" which the user specifically wants.
            const isBudgetCovered = budgetCoveredExpenseAccountIds.has(pp.toAccountId);
            if (isBudgetCovered) {
                logger.info(`[SafeToSpend] PP ${pp.name} is budget-covered. We will include it in simulation but note potential double-counting with budget.`);
            }

            let curr = pp.nextOccurrence;
            while (curr <= endMs) {
                // Include payments that are due today or in the future
                if (dayjs(curr).isAfter(now.subtract(1, 'minute'))) {
                    const dayOffset = dayjs(curr).startOf('day').diff(now.startOf('day'), 'day');
                    
                    const ppMoney = Money.from(pp.amount, pp.currencyCode || resultCurrency);
                    let amountDefault = ppMoney.amount;
                    if (ppMoney.currencyCode !== resultCurrency) {
                        try {
                            const { convertedAmount } = await exchangeRateService.convert(ppMoney.amount, ppMoney.currencyCode, resultCurrency);
                            amountDefault = convertedAmount;
                        } catch { }
                    }
                    
                    const isDebtOutflow = liabilityAccountIds.has(pp.toAccountId);
                    const impact = isDebtOutflow
                        ? -amountDefault
                        : (isInternalTransfer ? 0 : (isLiquidTo ? amountDefault : -amountDefault));
                    const flowType = isDebtOutflow ?
                        (liabilityAccountSubtypes.get(pp.toAccountId) === AccountSubtype.CREDIT_CARD ? 'LIABILITY_CC' : 'LIABILITY_OTHER')
                        : 'PLAN_PAYMENT';

                    // Liability payments reduce liquid cash even when the destination is another tracked account.
                    const commitAmount = (isInternalTransfer && isDebtOutflow) ? amountDefault : undefined;

                    logger.info(`[SafeToSpend] Simulating PP ${pp.name}: impact ${impact} on day ${dayOffset} (type: ${flowType})`);
                    addFlow(dayOffset, impact, flowType, `Planned Payment: ${pp.name || 'unnamed'} (${isLiquidTo ? 'Inflow' : 'Outflow'})`, commitAmount);
                }
                if (pp.intervalType === 'DAILY') curr = dayjs(curr).add(pp.intervalN || 1, 'day').valueOf();
                else if (pp.intervalType === 'WEEKLY') curr = dayjs(curr).add(pp.intervalN || 1, 'week').valueOf();
                else if (pp.intervalType === 'MONTHLY') curr = dayjs(curr).add(pp.intervalN || 1, 'month').valueOf();
                else if (pp.intervalType === 'YEARLY') curr = dayjs(curr).add(pp.intervalN || 1, 'year').valueOf();
                else break;
            }
        }

        if (plannedJournals.length > 0) {
            const allPlannedTxs = await transactionRepository.findByJournals(plannedJournals.map(j => j.id));
            const txByJournalId = new Map<string, any[]>();
            for (const tx of allPlannedTxs) {
                const list = txByJournalId.get(tx.journalId) || [];
                list.push(tx);
                txByJournalId.set(tx.journalId, list);
            }

            for (const journal of plannedJournals) {
                const journalTxs = txByJournalId.get(journal.id) || [];

                // A journal is relevant if it involves at least one liquid/liability account.
                const hasLiquidSide = journalTxs.some(tx => liquidAccountIds.has(tx.accountId) || liabilityAccountIds.has(tx.accountId));
                if (!hasLiquidSide) continue;

                // Transfers between Assets and Liabilities are "net zero" in terms of total net cash.
                // Spending from an Asset or a Liability to an Expense reduces net cash.

                const isInternalTransfer = journalTxs.every(tx => liquidAccountIds.has(tx.accountId) || liabilityAccountIds.has(tx.accountId));

                // Budget exclusion logic for journals
                if (journalTxs.some(tx => budgetCoveredExpenseAccountIds.has(tx.accountId))) {
                    logger.info(`[SafeToSpend] Journal ${journal.description} is budget-covered. Including it for committed visibility.`);
                }

                for (const tx of journalTxs) {
                    if (!liquidAccountIds.has(tx.accountId) && !liabilityAccountIds.has(tx.accountId)) continue;

                    const occurrenceMs = journal.journalDate;
                    if (occurrenceMs <= now.subtract(1, 'minute').valueOf() || occurrenceMs > endMs) continue;

                    const dayOffset = dayjs(occurrenceMs).startOf('day').diff(now.startOf('day'), 'day');
                    const txMoney = Money.from(tx.amount, tx.currencyCode || resultCurrency);
                    let amountDefault = txMoney.amount;
                    if (txMoney.currencyCode !== resultCurrency) {
                        try {
                            const { convertedAmount } = await exchangeRateService.convert(txMoney.amount, txMoney.currencyCode, resultCurrency);
                            amountDefault = convertedAmount;
                        } catch { }
                    }

                    const otherSideAccountId = journalTxs.find(otx => otx.accountId !== tx.accountId)?.accountId;
                    const isDebtOutflow = otherSideAccountId && liabilityAccountIds.has(otherSideAccountId);

                    const flowType = isDebtOutflow ?
                        (liabilityAccountSubtypes.get(otherSideAccountId) === AccountSubtype.CREDIT_CARD ? 'LIABILITY_CC' : 'LIABILITY_OTHER')
                        : 'PLAN_JOURNAL';

                    const impact = (isInternalTransfer && isDebtOutflow)
                        ? (tx.transactionType === TransactionType.CREDIT ? -amountDefault : 0)
                        : (isInternalTransfer ? 0 : (tx.transactionType === TransactionType.DEBIT ? amountDefault : -amountDefault));

                    // Similarly to PP, internal transfers to debt should be tracked for commitment display.
                    const commitAmount = (isInternalTransfer && isDebtOutflow && tx.transactionType === TransactionType.CREDIT) ? amountDefault : undefined;

                    addFlow(dayOffset, impact, flowType, `Planned Journal Tx: ${journal.description} (${tx.transactionType === TransactionType.DEBIT ? 'Debit' : 'Credit'})`, commitAmount);
                }
            }
        }

        return {
            flowByDayOffset,
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
            committedAmountByAccount
        };
    }
}

export const cashFlowSimulationService = new CashFlowSimulationService();
