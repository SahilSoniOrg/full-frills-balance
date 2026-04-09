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

      const spendingFlows = previousFlows.filter(
        f => f.kind === 'OUTFLOW' && f.accountId === acc.id,
      );

      const obligations = this.generateObligations(
        acc,
        lb.balance,
        metadata,
        statementBalances.get(acc.id) || 0,
        settledSinceStatement.get(acc.id) || 0,
        startOfToday,
        simulationDays,
        spendingFlows,
      );

      // Reduce obligations by matching with incoming flows to this liability account
      // SORT: Ensure flows are processed chronologically
      const incomingFlowsToThisLiability = previousFlows
        .filter(
          f =>
            (f.kind === 'TRANSFER' && f.toAccountId === acc.id) ||
            (f.kind === 'INFLOW' && f.accountId === acc.id),
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
    spendingFlows: Flow[] = [],
  ): Obligation[] {
    const obligations: Obligation[] = [];
    const dueDay = metadata?.dueDay || AppConfig.insights.liabilityDefaultDueDay;
    const statementDay = metadata?.statementDay;

    if (acc.accountSubtype === AccountSubtype.CREDIT_CARD && statementDay) {
      const cycles: { sDate: dayjs.Dayjs; dDate: dayjs.Dayjs; amount: number }[] = [];

      let currDDate = getNextDueDate(startOfToday, dueDay);
      let currSDate = getCorrespondingStatementDate(currDDate, statementDay, dueDay);

      // Generate cycles until the due date is well past the simulation window
      while (currDDate.diff(startOfToday, 'day') < simulationDays + 31) {
        cycles.push({
          sDate: currSDate,
          dDate: currDDate,
          amount: 0,
        });
        currDDate = currDDate.add(1, 'month');
        currSDate = getCorrespondingStatementDate(currDDate, statementDay, dueDay);
      }

      const firstCycle = cycles[0];
      const isBillAvailable =
        startOfToday.isAfter(firstCycle.sDate, 'day') ||
        startOfToday.isSame(firstCycle.sDate, 'day');

      if (isBillAvailable) {
        // 1. Current bill (Remaining Statement Balance)
        const remainingStatement = Math.max(0, statementBalance - settledSinceStatement);
        const amountDueAtD1 = Math.min(currentBalance, remainingStatement);
        firstCycle.amount = amountDueAtD1;

        // 2. Remaining current balance goes to next cycle
        if (cycles.length > 1) {
          cycles[1].amount = Math.max(0, currentBalance - amountDueAtD1);
        }
      } else {
        // All current balance belongs to the first (not yet generated) bill
        firstCycle.amount = currentBalance;
      }

      // 3. Distribute spending flows into relevant statement cycles
      for (const f of spendingFlows) {
        const fDate = startOfToday.add(f.dayOffset, 'day');
        // Find the first cycle whose statement date is AFTER or ON the spending date
        const cycle = cycles.find(
          c => fDate.isBefore(c.sDate, 'day') || fDate.isSame(c.sDate, 'day'),
        );
        if (cycle) {
          cycle.amount += f.amount;
        }
      }

      // 4. Emit obligations for all cycles within simulation window
      for (let i = 0; i < cycles.length; i++) {
        const c = cycles[i];
        if (c.amount > 0.01) {
          const roundedAmount = Math.round(c.amount * 100) / 100;
          const dueDayOffset = c.dDate.diff(startOfToday, 'day');
          if (dueDayOffset < simulationDays && roundedAmount > 0) {
            obligations.push({
              liabilityId: acc.id,
              amount: roundedAmount,
              dueDayOffset,
              label: `${i === 0 ? 'Current bill' : 'Bill ' + (i + 1)}: ${acc.name}`,
            });
          }
        }
      }
    } else {
      // Non-CC liability: Generate monthly obligations until balance is cleared or window ends
      const deductionDay =
        metadata?.dueDay || metadata?.emiDay || AppConfig.insights.liabilityFallbackDeductionDay;
      let currDDate = getNextDueDate(startOfToday, deductionDay);

      let remainingBalance = currentBalance;
      for (const f of spendingFlows) {
        remainingBalance += f.amount;
      }

      // EMI Fallback: If no emiAmount is set, we use 1/24th of the balance as a sensible monthly default
      // This avoids "cliffs" where the entire balance is projected in month 1.
      const rawEmiAmount = metadata?.emiAmount;
      const emiAmount = rawEmiAmount || Math.ceil(remainingBalance / 24);

      while (currDDate.diff(startOfToday, 'day') < simulationDays && remainingBalance > 0.01) {
        const amountToPay = Math.round(Math.min(remainingBalance, emiAmount) * 100) / 100;

        obligations.push({
          liabilityId: acc.id,
          amount: amountToPay,
          dueDayOffset: currDDate.diff(startOfToday, 'day'),
          label: `Unsettled: ${acc.name}`,
        });

        remainingBalance -= amountToPay;
        currDDate = currDDate.add(1, 'month');
      }
    }

    return obligations;
  }
}
