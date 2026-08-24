import { AppConfig } from '@/src/constants/app-config';
import Journal from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';
import { TransactionType } from '@/src/types/enums';
import {
  FlowCategory,
  FlowSource,
  ScheduledProjection,
  SimulationContext,
  SimulationPlannedPayment,
} from '../types';
import { RecurrenceEngine } from '@/src/services/forward-finance/recurrence/RecurrenceEngine';

export class PlannedFlowGenerator {
  /**
   * Generates high-level semantic scheduled projections from planned payments and journals.
   * Delayed discretization: Emits ScheduledProjection[] without premature Flow[] conversion.
   */
  static generate(
    context: SimulationContext,
    plannedPayments: SimulationPlannedPayment[],
    plannedJournals: Journal[],
    expenseAccountIds: Set<string>,
    journalTransactionsMap: Map<string, Transaction[]>,
  ): ScheduledProjection[] {
    const projections: ScheduledProjection[] = [];

    // Day offset helper for efficient date-key matching without dayjs formatting
    const getDayKey = (ms: number) => Math.floor(ms / (24 * 60 * 60 * 1000));

    // Fast-path set of journal occurrences mapped to their parent planned payments
    const journalDatesByPP = new Set<string>();
    for (const journal of plannedJournals) {
      if (journal.plannedPaymentId && journal.status !== 'SKIPPED') {
        journalDatesByPP.add(`${journal.plannedPaymentId}:${getDayKey(journal.journalDate)}`);
      }
    }

    // Process Planned Payments (Rules/Templates)
    for (const pp of plannedPayments) {
      const isLiquidFrom =
        context.liquidAccountIds.has(pp.fromAccountId) ||
        context.liabilityAccountIds.has(pp.fromAccountId);
      const isLiquidTo =
        context.liquidAccountIds.has(pp.toAccountId) ||
        context.liabilityAccountIds.has(pp.toAccountId);

      if (!isLiquidFrom && !isLiquidTo) {
        continue;
      }

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
          const tags = isLiquidTo && isLiquidFrom ? ['LIABILITY_PAYMENT'] : [];

          if (isLiquidFrom && isLiquidTo) {
            projections.push({
              sourceId: pp.id,
              occurrenceDate: curr,
              amount: normalizedAmount,
              fromAccountId: pp.fromAccountId,
              toAccountId: pp.toAccountId,
              category: FlowCategory.TRANSFER,
              timeframe: 'FUTURE',
              label: pp.name || 'Planned Payment',
              origin: FlowSource.PLANNED_PAYMENT,
              categoryId: pp.toAccountId,
              tags,
              isTransfer: true,
            });
          } else if (isLiquidFrom) {
            projections.push({
              sourceId: pp.id,
              occurrenceDate: curr,
              amount: normalizedAmount,
              fromAccountId: pp.fromAccountId,
              toAccountId: pp.toAccountId,
              category: tags.includes('LIABILITY_PAYMENT')
                ? FlowCategory.DEBT
                : FlowCategory.PLANNED_EXPENSE,
              timeframe: 'FUTURE',
              label: pp.name || 'Planned Payment',
              origin: FlowSource.PLANNED_PAYMENT,
              categoryId: pp.toAccountId,
              tags,
              isTransfer: false,
            });
          } else if (isLiquidTo) {
            projections.push({
              sourceId: pp.id,
              occurrenceDate: curr,
              amount: normalizedAmount,
              fromAccountId: pp.fromAccountId,
              toAccountId: pp.toAccountId,
              category: FlowCategory.INCOME,
              timeframe: 'FUTURE',
              label: pp.name || 'Planned Payment',
              origin: FlowSource.PLANNED_PAYMENT,
              categoryId: pp.fromAccountId,
              tags,
              isTransfer: false,
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

          projections.push({
            sourceId: journal.id,
            occurrenceDate: occurrenceMs,
            amount: context.convert(debitTx.amount, debitTx.currencyCode),
            fromAccountId: creditTx.accountId,
            toAccountId: debitTx.accountId,
            category: FlowCategory.TRANSFER,
            timeframe: 'FUTURE',
            label: journal.description || 'Planned Journal',
            origin: FlowSource.PLANNED_JOURNAL,
            categoryId: categoryId || debitTx.accountId,
            tags: isLiabilityPayment ? ['LIABILITY_PAYMENT'] : [],
            isTransfer: true,
          });
          continue;
        }
      }

      for (const tx of liquidTxs) {
        const normalizedAmount = context.convert(tx.amount, tx.currencyCode);
        const impact =
          tx.transactionType === TransactionType.DEBIT ? normalizedAmount : -normalizedAmount;

        if (impact > 0) {
          projections.push({
            sourceId: journal.id,
            occurrenceDate: occurrenceMs,
            amount: normalizedAmount,
            fromAccountId: (categoryId || tx.accountId) as any,
            toAccountId: tx.accountId,
            category: FlowCategory.INCOME,
            timeframe: 'FUTURE',
            label: journal.description || 'Planned Journal',
            origin: FlowSource.PLANNED_JOURNAL,
            categoryId: categoryId || undefined,
            isTransfer: false,
          });
        } else if (impact < 0) {
          projections.push({
            sourceId: journal.id,
            occurrenceDate: occurrenceMs,
            amount: normalizedAmount,
            fromAccountId: tx.accountId,
            toAccountId: (categoryId || tx.accountId) as any,
            category: FlowCategory.EXPENSE,
            timeframe: 'FUTURE',
            label: journal.description || 'Planned Journal',
            origin: FlowSource.PLANNED_JOURNAL,
            categoryId: categoryId || undefined,
            isTransfer: false,
          });
        }
      }
    }

    return projections;
  }

  private static getNextOccurrence(curr: number, pp: SimulationPlannedPayment): number {
    return RecurrenceEngine.getNextOccurrence(curr, {
      intervalType: pp.intervalType,
      intervalN: pp.intervalN,
      recurrenceDay: pp.recurrenceDay,
    });
  }
}
