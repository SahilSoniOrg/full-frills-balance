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
            accountId: string,
            accountName: string,
            amount: number,
            details: { id: string, name: string, amount: number, type: 'BUDGET' | 'PLANNED_PAYMENT' | 'PLANNED_JOURNAL', dayOffset?: number }[]
        }[];
        debtBreakdown: {
            accountId: string,
            accountName: string,
            amount: number,
            type: 'FALLBACK' | 'PLANNED_PAYMENT' | 'PLANNED_JOURNAL'
        }[];
        incomeBreakdown: {
            id: string,
            name: string,
            amount: number,
            dayOffset: number,
            type: 'PLANNED_PAYMENT' | 'PLANNED_JOURNAL'
        }[];
        firstMajorInflowDay: number | null;
        committedSubtypes: AccountSubtype[];
        debtSubtypes: AccountSubtype[];
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
        committedBreakdown: {
            accountId: string,
            accountName: string,
            amount: number,
            details: { id: string, name: string, amount: number, type: 'BUDGET' | 'PLANNED_PAYMENT' | 'PLANNED_JOURNAL', dayOffset?: number }[]
        }[],
        debtBreakdown: {
            accountId: string,
            accountName: string,
            amount: number,
            type: 'FALLBACK' | 'PLANNED_PAYMENT' | 'PLANNED_JOURNAL'
        }[],
        incomeBreakdown: {
            id: string,
            name: string,
            amount: number,
            dayOffset: number,
            type: 'PLANNED_PAYMENT' | 'PLANNED_JOURNAL'
        }[],
        firstMajorInflowDay: number | null,
        committedSubtypes: AccountSubtype[],
        debtSubtypes: AccountSubtype[]
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

        const committedBreakdownMap = new Map<string, { 
            accountId: string, 
            accountName: string, 
            amount: number, 
            details: { id: string, name: string, amount: number, type: 'BUDGET' | 'PLANNED_PAYMENT' | 'PLANNED_JOURNAL', dayOffset?: number }[] 
        }>();
        const debtBreakdownMap = new Map<string, { 
            accountId: string, 
            accountName: string, 
            amount: number, 
            type: 'FALLBACK' | 'PLANNED_PAYMENT' | 'PLANNED_JOURNAL' 
        }>();
        const committedSubtypesSet = new Set<AccountSubtype>();
        const debtSubtypesSet = new Set<AccountSubtype>();
        const incomeBreakdownList: { id: string, name: string, amount: number, dayOffset: number, type: 'PLANNED_PAYMENT' | 'PLANNED_JOURNAL' }[] = [];
        let firstMajorInflowDay: number | null = null;
        const MAJOR_INFLOW_THRESHOLD = 1000; // Configurable threshold for "Major Paycheck"

        const liabilityAccountIds = new Set(liabilityAccountBalances.map(lb => lb.account.id));

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

        // Populate committedBreakdown from budgets
        for (const [accountId, burns] of accountMaxDailyBurns) {
            const acc = accountById.get(accountId);
            const totalAmount = burns.reduce((sum, b) => sum + b, 0);
            if (totalAmount <= 0) continue;

            const budgetsMap = accountBudgetBuckets.get(accountId);
            const details = budgetsMap ? Array.from(budgetsMap.entries()).map(([budgetId, b]) => ({
                id: budgetId,
                name: b.name,
                amount: b.amount,
                type: 'BUDGET' as const
            })) : [] as { id: string, name: string, amount: number, type: 'BUDGET' | 'PLANNED_PAYMENT' | 'PLANNED_JOURNAL' }[];

            committedBreakdownMap.set(accountId, {
                accountId,
                accountName: acc?.name || 'Unknown',
                amount: totalAmount,
                details: details.sort((a, b) => b.amount - a.amount)
            });

            if (acc?.accountSubtype) committedSubtypesSet.add(acc.accountSubtype);
        }

        // Pre-calculate planned liability coverage
        const plannedLiabilityCoverageMap = new Map<string, number>();
        const endMs = now.add(simulationDays, 'day').valueOf();

        for (const pp of plannedPayments) {
            if (!liabilityAccountIds.has(pp.toAccountId)) continue;
            
            const ppMoney = Money.from(pp.amount, pp.currencyCode || resultCurrency);
            let amountDefault = ppMoney.amount;
            if (ppMoney.currencyCode !== resultCurrency) {
                try {
                    const { convertedAmount } = await exchangeRateService.convert(ppMoney.amount, ppMoney.currencyCode, resultCurrency);
                    amountDefault = convertedAmount;
                } catch { }
            }

            let curr = pp.nextOccurrence;
            while (curr <= endMs) {
                if (dayjs(curr).isAfter(now.subtract(1, 'minute'))) {
                    plannedLiabilityCoverageMap.set(pp.toAccountId, (plannedLiabilityCoverageMap.get(pp.toAccountId) || 0) + amountDefault);
                }
                if (pp.intervalType === 'DAILY') curr = dayjs(curr).add(pp.intervalN || 1, 'day').valueOf();
                else if (pp.intervalType === 'WEEKLY') curr = dayjs(curr).add(pp.intervalN || 1, 'week').valueOf();
                else if (pp.intervalType === 'MONTHLY') curr = dayjs(curr).add(pp.intervalN || 1, 'month').valueOf();
                else if (pp.intervalType === 'YEARLY') curr = dayjs(curr).add(pp.intervalN || 1, 'year').valueOf();
                else break;
            }
        }

        if (plannedJournals.length > 0) {
            const journalCoveredTxs = await transactionRepository.findByJournals(plannedJournals.map(j => j.id));
            const journalById = new Map(plannedJournals.map(j => [j.id, j]));
            
            for (const tx of journalCoveredTxs) {
                if (!liabilityAccountIds.has(tx.accountId)) continue;
                if (tx.transactionType !== TransactionType.DEBIT) continue; // Only debits to liabilities are payments

                const journal = journalById.get(tx.journalId);
                if (!journal) continue;
                
                const occurrenceMs = journal.journalDate;
                if (occurrenceMs <= now.subtract(1, 'minute').valueOf() || occurrenceMs > endMs) continue;

                const txMoney = Money.from(tx.amount, tx.currencyCode || resultCurrency);
                let amountDefault = txMoney.amount;
                if (txMoney.currencyCode !== resultCurrency) {
                    try {
                        const { convertedAmount } = await exchangeRateService.convert(txMoney.amount, txMoney.currencyCode, resultCurrency);
                        amountDefault = convertedAmount;
                    } catch { }
                }
                plannedLiabilityCoverageMap.set(tx.accountId, (plannedLiabilityCoverageMap.get(tx.accountId) || 0) + amountDefault);
            }
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

            try {
                const metadataRecords = lb.account.metadataRecords
                    ? await lb.account.metadataRecords.fetch()
                    : [];
                const metadata = metadataRecords[0];

                const today = now.date();
                const statementDay = metadata?.statementDay;
                const dueDay = metadata?.dueDay || AppConfig.insights.liabilityDefaultDueDay;
                const coverageAmount = plannedLiabilityCoverageMap.get(lb.account.id) || 0;

                if (lb.account.accountSubtype === AccountSubtype.CREDIT_CARD && statementDay) {
                    let deductionAmount = convMoney.amount;
                    let targetDueDate: dayjs.Dayjs;

                    if (today > statementDay) {
                        const statementDate = now.date(statementDay).startOf('day').valueOf();
                        const balancesAtStatement = await transactionRawRepository.getLatestBalancesRaw([lb.account.id], statementDate);
                        const statementBalanceRaw = balancesAtStatement.get(lb.account.id) || 0;
                        const statementBalance = Math.abs(statementBalanceRaw);
                        
                        const convStatement = (await exchangeRateService.convert(statementBalance, lb.account.currencyCode || resultCurrency, resultCurrency)).convertedAmount;
                        deductionAmount = convStatement;
                        
                        targetDueDate = now.date(dueDay);
                        if (dueDay <= today) {
                            targetDueDate = targetDueDate.add(1, 'month');
                        }
                    } else {
                        deductionAmount = convMoney.amount;
                        targetDueDate = now.date(dueDay).add(1, 'month');
                    }

                    const unsettledAmount = Math.max(0, deductionAmount - coverageAmount);
                    if (unsettledAmount > 0) {
                        const dayOffset = targetDueDate.startOf('day').diff(now.startOf('day'), 'day');
                        addFlow(dayOffset, -unsettledAmount, 'LIABILITY_CC', `Liability (Unsettled): ${lb.account.name} (Credit Card Statement)`);
                        
                        debtBreakdownMap.set(lb.account.id, {
                            accountId: lb.account.id,
                            accountName: lb.account.name,
                            amount: unsettledAmount,
                            type: 'FALLBACK'
                        });
                        if (lb.account.accountSubtype) debtSubtypesSet.add(lb.account.accountSubtype);
                    }
                } else {
                    const unsettledAmount = Math.max(0, convMoney.amount - coverageAmount);
                    if (unsettledAmount > 0) {
                        let deductionDay = metadata?.dueDay || metadata?.emiDay || AppConfig.insights.liabilityFallbackDeductionDay;
                        let targetDate = now.date(deductionDay);
                        if (deductionDay <= today) {
                            targetDate = targetDate.add(1, 'month');
                        }
                        const dayOffset = targetDate.startOf('day').diff(now.startOf('day'), 'day');
                        addFlow(dayOffset, -unsettledAmount, 'LIABILITY_OTHER', `Liability (Unsettled): ${lb.account.name} (Other)`);

                        debtBreakdownMap.set(lb.account.id, {
                            accountId: lb.account.id,
                            accountName: lb.account.name,
                            amount: unsettledAmount,
                            type: 'FALLBACK'
                        });
                        if (lb.account.accountSubtype) debtSubtypesSet.add(lb.account.accountSubtype);
                    }
                }
            } catch (e) {
                logger.error('getSimulationFlows: liability metadata failed', e);
                const coverageAmount = plannedLiabilityCoverageMap.get(lb.account.id) || 0;
                const unsettledAmount = Math.max(0, convMoney.amount - coverageAmount);
                if (unsettledAmount > 0) {
                    addFlow(AppConfig.insights.liabilityErrorFallbackOffsetDays, -unsettledAmount, 'LIABILITY_OTHER');
                }
            }
        }
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
                    
                    
                    // Impact: 
                    // 1. If it's an internal transfer, net impact is 0 (money stayed within our tracked liquid/liability sphere).
                    // 2. Otherwise, if it's arriving at a liquid account, it's an inflow (+).
                    // 3. Otherwise, it must be leaving a liquid account to a non-tracked account, so it's an outflow (-).
                    const impact = isInternalTransfer
                        ? 0
                        : (isLiquidTo ? amountDefault : -amountDefault);

                    const flowType = 'PLAN_PAYMENT';

                    // Commit logic:
                    // Only commit if:
                    // 1. It's an outflow from liquid to external account (impact < 0)
                    // 2. OR it's an internal transfer from Liquid Asset to Liability (debt payment commitment)
                    const isOutflowToExternal = !isInternalTransfer && impact < 0;
                    const isDebtPaymentCommitment = isInternalTransfer && liabilityAccountIds.has(pp.toAccountId);
                    const commitAmount = (isOutflowToExternal || isDebtPaymentCommitment) ? amountDefault : undefined;

                    logger.info(`[SafeToSpend] Simulating PP ${pp.name}: impact ${impact} on day ${dayOffset} (type: ${flowType})`);
                    addFlow(dayOffset, impact, flowType, `Planned Payment: ${pp.name || 'unnamed'} (${isLiquidTo ? 'Inflow' : 'Outflow'})`, commitAmount);

                    // Income tracking
                    if (impact > 0 && !isInternalTransfer) {
                        incomeBreakdownList.push({
                            id: pp.id,
                            name: pp.name || 'Income',
                            amount: amountDefault,
                            dayOffset,
                            type: 'PLANNED_PAYMENT'
                        });
                        if (amountDefault >= MAJOR_INFLOW_THRESHOLD && (firstMajorInflowDay === null || dayOffset < firstMajorInflowDay)) {
                            firstMajorInflowDay = dayOffset;
                        }
                    }

                    // Breakdown attribution: Only for actual commitments (outflows/debt payments)
                    if (commitAmount) {
                        const accId = pp.toAccountId;
                        const acc = accountById.get(accId);
                        const existing = committedBreakdownMap.get(accId) || {
                            accountId: accId,
                            accountName: acc?.name || pp.name || 'Expense',
                            amount: 0,
                            details: [] as { id: string, name: string, amount: number, type: 'BUDGET' | 'PLANNED_PAYMENT' | 'PLANNED_JOURNAL', dayOffset?: number }[]
                        };
                        
                        existing.amount += amountDefault;
                        existing.details.push({
                            id: pp.id,
                            name: pp.name || 'unnamed',
                            amount: amountDefault,
                            type: 'PLANNED_PAYMENT',
                            dayOffset
                        });
                        committedBreakdownMap.set(accId, existing);
                        if (acc?.accountSubtype) committedSubtypesSet.add(acc.accountSubtype);
                    }

                    // Note: No longer adding to debtBreakdown here as it's now in Committed
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


                    const flowType = 'PLAN_JOURNAL';

                    // For journals, we iterate through EACH transaction (debit/credit).
                    // If it's an internal transfer, we skip individual impact because the net will be 0.
                    // If NOT internal, we count the impact on liquid cash.
                    const impact = isInternalTransfer
                        ? 0
                        : (tx.transactionType === TransactionType.DEBIT ? amountDefault : -amountDefault);

                    // Actually, for consistency with addFlow, we check if this specific tx is part of an outflowing/committing journal.
                    const isOutflowFromLiquid = !isInternalTransfer && tx.transactionType === TransactionType.CREDIT;
                    const isInternalCommitToDebt = isInternalTransfer && liabilityAccountIds.has(tx.accountId) && tx.transactionType === TransactionType.DEBIT;

                    const commitAmount = (isOutflowFromLiquid || isInternalCommitToDebt) ? amountDefault : undefined;

                    addFlow(dayOffset, impact, flowType, `Planned Journal Tx: ${journal.description} (${tx.transactionType === TransactionType.DEBIT ? 'Debit' : 'Credit'})`, commitAmount);

                    // Income tracking for journals
                    if (impact > 0 && !isInternalTransfer) {
                        incomeBreakdownList.push({
                            id: journal.id,
                            name: journal.description || 'journal',
                            amount: amountDefault,
                            dayOffset,
                            type: 'PLANNED_JOURNAL'
                        });
                        if (amountDefault >= MAJOR_INFLOW_THRESHOLD && (firstMajorInflowDay === null || dayOffset < firstMajorInflowDay)) {
                            firstMajorInflowDay = dayOffset;
                        }
                    }

                    // Breakdown attribution for journals: Only for commitments
                    if (commitAmount) {
                        const accId = tx.accountId;
                        const acc = accountById.get(accId);
                        const existing = committedBreakdownMap.get(accId) || {
                            accountId: accId,
                            accountName: acc?.name || journal.description || 'Expense',
                            amount: 0,
                            details: [] as { id: string, name: string, amount: number, type: 'BUDGET' | 'PLANNED_PAYMENT' | 'PLANNED_JOURNAL', dayOffset?: number }[]
                        };
                        existing.amount += amountDefault;
                        existing.details.push({
                            id: journal.id,
                            name: journal.description || 'journal',
                            amount: amountDefault,
                            type: 'PLANNED_JOURNAL',
                            dayOffset
                        });
                        committedBreakdownMap.set(accId, existing);
                        if (acc?.accountSubtype) committedSubtypesSet.add(acc.accountSubtype);
                    }
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
            committedBreakdown: Array.from(committedBreakdownMap.values()).sort((a, b) => b.amount - a.amount),
            debtBreakdown: Array.from(debtBreakdownMap.values()).sort((a, b) => b.amount - a.amount),
            incomeBreakdown: incomeBreakdownList.sort((a, b) => a.dayOffset - b.dayOffset),
            firstMajorInflowDay,
            committedSubtypes: Array.from(committedSubtypesSet),
            debtSubtypes: Array.from(debtSubtypesSet)
        };
    }
}

export const cashFlowSimulationService = new CashFlowSimulationService();
