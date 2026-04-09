import Account, { AccountSubtype } from '@/src/data/models/Account';
import { AppConfig } from '@/src/constants/app-config';
import { Flow, Obligation } from '../types';
import { getCorrespondingStatementDate, getNextDueDate } from '../../utils/liabilityUtils';
import dayjs from 'dayjs';

export class LiabilityFlowGenerator {
  /**
   * Generates LIABILITY outflows from liquid accounts based on obligations.
   * 1. Generate obligations (bills).
   * 2. Reduce obligations by matching them with previous TRANSFER flows to that liability.
   * 3. Emit remaining obligations as OUTFLOW from liquid accounts.
   */
  static generate(
    liabilityBalances: { account: Account; balance: number }[],
    metadataMap: Map<string, any>,
    statementBalances: Map<string, number>,
    settledSinceStatement: Map<string, number>,
    liquidAccountIds: Set<string>,
    orderedLiquidAccountIds: string[],
    previousFlows: Flow[], // Transfers already generated (e.g. Planned Payments)
    simulationStartMs: number,
    simulationDays: number,
    // Note: Currency resolved by orchestrator
  ): Flow[] {
    const flows: Flow[] = [];
    const startOfToday = dayjs(simulationStartMs);

    for (const lb of liabilityBalances) {
      const acc = lb.account;
      const metadata = metadataMap.get(acc.id);

      // If payment is from untracked account, it doesn't affect our simulation
      if (metadata?.payFromAccountId && !liquidAccountIds.has(metadata.payFromAccountId)) {
        continue;
      }

      const obligations = this.generateObligations(
        acc,
        lb.balance,
        metadata,
        statementBalances.get(acc.id) || 0,
        settledSinceStatement.get(acc.id) || 0,
        startOfToday,
        simulationDays,
      );

      // Reduce obligations by matching with incoming flows to this liability account
      // SORT: Ensure flows are processed chronologically
      const incomingFlowsToThisLiability = previousFlows
        .filter(
          f =>
            (f.kind === 'TRANSFER' && f.toAccountId === acc.id) ||
            (f.kind === 'INFLOW' && f.accountId === acc.id) ||
            f.meta?.tags?.includes('LIABILITY_PAYMENT'),
        )
        .sort((a, b) => a.dayOffset - b.dayOffset);

      // Sort obligations by due date
      const sortedObligations = [...obligations].sort((a, b) => a.dueDayOffset - b.dueDayOffset);

      // Keep track of how much of each transfer we've 'applied' to obligations
      const usedTransferAmounts = new Map<Flow, number>();

      for (const obligation of sortedObligations) {
        let remainingAmount = obligation.amount;

        // Greedy matching with incoming flows occurring on or before the due date
        for (const incomingFlow of incomingFlowsToThisLiability) {
          const alreadyUsed = usedTransferAmounts.get(incomingFlow) || 0;
          const available = incomingFlow.amount - alreadyUsed;

          if (incomingFlow.dayOffset <= obligation.dueDayOffset && available > 0) {
            const reduction = Math.min(remainingAmount, available);
            remainingAmount -= reduction;
            usedTransferAmounts.set(incomingFlow, alreadyUsed + reduction);
          }
        }

        if (remainingAmount > 0.01) {
          // Emit OUTFLOW from the preferred liquid account
          const payFromId =
            metadata?.payFromAccountId ||
            (orderedLiquidAccountIds.length > 0 ? orderedLiquidAccountIds[0] : acc.id);
          flows.push({
            kind: 'OUTFLOW',
            accountId: payFromId,
            amount: remainingAmount,
            dayOffset: obligation.dueDayOffset,
            meta: {
              source: 'LIABILITY',
              label: obligation.label,
              referenceId: acc.id,
            },
          });
        }
      }
    }

    return flows;
  }

  private static generateObligations(
    acc: Account,
    currentBalance: number,
    metadata: any,
    statementBalance: number,
    settledSinceStatement: number,
    startOfToday: dayjs.Dayjs,
    simulationDays: number,
  ): Obligation[] {
    const obligations: Obligation[] = [];
    const dueDay = metadata?.dueDay || AppConfig.insights.liabilityDefaultDueDay;
    const statementDay = metadata?.statementDay;

    if (acc.accountSubtype === AccountSubtype.CREDIT_CARD && statementDay) {
      const d1Date = getNextDueDate(startOfToday, dueDay);
      const d1DayOffset = d1Date.diff(startOfToday, 'day');
      const s1Date = getCorrespondingStatementDate(d1Date, statementDay, dueDay);

      const isBillAvailable =
        startOfToday.isAfter(s1Date, 'day') || startOfToday.isSame(s1Date, 'day');

      if (isBillAvailable) {
        // Current bill (Remaining Statement Balance)
        // We subtract already-settled payments from the statement balance
        const remainingStatement = Math.max(0, statementBalance - settledSinceStatement);
        const amountDueAtD1 = Math.min(currentBalance, remainingStatement);
        if (amountDueAtD1 > 0.01) {
          obligations.push({
            liabilityId: acc.id,
            amount: amountDueAtD1,
            dueDayOffset: d1DayOffset,
            label: `Current bill: ${acc.name}`,
          });
        }

        // Remaining spending -> Next cycle
        const amountDueAtD2 = Math.max(0, currentBalance - amountDueAtD1);
        if (amountDueAtD2 > 0.01) {
          const d2Date = d1Date.add(1, 'month');
          const d2DayOffset = d2Date.diff(startOfToday, 'day');
          if (d2DayOffset < simulationDays) {
            obligations.push({
              liabilityId: acc.id,
              amount: amountDueAtD2,
              dueDayOffset: d2DayOffset,
              label: `Unbilled spending: ${acc.name}`,
            });
          }
        }
      } else {
        // All spending -> Next cycle
        const d1DayOffset = d1Date.diff(startOfToday, 'day');
        obligations.push({
          liabilityId: acc.id,
          amount: currentBalance,
          dueDayOffset: d1DayOffset,
          label: `Unbilled spending: ${acc.name}`,
        });
      }
    } else {
      // Non-CC liability: Simply push full balance at next due date
      const deductionDay =
        metadata?.dueDay || metadata?.emiDay || AppConfig.insights.liabilityFallbackDeductionDay;
      const targetDate = getNextDueDate(startOfToday, deductionDay);
      const dayOffset = targetDate.diff(startOfToday, 'day');
      if (dayOffset < simulationDays && currentBalance > 0.01) {
        obligations.push({
          liabilityId: acc.id,
          amount: currentBalance,
          dueDayOffset: dayOffset,
          label: `Unsettled: ${acc.name}`,
        });
      }
    }

    return obligations;
  }
}
