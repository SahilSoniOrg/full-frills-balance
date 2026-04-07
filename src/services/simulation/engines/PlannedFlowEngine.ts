import Account from '@/src/data/models/Account';
import Journal from '@/src/data/models/Journal';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import { TransactionType } from '@/src/data/models/Transaction';
import { getLiquidNetWorthDelta } from '@/src/utils/accountingHelpers';
import dayjs from 'dayjs';
import { TimeContext } from '../TimeContext';
import {
  AccountCommitment,
  DebtType,
  Flow,
  FlowSource,
  FlowType,
  IncomeEntry,
  PlannedFlowResult,
  PlannedOutflow,
} from '../types';
import { CurrencyConverter } from './BudgetEngine';

export class PlannedFlowEngine {
  private readonly time: TimeContext;
  private readonly converter: CurrencyConverter;
  private readonly resultCurrency: string;

  constructor(time: TimeContext, converter: CurrencyConverter, resultCurrency: string) {
    this.time = time;
    this.converter = converter;
    this.resultCurrency = resultCurrency;
  }

  async run(
    plannedPayments: PlannedPayment[],
    plannedJournals: Journal[],
    liquidAccountIds: Set<string>,
    liabilityAccountIds: Set<string>,
    accountMap: Map<string, Account>,
    journalTransactionsMap: Map<string, any[]>,
    liabilityInitialBalances: Map<string, number>,
  ): Promise<PlannedFlowResult> {
    const coverageMap = new Map<string, number>();
    const flows: Flow[] = [];
    const plannedOutflows: PlannedOutflow[] = [];
    const commitmentsMap = new Map<string, AccountCommitment>();
    const income: IncomeEntry[] = [];
    let organicInflow = 0;
    let organicOutflow = 0;

    const currentLiabilityBalances = new Map<string, number>(liabilityInitialBalances);

    const addFlow = (flow: Flow) => {
      flows.push(flow);
      if (flow.amount > 0) {
        organicInflow += flow.amount;
      } else if (flow.amount < 0) {
        organicOutflow += Math.abs(flow.amount);
      }
    };

    const addCommitment = (
      accountId: string,
      acc: Account | undefined,
      name: string,
      amount: number,
      dayOffset: number,
      id: string,
      type: DebtType,
    ) => {
      if (amount <= 0) return;
      const existing = commitmentsMap.get(accountId) || {
        accountId,
        accountName: acc?.name || name || 'Expense',
        amount: 0,
        details: [],
      };

      existing.amount += amount;
      existing.details.push({ id, name: name || 'unnamed', amount, type, dayOffset });
      commitmentsMap.set(accountId, existing);
    };

    // Process Planned Payments
    for (const pp of plannedPayments) {
      const isLiquidFrom =
        liquidAccountIds.has(pp.fromAccountId) || liabilityAccountIds.has(pp.fromAccountId);
      const isLiquidTo =
        liquidAccountIds.has(pp.toAccountId) || liabilityAccountIds.has(pp.toAccountId);

      const isDebtPayment = liabilityAccountIds.has(pp.toAccountId);

      let curr = pp.nextOccurrence;
      while (curr <= this.time.getEndMs()) {
        if (this.time.isFuture(curr)) {
          const rawAmount = await this.converter.convert(
            pp.amount,
            pp.currencyCode || this.resultCurrency,
            this.resultCurrency,
          );
          const dayOffset = this.time.getDayOffset(curr);

          let amountInDefault = rawAmount;

          // 1. Capping for Debt Payments (Internal Transfers only)
          if (isDebtPayment && isLiquidFrom) {
            const remaining = currentLiabilityBalances.get(pp.toAccountId) || 0;
            // Cap the payment to the remaining debt balance
            amountInDefault = Math.max(0, Math.min(rawAmount, remaining));
            currentLiabilityBalances.set(pp.toAccountId, remaining - amountInDefault);

            // Build Coverage Map for LiabilityEngine
            coverageMap.set(
              pp.toAccountId,
              (coverageMap.get(pp.toAccountId) || 0) + amountInDefault,
            );
          } else if (isDebtPayment) {
            // External income to a debt account - reduces balance but doesn't cap the flow
            const remaining = currentLiabilityBalances.get(pp.toAccountId) || 0;
            currentLiabilityBalances.set(pp.toAccountId, remaining - rawAmount);
          }

          if (amountInDefault > 0) {
            // 2. Add Flows for both sides if tracked
            if (isLiquidFrom) {
              addFlow({
                dayOffset,
                amount: -amountInDefault,
                source: FlowSource.PLANNED_PAYMENT,
                type: FlowType.OUTFLOW,
                name: pp.name || 'Planned Payment',
                accountId: pp.fromAccountId,
                sourceAccountId: pp.fromAccountId,
                targetAccountId: pp.toAccountId,
                id: pp.id,
              });

              // Add to commitments and track as planned outflow for budget reconciliation
              addCommitment(
                pp.toAccountId,
                accountMap.get(pp.toAccountId),
                pp.name,
                amountInDefault,
                dayOffset,
                pp.id,
                DebtType.PLANNED_PAYMENT,
              );
              plannedOutflows.push({
                dayOffset,
                accountId: pp.toAccountId,
                amount: -amountInDefault,
              });
            }

            if (isLiquidTo) {
              addFlow({
                dayOffset,
                amount: amountInDefault,
                source: FlowSource.PLANNED_PAYMENT,
                type: FlowType.INFLOW,
                name: pp.name || 'Planned Payment',
                accountId: pp.toAccountId,
                sourceAccountId: pp.fromAccountId,
                targetAccountId: pp.toAccountId,
                id: pp.id,
              });

              if (!isLiquidFrom) {
                income.push({
                  id: pp.id,
                  name: pp.name || 'Planned Payment',
                  amount: amountInDefault,
                  dayOffset,
                  type: FlowSource.PLANNED_PAYMENT,
                });
              }
            }
          }
        }
        curr = this.getNextOccurrence(curr, pp);
      }
    }

    // Process Planned Journals
    for (const journal of plannedJournals) {
      const journalTxs = journalTransactionsMap.get(journal.id) || [];

      for (const tx of journalTxs) {
        const isLiquid =
          liquidAccountIds.has(tx.accountId) || liabilityAccountIds.has(tx.accountId);
        if (!isLiquid) continue;

        const occurrenceMs = journal.journalDate;
        if (!this.time.isWithinSimulation(occurrenceMs)) continue;

        const rawAmount = await this.converter.convert(
          tx.amount,
          tx.currencyCode || this.resultCurrency,
          this.resultCurrency,
        );
        const dayOffset = this.time.getDayOffset(occurrenceMs);

        let amountInDefault = rawAmount;
        const isLiability = liabilityAccountIds.has(tx.accountId);

        // 1. Liability Balance Tracking & Capping
        if (isLiability) {
          const remaining = currentLiabilityBalances.get(tx.accountId) || 0;
          if (tx.transactionType === TransactionType.DEBIT) {
            // Debt Payment (Inflow to CC)
            amountInDefault = Math.max(0, Math.min(rawAmount, remaining));
            currentLiabilityBalances.set(tx.accountId, remaining - amountInDefault);
            coverageMap.set(tx.accountId, (coverageMap.get(tx.accountId) || 0) + amountInDefault);
          } else {
            // Debt Spending (Outflow from CC)
            currentLiabilityBalances.set(tx.accountId, remaining + rawAmount);
          }
        }

        if (amountInDefault === 0 && rawAmount > 0) continue;

        // 2. Flows and Commitments
        const acc = accountMap.get(tx.accountId);
        const impact = acc
          ? getLiquidNetWorthDelta(amountInDefault, acc.accountType, tx.transactionType)
          : tx.transactionType === TransactionType.DEBIT
            ? amountInDefault
            : -amountInDefault;

        addFlow({
          dayOffset,
          amount: impact,
          source: FlowSource.PLANNED_JOURNAL,
          type: impact > 0 ? FlowType.INFLOW : FlowType.OUTFLOW,
          name: journal.description || 'Planned Journal',
          accountId: tx.accountId,
          sourceAccountId: impact < 0 ? tx.accountId : undefined,
          targetAccountId: impact > 0 ? tx.accountId : undefined,
          id: journal.id,
        });

        if (impact < 0) {
          if (tx.transactionType === TransactionType.CREDIT) {
            addCommitment(
              tx.accountId,
              acc,
              journal.description || 'Planned Journal',
              amountInDefault,
              dayOffset,
              journal.id,
              DebtType.PLANNED_JOURNAL,
            );
          }
          plannedOutflows.push({
            dayOffset,
            accountId: tx.accountId,
            amount: impact,
          });
        } else if (impact > 0) {
          // If it's a debt payment, it might have come from somewhere else.
          // For simplicity, we only track it as "Income" in the UI if it's NOT a debt payment or if it's from an external source.
          // But PlannedFlowResult.income is mostly used for the "Income" list in the UI.
          const isInternalTransfer = journalTxs.some(
            otherTx =>
              otherTx.id !== tx.id &&
              (liquidAccountIds.has(otherTx.accountId) ||
                liabilityAccountIds.has(otherTx.accountId)),
          );
          if (!isInternalTransfer || !isLiability) {
            income.push({
              id: journal.id,
              name: journal.description || 'Planned Journal',
              amount: amountInDefault,
              dayOffset,
              type: FlowSource.PLANNED_JOURNAL,
            });
          }
        }
      }
    }

    return {
      flows,
      plannedOutflows,
      commitments: Array.from(commitmentsMap.values()),
      income,
      organicInflow,
      organicOutflow,
      coverageMap,
    };
  }

  private getNextOccurrence(curr: number, pp: PlannedPayment): number {
    const intervalN = pp.intervalN || 1;
    const base = dayjs(curr);

    switch (pp.intervalType) {
      case 'DAILY':
        return base.add(intervalN, 'day').valueOf();
      case 'WEEKLY':
        return base.add(intervalN, 'week').valueOf();
      case 'MONTHLY':
        return base.add(intervalN, 'month').valueOf();
      case 'YEARLY':
        return base.add(intervalN, 'year').valueOf();
      default:
        return base.add(intervalN, 'day').valueOf();
    }
  }
}
