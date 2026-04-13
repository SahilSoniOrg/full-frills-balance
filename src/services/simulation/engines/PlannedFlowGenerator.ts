import { AppConfig } from '@/src/constants/app-config';
import Journal from '@/src/data/models/Journal';
import Transaction, { TransactionType } from '@/src/data/models/Transaction';
import dayjs from 'dayjs';
import {
  Flow,
  FlowCategory,
  FlowSource,
  SimulationContext,
  SimulationPlannedPayment,
} from '../types';
import { assertValidFlow } from '../utils/FlowInvariants';

export class PlannedFlowGenerator {
  /**
   * Generates PLANNED flows from payments and journals.
   * Internal transfers are now explicitly emitted as TRANSFER.
   */
  static generate(
    context: SimulationContext,
    plannedPayments: SimulationPlannedPayment[],
    plannedJournals: Journal[],
    expenseAccountIds: Set<string>,
    journalTransactionsMap: Map<string, Transaction[]>,
  ): { flows: Flow[] } {
    const flows: Flow[] = [];

    // Day offset helper for efficient date-key matching without dayjs formatting
    const getDayKey = (ms: number) => Math.floor(ms / (24 * 60 * 60 * 1000));

    // Track journals by date to fill gaps correctly
    const journalDatesByPP = new Set<string>();
    for (const journal of plannedJournals) {
      if (journal.plannedPaymentId) {
        const dayKey = getDayKey(journal.journalDate);
        journalDatesByPP.add(`${journal.plannedPaymentId}:${dayKey}`);
      }
    }

    // Process Planned Payments
    for (const pp of plannedPayments) {
      const isLiquidFrom =
        context.liquidAccountIds.has(pp.fromAccountId) ||
        context.liabilityAccountIds.has(pp.fromAccountId);
      const isLiquidTo =
        context.liquidAccountIds.has(pp.toAccountId) ||
        context.liabilityAccountIds.has(pp.toAccountId);

      let curr = pp.nextOccurrence;
      const endDate = pp.endDate || Infinity;

      while (
        curr <= context.simulationEndMs + AppConfig.defaults.simulation.edgeCaseBufferMs &&
        curr <= endDate
      ) {
        // Skip zero amount payments
        if (pp.amount <= 0) {
          curr = this.getNextOccurrence(curr, pp);
          continue;
        }

        const dayKey = getDayKey(curr);
        const key = `${pp.id}:${dayKey}`;
        const isAlreadyCovered = journalDatesByPP.has(key);

        if (!isAlreadyCovered) {
          const effectiveDate = Math.max(curr, context.simulationStartMs);
          const dayOffset = Math.floor(
            (effectiveDate - context.simulationStartMs) / (24 * 60 * 60 * 1000),
          );

          if (dayOffset >= context.simulationDays) break;

          const normalizedAmount = context.convert(pp.amount, pp.currencyCode);
          const meta = {
            label: pp.name || 'Planned Payment',
            referenceId: pp.id,
            tags: isLiquidTo && isLiquidFrom ? ['LIABILITY_PAYMENT'] : [],
          };

          if (isLiquidFrom && isLiquidTo) {
            flows.push({
              kind: 'TRANSFER',
              fromAccountId: pp.fromAccountId,
              toAccountId: pp.toAccountId,
              amount: normalizedAmount,
              dayOffset,
              category: FlowCategory.TRANSFER,
              timeframe: 'FUTURE',
              label: pp.name || 'Planned Payment',
              origin: FlowSource.PLANNED_PAYMENT,
              referenceId: pp.id,
              categoryId: pp.toAccountId,
              meta: { tags: meta.tags },
            });
          } else if (isLiquidFrom) {
            flows.push({
              kind: 'OUTFLOW',
              accountId: pp.fromAccountId,
              amount: normalizedAmount,
              dayOffset,
              category: meta.tags?.includes('LIABILITY_PAYMENT')
                ? FlowCategory.DEBT
                : FlowCategory.PLANNED_EXPENSE,
              timeframe: 'FUTURE',
              label: pp.name || 'Planned Payment',
              origin: FlowSource.PLANNED_PAYMENT,
              referenceId: pp.id,
              categoryId: pp.toAccountId,
              meta: { tags: meta.tags },
            });
          } else if (isLiquidTo) {
            flows.push({
              kind: 'INFLOW',
              accountId: pp.toAccountId,
              amount: normalizedAmount,
              dayOffset,
              category: FlowCategory.INCOME,
              timeframe: 'FUTURE',
              label: pp.name || 'Planned Payment',
              origin: FlowSource.PLANNED_PAYMENT,
              referenceId: pp.id,
              categoryId: pp.fromAccountId,
              meta: { tags: meta.tags },
            });
          }
        }

        // Advance to next occurrence
        curr = this.getNextOccurrence(curr, pp);
      }
    }

    // Process Planned Journals
    for (const journal of plannedJournals) {
      const journalTxs = journalTransactionsMap.get(journal.id) || [];
      const occurrenceMs = journal.journalDate;
      const effectiveMs = Math.max(occurrenceMs, context.simulationStartMs);
      if (effectiveMs > context.simulationEndMs + 1000) continue;

      const dayOffset = Math.floor(
        (effectiveMs - context.simulationStartMs) / (24 * 60 * 60 * 1000),
      );
      if (dayOffset >= context.simulationDays) continue;

      const liquidTxs = journalTxs.filter(
        tx =>
          context.liquidAccountIds.has(tx.accountId) ||
          context.liabilityAccountIds.has(tx.accountId),
      );

      const categoryTx = journalTxs.find(tx => expenseAccountIds.has(tx.accountId));
      const categoryId = categoryTx?.accountId;

      if (liquidTxs.length === 2) {
        const debitTx = liquidTxs.find(tx => tx.transactionType === TransactionType.DEBIT);
        const creditTx = liquidTxs.find(tx => tx.transactionType === TransactionType.CREDIT);

        if (debitTx && creditTx) {
          const isLiabilityPayment =
            context.liabilityAccountIds.has(debitTx.accountId) &&
            !context.liabilityAccountIds.has(creditTx.accountId);

          flows.push({
            kind: 'TRANSFER',
            fromAccountId: creditTx.accountId,
            toAccountId: debitTx.accountId,
            amount: context.convert(debitTx.amount, debitTx.currencyCode),
            dayOffset,
            category: FlowCategory.TRANSFER,
            timeframe: 'FUTURE',
            label: journal.description || 'Planned Journal',
            origin: FlowSource.PLANNED_JOURNAL,
            referenceId: journal.id,
            categoryId: categoryId || debitTx.accountId,
            meta: { tags: isLiabilityPayment ? ['LIABILITY_PAYMENT'] : [] },
          });
          continue;
        }
      }

      for (const tx of liquidTxs) {
        const normalizedAmount = context.convert(tx.amount, tx.currencyCode);
        const impact =
          tx.transactionType === TransactionType.DEBIT ? normalizedAmount : -normalizedAmount;

        if (impact > 0) {
          flows.push({
            kind: 'INFLOW',
            accountId: tx.accountId,
            amount: normalizedAmount,
            dayOffset,
            category: FlowCategory.INCOME,
            timeframe: 'FUTURE',
            label: journal.description || 'Planned Journal',
            origin: FlowSource.PLANNED_JOURNAL,
            referenceId: journal.id,
            categoryId: categoryId || undefined,
          });
        } else if (impact < 0) {
          flows.push({
            kind: 'OUTFLOW',
            accountId: tx.accountId,
            amount: normalizedAmount,
            dayOffset,
            category: FlowCategory.EXPENSE, // Generic journal outflows
            timeframe: 'FUTURE',
            label: journal.description || 'Planned Journal',
            origin: FlowSource.PLANNED_JOURNAL,
            referenceId: journal.id,
            categoryId: categoryId || undefined,
          });
        }
      }
    }

    flows.forEach(assertValidFlow);
    return { flows };
  }

  private static getNextOccurrence(curr: number, pp: SimulationPlannedPayment): number {
    const intervalN = pp.intervalN || 1;
    let next = dayjs(curr);

    switch (pp.intervalType) {
      case 'DAILY':
        next = next.add(intervalN, 'day');
        break;
      case 'WEEKLY':
        next = next.add(intervalN, 'week');
        break;
      case 'MONTHLY':
        next = next.add(intervalN, 'month');
        break;
      case 'YEARLY':
        next = next.add(intervalN, 'year');
        break;
      default:
        next = next.add(intervalN, 'day');
        break;
    }

    if (pp.recurrenceDay && (pp.intervalType === 'MONTHLY' || pp.intervalType === 'YEARLY')) {
      const targetDay = pp.recurrenceDay;
      const lastDayOfMonth = next.endOf('month').date();
      next = next.date(Math.min(targetDay, lastDayOfMonth));
    }

    return next.valueOf();
  }
}
