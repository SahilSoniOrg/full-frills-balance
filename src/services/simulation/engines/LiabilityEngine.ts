import Account, { AccountSubtype } from '@/src/data/models/Account';

import { AppConfig } from '@/src/constants/app-config';
import { TimeContext } from '../TimeContext';
import {
  AccountCommitment,
  DebtEntry,
  DebtType,
  Flow,
  FlowSource,
  FlowType,
  LiabilityResult,
} from '../types';
import { CurrencyConverter } from './BudgetEngine';
import { getCorrespondingStatementDate, getNextDueDate } from '../utils/liabilityUtils';

export class LiabilityEngine {
  private readonly time: TimeContext;
  private readonly converter: CurrencyConverter;
  private readonly resultCurrency: string;

  constructor(time: TimeContext, converter: CurrencyConverter, resultCurrency: string) {
    this.time = time;
    this.converter = converter;
    this.resultCurrency = resultCurrency;
  }

  async run(
    liabilityBalances: { account: Account; balance: number }[],
    coverageMap: Map<string, number>,
    metadataMap: Map<string, any>,
    statementBalances: Map<string, number>,
    liquidAccountIds: Set<string>,
    orderedLiquidAccountIds: string[],
    plannedFlows: Flow[],
    preSettledAmounts: Map<string, number> = new Map(),
  ): Promise<LiabilityResult> {
    const simulationDays = this.time.getSimulationDays();
    const startOfToday = this.time.getStartOfToday();

    const flows: Flow[] = [];
    const commitmentsMap = new Map<string, AccountCommitment>();
    const debtEntries: DebtEntry[] = [];

    const result: LiabilityResult = {
      flows,
      commitments: [],
      debtEntries,
      total: 0,
      totalCreditCard: 0,
      totalOther: 0,
      committed: 0,
      committedCreditCard: 0,
      committedOther: 0,
    };

    const addLiabilityFlow = (
      acc: Account,
      amount: number,
      dayOffset: number,
      context: string,
      payFromAccountId?: string,
    ) => {
      const targetAccountId =
        payFromAccountId ||
        (orderedLiquidAccountIds.length > 0 ? orderedLiquidAccountIds[0] : acc.id);

      flows.push({
        dayOffset,
        amount: -amount,
        source: FlowSource.LIABILITY,
        type: FlowType.OUTFLOW,
        name: acc.name,
        accountId: targetAccountId,
        context,
      });

      debtEntries.push({
        accountId: acc.id,
        accountName: acc.name,
        amount,
        type: DebtType.FALLBACK,
        dayOffset,
      });

      const existing = commitmentsMap.get(acc.id) || {
        accountId: acc.id,
        accountName: acc.name,
        amount: 0,
        details: [],
      };

      existing.amount += amount;
      existing.details.push({
        id: `${acc.id}-${dayOffset}`,
        name: acc.name,
        amount,
        type: DebtType.FALLBACK,
        dayOffset,
      });
      commitmentsMap.set(acc.id, existing);
    };

    for (const lb of liabilityBalances) {
      const acc = lb.account;
      const balanceInResultCurrency = lb.balance;
      if (balanceInResultCurrency <= 0) continue;

      result.total += balanceInResultCurrency;
      if (acc.accountSubtype === AccountSubtype.CREDIT_CARD) {
        result.totalCreditCard += balanceInResultCurrency;
      } else {
        result.totalOther += balanceInResultCurrency;
      }

      const metadata = metadataMap.get(acc.id);

      // If the liability is configured to be paid from an account outside our tracked liquid pool,
      // it exerts zero pressure on our Safe to Spend cash flows. Show the total, but omit the flow commitments.
      if (metadata?.payFromAccountId && !liquidAccountIds.has(metadata.payFromAccountId)) {
        continue;
      }

      const coverageAmount = coverageMap.get(acc.id) || 0;
      const statementDay = metadata?.statementDay;
      const dueDay = metadata?.dueDay || AppConfig.insights.liabilityDefaultDueDay;

      const EPSILON = AppConfig.insights.liabilityCommitmentTolerance || 0.01;

      // Project the balance at due dates by considering planned inflows/outflows to this liability
      const accFlows = plannedFlows.filter(f => f.accountId === acc.id);

      if (acc.accountSubtype === AccountSubtype.CREDIT_CARD && statementDay) {
        const d1Date = getNextDueDate(startOfToday, dueDay);
        const d1DayOffset = d1Date.diff(startOfToday, 'day');
        const netFlowToD1 = accFlows
          .filter(f => f.dayOffset <= d1DayOffset)
          .reduce((sum, f) => sum + f.amount, 0);

        // projectedBalance = Current Balance - Net Inflow (Payments reduce balance)
        const projectedBalanceAtD1 = Math.max(0, balanceInResultCurrency - netFlowToD1);

        const s1Date = getCorrespondingStatementDate(d1Date, statementDay, dueDay);

        let amountDueAtD1 = 0;
        let amountDueAtD2 = 0;
        const isBillAvailable =
          startOfToday.isAfter(s1Date, 'day') || startOfToday.isSame(s1Date, 'day');

        if (isBillAvailable) {
          const statementBalanceRaw = statementBalances.get(acc.id) || 0;
          const convStatement = await this.converter.convert(
            Math.abs(statementBalanceRaw),
            acc.currencyCode || this.resultCurrency,
            this.resultCurrency,
          );

          const preSettled = preSettledAmounts.get(acc.id) || 0;
          const remainingStatement = Math.max(0, convStatement - preSettled);

          // Capped Bill amount for D1
          amountDueAtD1 = Math.min(projectedBalanceAtD1, remainingStatement);
          // Any remaining balance after satisfying the immediate bill statement is pushed to the NEXT cycle D2
          amountDueAtD2 = Math.max(0, projectedBalanceAtD1 - amountDueAtD1);
        } else {
          // Statement hasn't occurred yet.
          // ALL spending exists but isn't officially 'billed' for money-out-the-door planning until the next cycle.
          amountDueAtD1 = 0;
          amountDueAtD2 = projectedBalanceAtD1;
        }

        const coverageForD1 = Math.min(coverageAmount, amountDueAtD1);
        const coverageForD2 = Math.min(Math.max(0, coverageAmount - coverageForD1), amountDueAtD2);

        if (amountDueAtD1 > EPSILON) {
          const unsettled = Math.max(0, amountDueAtD1 - coverageForD1);
          if (unsettled > EPSILON) {
            addLiabilityFlow(
              acc,
              unsettled,
              d1DayOffset,
              'Current bill',
              metadata?.payFromAccountId,
            );
            result.committed += unsettled;
            result.committedCreditCard += unsettled;
          }
        }

        if (amountDueAtD2 > EPSILON) {
          const unsettled = Math.max(0, amountDueAtD2 - coverageForD2);
          if (unsettled > EPSILON) {
            const d2Date = d1Date.add(1, 'month');
            const d2DayOffset = d2Date.diff(startOfToday, 'day');

            // Recalculate projected balance for D2
            const netFlowToD2 = accFlows
              .filter(f => f.dayOffset <= d2DayOffset)
              .reduce((sum, f) => sum + f.amount, 0);
            const projectedBalanceAtD2 = Math.max(0, balanceInResultCurrency - netFlowToD2);

            // Adjust unsettled by what's actually remaining at D2 (excluding D1 portion)
            const remainingActuallyAtD2 = Math.max(0, projectedBalanceAtD2 - amountDueAtD1);
            const effectiveUnsettled = Math.min(unsettled, remainingActuallyAtD2);

            if (d2DayOffset < simulationDays && effectiveUnsettled > EPSILON) {
              addLiabilityFlow(
                acc,
                effectiveUnsettled,
                d2DayOffset,
                'Unbilled spending', // Changed from 'Future spending' to be more descriptive
                metadata?.payFromAccountId,
              );
              result.committed += effectiveUnsettled;
              result.committedCreditCard += effectiveUnsettled;
            }
          }
        }
      } else {
        const deductionDay =
          metadata?.dueDay || metadata?.emiDay || AppConfig.insights.liabilityFallbackDeductionDay;
        const targetDate = getNextDueDate(startOfToday, deductionDay);
        const dayOffset = targetDate.diff(startOfToday, 'day');

        const netFlowToTarget = accFlows
          .filter(f => f.dayOffset <= dayOffset)
          .reduce((sum, f) => sum + f.amount, 0);

        const projectedBalanceAtTarget = Math.max(0, balanceInResultCurrency - netFlowToTarget);
        const unsettledAmount = Math.max(0, projectedBalanceAtTarget - coverageAmount);

        if (unsettledAmount > EPSILON) {
          if (dayOffset < simulationDays) {
            addLiabilityFlow(
              acc,
              unsettledAmount,
              dayOffset,
              'Unsettled',
              metadata?.payFromAccountId,
            );
            result.committed += unsettledAmount;
            result.committedOther += unsettledAmount;
          }
        }
      }
    }

    result.commitments = Array.from(commitmentsMap.values());
    return result;
  }
}
