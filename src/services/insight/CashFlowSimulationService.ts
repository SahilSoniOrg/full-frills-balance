import { AppConfig } from '@/src/constants';
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
     * Configured-day cash flow simulation for Safe to Spend.
     */
    async simulateSafeToSpend(
        startingBalance: number,
        dailyBudgetBurn: number | number[],
        plannedPayments: PlannedPayment[],
        plannedJournals: Journal[],
        liquidAssetIds: string[],
        liabilityAccountBalances: { account: Account, balance: number }[],
        budgetCoveredExpenseAccountIds: Set<string>,
        resultCurrency: string,
    ): Promise<{
        safeToSpend: number;
        totalFutureInflow: number;
        committedPlanned: number;
        committedPlannedPayments: number;
        committedPlannedJournals: number;
        committedLiabilities: number;
        committedLiabilitiesCC: number;
        committedLiabilitiesOther: number;
        totalLiabilities: number;
        totalLiabilitiesCC: number;
        totalLiabilitiesOther: number;
    }> {
        const now = dayjs().startOf('day');
        const SIMULATION_DAYS = AppConfig.defaults.safeToSpendDays;

        const {
            flowByDayOffset,
            effectiveDailyDrain,
            totalFutureInflow,
            committedPlanned,
            committedPlannedPayments,
            committedPlannedJournals,
            committedLiabilities,
            committedLiabilitiesCC,
            committedLiabilitiesOther,
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

        // Only liability payments due inside the simulation window reduce spendable cash.
        // Outstanding balances remain informational unless a due payment is scheduled.
        let currentBalance = startingBalance;
        let minBalance = currentBalance;

        for (let d = 0; d < SIMULATION_DAYS; d++) {
            const drain = Array.isArray(effectiveDailyDrain) ? (effectiveDailyDrain[d] || 0) : effectiveDailyDrain;
            currentBalance -= drain;
            currentBalance += flowByDayOffset.get(d) || 0;
            if (currentBalance < minBalance) minBalance = currentBalance;
        }

        return {
            safeToSpend: Math.max(0, minBalance),
            totalFutureInflow,
            committedPlanned,
            committedPlannedPayments,
            committedPlannedJournals,
            committedLiabilities,
            committedLiabilitiesCC,
            committedLiabilitiesOther,
            totalLiabilities,
            totalLiabilitiesCC,
            totalLiabilitiesOther
        };
    }

    async getSimulationFlows(
        simulationDays: number,
        now: dayjs.Dayjs,
        dailyBudgetBurn: number | number[],
        plannedPayments: PlannedPayment[],
        plannedJournals: Journal[],
        liquidAccountIds: Set<string>,
        liabilityAccountBalances: { account: Account, balance: number }[],
        budgetCoveredExpenseAccountIds: Set<string>,
        resultCurrency: string,
    ): Promise<{
        flowByDayOffset: Map<number, number>,
        organicNetFlow: number,
        effectiveDailyDrain: number | number[],
        totalFutureInflow: number,
        committedPlanned: number,
        committedPlannedPayments: number,
        committedPlannedJournals: number,
        committedLiabilities: number,
        committedLiabilitiesCC: number,
        committedLiabilitiesOther: number,
        totalLiabilities: number,
        totalLiabilitiesCC: number,
        totalLiabilitiesOther: number
    }> {
        const flowByDayOffset = new Map<number, number>();
        let totalFutureInflow = 0;
        let committedPlanned = 0;
        let committedPlannedPayments = 0;
        let committedPlannedJournals = 0;
        let committedLiabilities = 0;
        let committedLiabilitiesCC = 0;
        let committedLiabilitiesOther = 0;
        let totalLiabilitiesSum = 0;
        let totalLiabilitiesCC = 0;
        let totalLiabilitiesOther = 0;

        const liabilityAccountIds = new Set(liabilityAccountBalances.map(lb => lb.account.id));
        const liabilityAccountSubtypes = new Map(liabilityAccountBalances.map(lb => [lb.account.id, lb.account.accountSubtype]));

        const addFlow = (dayOffset: number, amount: number, type: 'PLAN_PAYMENT' | 'PLAN_JOURNAL' | 'LIABILITY_CC' | 'LIABILITY_OTHER' | 'DAILY_BUDGET' | 'OTHER' = 'OTHER', context?: string, commitAmount?: number) => {
            if (dayOffset < 0 || dayOffset > simulationDays) return;
            const current = flowByDayOffset.get(dayOffset) || 0;
            flowByDayOffset.set(dayOffset, current + amount);

            if (amount > 0) totalFutureInflow += amount;

            const effectiveCommit = commitAmount ?? (amount < 0 ? Math.abs(amount) : 0);

            if (effectiveCommit > 0) {
                if (type === 'PLAN_PAYMENT' || type === 'PLAN_JOURNAL') {
                    if (type === 'PLAN_PAYMENT') committedPlannedPayments += effectiveCommit;
                    if (type === 'PLAN_JOURNAL') committedPlannedJournals += effectiveCommit;
                    committedPlanned += effectiveCommit;
                    logger.info(`[SafeToSpend] Committed: ${context || 'Planned'} impact ${effectiveCommit} on day ${dayOffset}`);
                } else if (type === 'LIABILITY_CC' || type === 'LIABILITY_OTHER') {
                    committedLiabilities += effectiveCommit;
                    if (type === 'LIABILITY_CC') {
                        committedLiabilitiesCC += effectiveCommit;
                    } else {
                        committedLiabilitiesOther += effectiveCommit;
                    }
                    logger.info(`[SafeToSpend] Committed: ${context || 'Liability'} impact ${effectiveCommit} on day ${dayOffset}`);
                }
            }

            if (context && type !== 'PLAN_PAYMENT' && type !== 'PLAN_JOURNAL') {
                logger.info(`[SafeToSpend] Flow: ${context} impact ${amount} on day ${dayOffset}`);
            }
        };

        const effectiveDailyDrain = dailyBudgetBurn;

        const manualPaymentAccountIds = new Set<string>();
        for (const pp of plannedPayments) manualPaymentAccountIds.add(pp.toAccountId);
        if (plannedJournals.length > 0) {
            const plannedTxs = await transactionRepository.findByJournals(plannedJournals.map(j => j.id));
            for (const tx of plannedTxs) manualPaymentAccountIds.add(tx.accountId);
        }

        for (const { account, balance } of liabilityAccountBalances) {
            if (balance <= 0) continue;
            totalLiabilitiesSum += balance;
            if (account.accountSubtype === AccountSubtype.CREDIT_CARD) {
                totalLiabilitiesCC += balance;
            } else {
                totalLiabilitiesOther += balance;
            }

            if (manualPaymentAccountIds.has(account.id)) {
                continue;
            }

            try {
                const metadataRecords = account.metadataRecords
                    ? await account.metadataRecords.fetch()
                    : [];
                const metadata = metadataRecords[0];

                const today = now.date();
                const statementDay = metadata?.statementDay;
                const dueDay = metadata?.dueDay || AppConfig.insights.liabilityDefaultDueDay;

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
                    let deductionDay = metadata?.dueDay || metadata?.emiDay || AppConfig.insights.liabilityFallbackDeductionDay;
                    let targetDate = now.date(deductionDay);
                    if (deductionDay <= today) {
                        targetDate = targetDate.add(1, 'month');
                    }
                    const dayOffset = targetDate.startOf('day').diff(now, 'day');
                    addFlow(dayOffset, -balance, 'LIABILITY_OTHER', `Liability: ${account.name} (Other)`);
                }
            } catch (e) {
                logger.error('getSimulationFlows: liability metadata failed', e);
                addFlow(AppConfig.insights.liabilityErrorFallbackOffsetDays, -balance, 'LIABILITY_OTHER');
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
                    let amount = pp.amount;
                    if (pp.currencyCode && pp.currencyCode !== resultCurrency) {
                        try {
                            const { convertedAmount } = await exchangeRateService.convert(amount, pp.currencyCode, resultCurrency);
                            amount = convertedAmount;
                        } catch { }
                    }
                    const isDebtOutflow = liabilityAccountIds.has(pp.toAccountId);
                    const impact = isDebtOutflow
                        ? -amount
                        : (isInternalTransfer ? 0 : (isLiquidTo ? amount : -amount));
                    const flowType = isDebtOutflow ?
                        (liabilityAccountSubtypes.get(pp.toAccountId) === AccountSubtype.CREDIT_CARD ? 'LIABILITY_CC' : 'LIABILITY_OTHER')
                        : 'PLAN_PAYMENT';

                    // Liability payments reduce liquid cash even when the destination is another tracked account.
                    const commitAmount = (isInternalTransfer && isDebtOutflow) ? amount : undefined;

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
                    let amount = tx.amount;
                    if (tx.currencyCode && tx.currencyCode !== resultCurrency) {
                        try {
                            const { convertedAmount } = await exchangeRateService.convert(amount, tx.currencyCode, resultCurrency);
                            amount = convertedAmount;
                        } catch { }
                    }

                    const otherSideAccountId = journalTxs.find(otx => otx.accountId !== tx.accountId)?.accountId;
                    const isDebtOutflow = otherSideAccountId && liabilityAccountIds.has(otherSideAccountId);

                    const flowType = isDebtOutflow ?
                        (liabilityAccountSubtypes.get(otherSideAccountId) === AccountSubtype.CREDIT_CARD ? 'LIABILITY_CC' : 'LIABILITY_OTHER')
                        : 'PLAN_JOURNAL';

                    const impact = (isInternalTransfer && isDebtOutflow)
                        ? (tx.transactionType === TransactionType.CREDIT ? -amount : 0)
                        : (isInternalTransfer ? 0 : (tx.transactionType === TransactionType.DEBIT ? amount : -amount));

                    // Similarly to PP, internal transfers to debt should be tracked for commitment display.
                    const commitAmount = (isInternalTransfer && isDebtOutflow && tx.transactionType === TransactionType.CREDIT) ? amount : undefined;

                    addFlow(dayOffset, impact, flowType, `Planned Journal Tx: ${journal.description} (${tx.transactionType === TransactionType.DEBIT ? 'Debit' : 'Credit'})`, commitAmount);
                }
            }
        }

        return {
            flowByDayOffset,
            organicNetFlow: 0,
            effectiveDailyDrain,
            totalFutureInflow,
            committedPlanned,
            committedPlannedPayments,
            committedPlannedJournals,
            committedLiabilities,
            committedLiabilitiesCC,
            committedLiabilitiesOther,
            totalLiabilities: totalLiabilitiesSum,
            totalLiabilitiesCC,
            totalLiabilitiesOther
        };
    }
}

export const cashFlowSimulationService = new CashFlowSimulationService();
