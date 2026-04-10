import Journal from '@/src/data/models/Journal';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import { TransactionType } from '@/src/data/models/Transaction';
import dayjs from 'dayjs';
import { Flow, FlowMeta, SimulationContext } from '../types';

export class PlannedFlowGenerator {
  /**
   * Generates PLANNED flows from payments and journals.
   * Internal transfers are now explicitly emitted as TRANSFER.
   */
  static generate(
    context: SimulationContext,
    plannedPayments: any[],
    plannedJournals: Journal[],
    expenseAccountIds: Set<string>,
    journalTransactionsMap: Map<string, any[]>,
  ): { flows: Flow[] } {
    const flows: Flow[] = [];

    // Track journals by date to fill gaps correctly
    const journalDatesByPP = new Set<string>();
    for (const journal of plannedJournals) {
      if (journal.plannedPaymentId) {
        const dateKey = dayjs(journal.journalDate).format('YYYY-MM-DD');
        journalDatesByPP.add(`${journal.plannedPaymentId}:${dateKey}`);
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

      const simulationBufferMs = 1000 * 60 * 60; // 1-hour buffer for edge cases
      while (curr <= context.simulationEndMs + simulationBufferMs && curr <= endDate) {
        // Skip zero amount payments
        if (pp.amount <= 0) {
          curr = this.getNextOccurrence(curr, pp);
          continue;
        }

        const dateKey = dayjs(curr).format('YYYY-MM-DD');
        const isAlreadyCovered = journalDatesByPP.has(`${pp.id}:${dateKey}`);

        if (!isAlreadyCovered) {
          const effectiveDate = Math.max(curr, context.simulationStartMs);
          const dayOffset = Math.floor(
            (effectiveDate - context.simulationStartMs) / (24 * 60 * 60 * 1000),
          );

          if (dayOffset >= context.simulationDays) break;

          const normalizedAmount = context.convert(pp.amount, pp.currencyCode);
          const meta: FlowMeta = {
            source: 'PLANNED',
            label: pp.name || 'Planned Payment',
            referenceId: pp.id,
            tags: isLiquidTo && !isLiquidFrom ? ['LIABILITY_PAYMENT'] : [],
          };

          if (isLiquidFrom && isLiquidTo) {
            flows.push({
              kind: 'TRANSFER',
              fromAccountId: pp.fromAccountId,
              toAccountId: pp.toAccountId,
              amount: normalizedAmount,
              dayOffset,
              meta: { ...meta, categoryId: pp.toAccountId },
            });
          } else if (isLiquidFrom) {
            flows.push({
              kind: 'OUTFLOW',
              accountId: pp.fromAccountId,
              amount: normalizedAmount,
              dayOffset,
              meta: { ...meta, categoryId: pp.toAccountId },
            });
          } else if (isLiquidTo) {
            flows.push({
              kind: 'INFLOW',
              accountId: pp.toAccountId,
              amount: normalizedAmount,
              dayOffset,
              meta: { ...meta, categoryId: pp.fromAccountId },
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
      if (occurrenceMs < context.simulationStartMs || occurrenceMs > context.simulationEndMs + 1000)
        continue;

      const dayOffset = Math.floor(
        (occurrenceMs - context.simulationStartMs) / (24 * 60 * 60 * 1000),
      );
      if (dayOffset < 0 || dayOffset >= context.simulationDays) continue;

      const meta: FlowMeta = {
        source: 'PLANNED',
        label: journal.description || 'Planned Journal',
        referenceId: journal.id,
      };

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
            meta: {
              ...meta,
              categoryId: categoryId || debitTx.accountId,
              tags: isLiabilityPayment ? ['LIABILITY_PAYMENT'] : [],
            },
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
            meta: { ...meta, categoryId },
          });
        } else if (impact < 0) {
          flows.push({
            kind: 'OUTFLOW',
            accountId: tx.accountId,
            amount: normalizedAmount,
            dayOffset,
            meta: { ...meta, categoryId },
          });
        }
      }
    }

    return { flows };
  }

  private static getNextOccurrence(curr: number, pp: PlannedPayment): number {
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
