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
  ): Promise<PlannedFlowResult> {
    const coverageMap = new Map<string, number>();
    const flows: Flow[] = [];
    const plannedOutflows: PlannedOutflow[] = [];
    const commitmentsMap = new Map<string, AccountCommitment>();
    const income: IncomeEntry[] = [];
    let organicInflow = 0;
    let organicOutflow = 0;

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

      if (!isLiquidFrom && !isLiquidTo) continue;

      const isInternalTransfer = isLiquidFrom && isLiquidTo;
      const isDebtPayment = liabilityAccountIds.has(pp.toAccountId);

      let curr = pp.nextOccurrence;
      while (curr <= this.time.getEndMs()) {
        if (this.time.isFuture(curr)) {
          const amountInDefault = await this.converter.convert(
            pp.amount,
            pp.currencyCode || this.resultCurrency,
            this.resultCurrency,
          );
          const dayOffset = this.time.getDayOffset(curr);

          // 1. Build Coverage Map for LiabilityEngine
          if (isDebtPayment) {
            coverageMap.set(
              pp.toAccountId,
              (coverageMap.get(pp.toAccountId) || 0) + amountInDefault,
            );
          }

          // 2. Add Flows and Commitments
          if (isInternalTransfer) {
            if (isDebtPayment) {
              addCommitment(
                pp.toAccountId,
                accountMap.get(pp.toAccountId),
                pp.name,
                amountInDefault,
                dayOffset,
                pp.id,
                DebtType.PLANNED_PAYMENT,
              );
            }
          } else {
            const impact = isLiquidTo ? amountInDefault : -amountInDefault;
            const accountIdForFlow = impact < 0 ? pp.fromAccountId : pp.toAccountId;

            addFlow({
              dayOffset,
              amount: impact,
              source: FlowSource.PLANNED_PAYMENT,
              type: impact > 0 ? FlowType.INFLOW : FlowType.OUTFLOW,
              name: pp.name || 'Planned Payment',
              accountId: accountIdForFlow,
              id: pp.id,
            });

            if (impact < 0) {
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
                accountId: pp.toAccountId, // Use the destination mapped account for Budget constraints!
                amount: impact,
              });
            } else {
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
        curr = this.getNextOccurrence(curr, pp);
      }
    }

    // Process Planned Journals
    for (const journal of plannedJournals) {
      const journalTxs = journalTransactionsMap.get(journal.id) || [];
      const isInternalTransfer = journalTxs.every(
        tx => liquidAccountIds.has(tx.accountId) || liabilityAccountIds.has(tx.accountId),
      );

      for (const tx of journalTxs) {
        const isLiquid =
          liquidAccountIds.has(tx.accountId) || liabilityAccountIds.has(tx.accountId);
        if (!isLiquid) continue;

        const occurrenceMs = journal.journalDate;
        if (!this.time.isWithinSimulation(occurrenceMs)) continue;

        const amountInDefault = await this.converter.convert(
          tx.amount,
          tx.currencyCode || this.resultCurrency,
          this.resultCurrency,
        );
        const dayOffset = this.time.getDayOffset(occurrenceMs);

        // 1. Coverage Map
        if (liabilityAccountIds.has(tx.accountId) && tx.transactionType === TransactionType.DEBIT) {
          coverageMap.set(tx.accountId, (coverageMap.get(tx.accountId) || 0) + amountInDefault);
        }

        // 2. Flows and Commitments
        if (isInternalTransfer) {
          const isDebtPayment =
            liabilityAccountIds.has(tx.accountId) && tx.transactionType === TransactionType.DEBIT;
          if (isDebtPayment) {
            addCommitment(
              tx.accountId,
              accountMap.get(tx.accountId),
              journal.description || 'Planned Journal',
              amountInDefault,
              dayOffset,
              journal.id,
              DebtType.PLANNED_JOURNAL,
            );
          }
        } else {
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
            id: journal.id,
          });

          if (impact < 0 && tx.transactionType === TransactionType.CREDIT) {
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
          if (impact < 0) {
            plannedOutflows.push({
              dayOffset,
              accountId: tx.accountId, // Ensure budget mapping uses the target account correctly
              amount: impact,
            });
          } else if (impact > 0) {
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
