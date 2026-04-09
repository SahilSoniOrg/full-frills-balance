import Journal from '@/src/data/models/Journal';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import { TransactionType } from '@/src/data/models/Transaction';
import dayjs from 'dayjs';
import { Flow, FlowMeta } from '../types';

export class PlannedFlowGenerator {
  /**
   * Generates PLANNED flows from payments and journals.
   * Internal transfers are now explicitly emitted as TRANSFER.
   */
  static generate(
    plannedPayments: any[],
    plannedJournals: Journal[],
    liquidAccountIds: Set<string>,
    liabilityAccountIds: Set<string>,
    expenseAccountIds: Set<string>,
    journalTransactionsMap: Map<string, any[]>,
    simulationStartMs: number,
    simulationEndMs: number,
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
        liquidAccountIds.has(pp.fromAccountId) || liabilityAccountIds.has(pp.fromAccountId);
      const isLiquidTo =
        liquidAccountIds.has(pp.toAccountId) || liabilityAccountIds.has(pp.toAccountId);

      let curr = pp.nextOccurrence;
      const endDate = pp.endDate || Infinity;

      const simulationBufferMs = 1000 * 60 * 60; // 1-hour buffer for edge cases
      while (curr <= simulationEndMs + simulationBufferMs && curr <= endDate) {
        // Skip zero amount payments
        if (pp.amount <= 0) {
          curr = this.getNextOccurrence(curr, pp);
          continue;
        }

        // Precise Gap Filling: Only emit if no journal exists for this specific day
        const dateKey = dayjs(curr).format('YYYY-MM-DD');
        const isAlreadyCovered = journalDatesByPP.has(`${pp.id}:${dateKey}`);

        if (!isAlreadyCovered) {
          // If overdue (in the past), pull forward to Day 0
          const effectiveDate = Math.max(curr, simulationStartMs);
          const dayOffset = Math.floor((effectiveDate - simulationStartMs) / (24 * 60 * 60 * 1000));

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
              amount: pp.amount,
              dayOffset,
              meta: { ...meta, categoryId: pp.toAccountId },
            });
          } else if (isLiquidFrom) {
            flows.push({
              kind: 'OUTFLOW',
              accountId: pp.fromAccountId,
              amount: pp.amount,
              dayOffset,
              meta: { ...meta, categoryId: pp.toAccountId },
            });
          } else if (isLiquidTo) {
            flows.push({
              kind: 'INFLOW',
              accountId: pp.toAccountId,
              amount: pp.amount,
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
      if (occurrenceMs < simulationStartMs || occurrenceMs > simulationEndMs + 1000) continue;

      const dayOffset = Math.floor((occurrenceMs - simulationStartMs) / (24 * 60 * 60 * 1000));
      const meta: FlowMeta = {
        source: 'PLANNED',
        label: journal.description || 'Planned Journal',
        referenceId: journal.id,
      };

      // For journals, if multiple liquid accounts are involved (e.g., a transfer), we should emit a TRANSFER.
      // If it's a one-sided liquid impact (e.g., spending from a liquid account to an un-tracked account), we emit OUTFLOW/INFLOW.

      const liquidTxs = journalTxs.filter(
        tx => liquidAccountIds.has(tx.accountId) || liabilityAccountIds.has(tx.accountId),
      );

      // Locate the expense category involved in this journal if any
      const categoryTx = journalTxs.find(tx => expenseAccountIds.has(tx.accountId));
      const categoryId = categoryTx?.accountId;

      if (liquidTxs.length === 2) {
        // Assume transfer if two liquid/liability accounts are involved
        const debitTx = liquidTxs.find(tx => tx.transactionType === TransactionType.DEBIT);
        const creditTx = liquidTxs.find(tx => tx.transactionType === TransactionType.CREDIT);

        if (debitTx && creditTx) {
          const isLiabilityPayment =
            liabilityAccountIds.has(debitTx.accountId) &&
            !liabilityAccountIds.has(creditTx.accountId);

          flows.push({
            kind: 'TRANSFER',
            fromAccountId: creditTx.accountId,
            toAccountId: debitTx.accountId,
            amount: debitTx.amount,
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

      // Handle individual side impacts
      for (const tx of liquidTxs) {
        const impact = tx.transactionType === TransactionType.DEBIT ? tx.amount : -tx.amount;

        if (impact > 0) {
          flows.push({
            kind: 'INFLOW',
            accountId: tx.accountId,
            amount: tx.amount,
            dayOffset,
            meta: { ...meta, categoryId },
          });
        } else if (impact < 0) {
          flows.push({
            kind: 'OUTFLOW',
            accountId: tx.accountId,
            amount: tx.amount,
            dayOffset,
            meta: { ...meta, categoryId, tags: liabilityAccountIds.has(tx.accountId) ? [] : [] },
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

    // Stabilize day of month if recurrenceDay is provided
    if (pp.recurrenceDay && (pp.intervalType === 'MONTHLY' || pp.intervalType === 'YEARLY')) {
      const targetDay = pp.recurrenceDay;
      const lastDayOfMonth = next.endOf('month').date();
      next = next.date(Math.min(targetDay, lastDayOfMonth));
    }

    return next.valueOf();
  }
}
