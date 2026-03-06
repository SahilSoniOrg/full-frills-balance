import Account, { AccountSubtype } from '@/src/data/models/Account';
import Journal from '@/src/data/models/Journal';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import { TransactionType } from '@/src/data/models/Transaction';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { logger } from '@/src/utils/logger';
import dayjs from 'dayjs';

export class CashFlowSimulationService {
    /**
     * 30-day cash flow simulation for Safe to Spend.
     */
    async simulateSafeToSpend(
        startingBalance: number,
        dailyBudgetBurn: number,
        plannedPayments: PlannedPayment[],
        plannedJournals: Journal[],
        liquidAssetIds: string[],
        liabilityAccountBalances: { account: Account, balance: number }[],
        budgetCoveredExpenseAccountIds: Set<string>,
        resultCurrency: string,
    ): Promise<{
        safeToSpend: number;
        totalFutureObligations: number;
        totalFutureInflow: number;
        committedPlanned: number;
        committedPlannedPayments: number;
        committedPlannedJournals: number;
        totalLiabilities: number;
        totalLiabilitiesCC: number;
        totalLiabilitiesOther: number;
    }> {
        const now = dayjs().startOf('day');
        const SIMULATION_DAYS = 30;

        const {
            flowByDayOffset,
            effectiveDailyDrain,
            totalFutureObligations,
            totalFutureInflow,
            committedPlanned,
            committedPlannedPayments,
            committedPlannedJournals,
            totalLiabilities,
            totalLiabilitiesCC,
            totalLiabilitiesOther
        } = await this.getSimulationFlows(
            SIMULATION_DAYS,
            now,
            dailyBudgetBurn,
            plannedPayments,
            plannedJournals,
            new Set(liquidAssetIds),
            liabilityAccountBalances,
            budgetCoveredExpenseAccountIds,
            resultCurrency
        );

        let currentBalance = startingBalance;
        let minBalance = startingBalance;

        for (let d = 1; d <= SIMULATION_DAYS; d++) {
            currentBalance -= effectiveDailyDrain;
            currentBalance += flowByDayOffset.get(d) || 0;
            if (currentBalance < minBalance) minBalance = currentBalance;
        }

        return {
            safeToSpend: Math.max(0, minBalance),
            totalFutureObligations,
            totalFutureInflow,
            committedPlanned,
            committedPlannedPayments,
            committedPlannedJournals,
            totalLiabilities,
            totalLiabilitiesCC,
            totalLiabilitiesOther
        };
    }

    async getSimulationFlows(
        simulationDays: number,
        now: dayjs.Dayjs,
        dailyBudgetBurn: number,
        plannedPayments: PlannedPayment[],
        plannedJournals: Journal[],
        liquidAccountIds: Set<string>,
        liabilityAccountBalances: { account: Account, balance: number }[],
        budgetCoveredExpenseAccountIds: Set<string>,
        resultCurrency: string,
    ): Promise<{
        flowByDayOffset: Map<number, number>,
        organicNetFlow: number,
        effectiveDailyDrain: number,
        totalFutureObligations: number,
        totalFutureInflow: number,
        committedPlanned: number,
        committedPlannedPayments: number,
        committedPlannedJournals: number,
        totalLiabilities: number,
        totalLiabilitiesCC: number,
        totalLiabilitiesOther: number
    }> {
        const flowByDayOffset = new Map<number, number>();
        let totalFutureObligations = 0;
        let totalFutureInflow = 0;
        let committedPlanned = 0;
        let committedPlannedPayments = 0;
        let committedPlannedJournals = 0;
        let totalLiabilitiesSum = 0;
        let totalLiabilitiesCC = 0;
        let totalLiabilitiesOther = 0;

        const addFlow = (dayOffset: number, amount: number, type: 'PLAN_PAYMENT' | 'PLAN_JOURNAL' | 'LIABILITY_CC' | 'LIABILITY_OTHER' | 'DAILY_BUDGET' | 'OTHER' = 'OTHER', context?: string) => {
            if (dayOffset < 0 || dayOffset > simulationDays) return;
            const current = flowByDayOffset.get(dayOffset) || 0;
            flowByDayOffset.set(dayOffset, current + amount);

            if (amount < 0) totalFutureObligations += Math.abs(amount);
            if (amount > 0) totalFutureInflow += amount;

            if (amount < 0) {
                if (type === 'PLAN_PAYMENT') {
                    committedPlannedPayments += Math.abs(amount);
                    committedPlanned += Math.abs(amount);
                    logger.info(`[SafeToSpend] Committed: ${context || 'Planned'} impact ${amount} on day ${dayOffset}`);
                } else if (type === 'PLAN_JOURNAL') {
                    committedPlannedJournals += Math.abs(amount);
                    committedPlanned += Math.abs(amount);
                    logger.info(`[SafeToSpend] Committed: ${context || 'Planned'} impact ${amount} on day ${dayOffset}`);
                } else if (type === 'LIABILITY_CC') {
                    totalLiabilitiesCC += Math.abs(amount);
                } else if (type === 'LIABILITY_OTHER') {
                    totalLiabilitiesOther += Math.abs(amount);
                }
            }

            if (context && type !== 'PLAN_PAYMENT' && type !== 'PLAN_JOURNAL') {
                logger.info(`[SafeToSpend] Flow: ${context} impact ${amount} on day ${dayOffset}`);
            }
        };

        const effectiveDailyDrain = dailyBudgetBurn;
        totalFutureObligations += Math.max(0, dailyBudgetBurn * simulationDays);

        const manualPaymentAccountIds = new Set<string>();
        for (const pp of plannedPayments) manualPaymentAccountIds.add(pp.toAccountId);
        if (plannedJournals.length > 0) {
            const plannedTxs = await transactionRepository.findByJournals(plannedJournals.map(j => j.id));
            for (const tx of plannedTxs) manualPaymentAccountIds.add(tx.accountId);
        }

        for (const { account, balance } of liabilityAccountBalances) {
            if (balance <= 0) continue;
            totalLiabilitiesSum += balance;

            if (manualPaymentAccountIds.has(account.id)) {
                continue;
            }

            try {
                const metadataRecords = await account.metadataRecords.fetch();
                const metadata = metadataRecords[0];

                const today = now.date();
                const statementDay = metadata?.statementDay;
                const dueDay = metadata?.dueDay || 20;

                if (account.accountSubtype === AccountSubtype.CREDIT_CARD && statementDay) {
                    let deductionAmount = balance;
                    let targetDueDate: dayjs.Dayjs;

                    if (today > statementDay) {
                        const statementDate = now.date(statementDay).startOf('day').valueOf();
                        const balancesAtStatement = await transactionRawRepository.getLatestBalancesRaw([account.id], statementDate);
                        const statementBalance = Math.abs(balancesAtStatement.get(account.id) || 0);
                        deductionAmount = statementBalance;
                        targetDueDate = now.date(dueDay);
                        if (dueDay <= today) {
                            targetDueDate = targetDueDate.add(1, 'month');
                        }
                    } else {
                        deductionAmount = balance;
                        targetDueDate = now.date(dueDay).add(1, 'month');
                    }

                    const dayOffset = targetDueDate.startOf('day').diff(now, 'day');
                    addFlow(dayOffset, -deductionAmount, 'LIABILITY_CC', `Liability: ${account.name} (Credit Card Statement)`);
                } else {
                    let deductionDay = metadata?.dueDay || metadata?.emiDay || 28;
                    let targetDate = now.date(deductionDay);
                    if (deductionDay <= today) {
                        targetDate = targetDate.add(1, 'month');
                    }
                    const dayOffset = targetDate.startOf('day').diff(now, 'day');
                    addFlow(dayOffset, -balance, 'LIABILITY_OTHER', `Liability: ${account.name} (Other)`);
                }
            } catch (e) {
                logger.error('getSimulationFlows: liability metadata failed', e);
                addFlow(15, -balance, 'LIABILITY_OTHER');
            }
        }

        const endMs = now.add(simulationDays, 'day').valueOf();
        const nowMs = now.valueOf();
        const journalCoveredPPIds = new Set<string>(plannedJournals.map(pj => pj.plannedPaymentId).filter((id): id is string => Boolean(id)));

        for (const pp of plannedPayments) {
            if (journalCoveredPPIds.has(pp.id)) continue;
            if (budgetCoveredExpenseAccountIds.has(pp.toAccountId)) continue;

            const isLiquidFrom = liquidAccountIds.has(pp.fromAccountId);
            const isLiquidTo = liquidAccountIds.has(pp.toAccountId);
            if ((isLiquidFrom && isLiquidTo) || (!isLiquidFrom && !isLiquidTo)) continue;

            let curr = pp.nextOccurrence;
            while (curr <= endMs) {
                if (curr > nowMs) {
                    const dayOffset = dayjs(curr).startOf('day').diff(now, 'day');
                    let amount = pp.amount;
                    if (pp.currencyCode && pp.currencyCode !== resultCurrency) {
                        try {
                            const { convertedAmount } = await exchangeRateService.convert(amount, pp.currencyCode, resultCurrency);
                            amount = convertedAmount;
                        } catch { }
                    }
                    const impact = isLiquidTo ? amount : -amount;
                    addFlow(dayOffset, impact, 'PLAN_PAYMENT', `Planned Payment: ${pp.description || 'unnamed'} (${isLiquidTo ? 'Inflow' : 'Outflow'})`);
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

                // Identify which transactions touch liquid accounts
                const liquidTxs = journalTxs.filter(tx => liquidAccountIds.has(tx.accountId));

                // Skip internal transfers (liquid-to-liquid) or non-liquid journals
                if (liquidTxs.length === 0 || journalTxs.every(tx => liquidAccountIds.has(tx.accountId))) continue;

                // Skip budget-covered (avoid double counting with dailyBudgetBurn)
                // If any side of the journal is for a budgeted expense, we skip it
                if (journalTxs.some(tx => budgetCoveredExpenseAccountIds.has(tx.accountId))) {
                    logger.info(`[SafeToSpend] Skipping budget-covered journal: ${journal.description}`);
                    continue;
                }

                for (const tx of liquidTxs) {
                    const occurrenceMs = journal.journalDate;
                    if (occurrenceMs <= nowMs || occurrenceMs > endMs) continue;

                    const dayOffset = dayjs(occurrenceMs).startOf('day').diff(now, 'day');
                    let amount = tx.amount;
                    if (tx.currencyCode && tx.currencyCode !== resultCurrency) {
                        try {
                            const { convertedAmount } = await exchangeRateService.convert(amount, tx.currencyCode, resultCurrency);
                            amount = convertedAmount;
                        } catch { }
                    }
                    const impact = tx.transactionType === TransactionType.DEBIT ? amount : -amount;
                    addFlow(dayOffset, impact, 'PLAN_JOURNAL', `Planned Journal Tx: ${journal.description} (${tx.transactionType === TransactionType.DEBIT ? 'Debit' : 'Credit'})`);
                }
            }
        }

        return {
            flowByDayOffset,
            organicNetFlow: 0,
            effectiveDailyDrain,
            totalFutureObligations,
            totalFutureInflow,
            committedPlanned,
            committedPlannedPayments,
            committedPlannedJournals,
            totalLiabilities: totalLiabilitiesSum,
            totalLiabilitiesCC,
            totalLiabilitiesOther
        };
    }
}

export const cashFlowSimulationService = new CashFlowSimulationService();
