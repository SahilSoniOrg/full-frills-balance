import { AppConfig } from '@/src/constants/app-config';
import Account, { AccountSubtype } from '@/src/data/models/Account';
import dayjs from 'dayjs';
import { Flow, FlowCategory, FlowSource, Obligation, SimulationContext } from '../types';
import { assertValidFlow } from '../utils/FlowInvariants';
import { getCorrespondingStatementDate, getNextDueDate } from '../utils/liabilityUtils';

export class LiabilityFlowGenerator {
  /**
   * Generates LIABILITY outflows from liquid accounts based on obligations.
   * 1. Generate obligations (bills).
   * 2. Reduce obligations by matching them with previous TRANSFER flows to that liability.
   * 3. Emit remaining obligations as OUTFLOW from liquid accounts.
   */
  static generate(
    context: SimulationContext,
    previousFlows: Flow[],
    liabilityBalances: { account: Account; balance: number }[],
    metadataMap: Map<string, any>,
    statementBalances: Map<string, number>,
    settledSinceStatement: Map<string, number>,
  ): Flow[] {
    const flows: Flow[] = [];
    const startOfToday = dayjs(context.simulationStartMs).startOf('day');

    for (const lb of liabilityBalances) {
      const acc = lb.account;
      const metadata = metadataMap.get(acc.id);

      // If payment is from untracked account, it doesn't affect our simulation
      if (metadata?.payFromAccountId && !context.liquidAccountIds.has(metadata.payFromAccountId)) {
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
        context.simulationDays,
        spendingFlows,
      );

      // Reduce obligations by matching with incoming flows to this liability account
      const incomingFlowsToThisLiability = previousFlows
        .filter(
          f =>
            (f.kind === 'TRANSFER' && f.toAccountId === acc.id) ||
            (f.kind === 'INFLOW' && f.accountId === acc.id),
        )
        .sort((a, b) => a.dayOffset - b.dayOffset);

      const sortedObligations = [...obligations].sort((a, b) => a.dueDayOffset - b.dueDayOffset);
      const usedTransferAmounts = new Map<Flow, number>();

      for (const obligation of sortedObligations) {
        let remainingAmount = obligation.amount;

        for (const incomingFlow of incomingFlowsToThisLiability) {
          const alreadyUsed = usedTransferAmounts.get(incomingFlow) || 0;
          const available = incomingFlow.amount - alreadyUsed;

          if (incomingFlow.dayOffset <= obligation.dueDayOffset && available > 0) {
            const reduction = Math.min(remainingAmount, available);
            remainingAmount -= reduction;
            usedTransferAmounts.set(incomingFlow, alreadyUsed + reduction);
          }
        }

        if (remainingAmount > AppConfig.defaults.simulation.financialEpsilon) {
          // Emit OUTFLOW from the preferred liquid account
          // NEW LOGIC: Just pick the first liquid account if none specified
          const payFromId =
            metadata?.payFromAccountId ||
            (context.orderedLiquidAccountIds.length > 0
              ? context.orderedLiquidAccountIds[0]
              : acc.id);

          flows.push({
            kind: 'OUTFLOW',
            accountId: payFromId,
            amount: remainingAmount,
            dayOffset: obligation.dueDayOffset,
            category: FlowCategory.DEBT,
            timeframe: 'FUTURE',
            label: obligation.label,
            origin: FlowSource.LIABILITY,
            referenceId: acc.id,
            meta: {
              allowCascade: !metadata?.payFromAccountId,
            },
          });
        }
      }
    }

    flows.forEach(assertValidFlow);
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

    // Use metadata.paymentMode or fallback to configured defaults
    const isMinMode = metadata?.minPaymentOnly || metadata?.paymentMode === 'MIN';
    const paymentModeLabel = isMinMode ? ' (Min)' : '';

    if (acc.accountSubtype === AccountSubtype.CREDIT_CARD && statementDay) {
      const cycles: { sDate: dayjs.Dayjs; dDate: dayjs.Dayjs; amount: number }[] = [];

      let currDDate = getNextDueDate(startOfToday, dueDay);
      let currSDate = getCorrespondingStatementDate(currDDate, statementDay, dueDay);

      while (currDDate.diff(startOfToday, 'day') < simulationDays + 31) {
        cycles.push({
          sDate: currSDate,
          dDate: currDDate,
          amount: 0,
        });
        currDDate = currDDate.add(1, 'month');
        currSDate = getCorrespondingStatementDate(currDDate, statementDay, dueDay);
      }

      if (cycles.length === 0) {
        return obligations;
      }

      const firstCycle = cycles[0];
      const isBillAvailable =
        startOfToday.isAfter(firstCycle.sDate, 'day') ||
        startOfToday.isSame(firstCycle.sDate, 'day');

      if (isBillAvailable) {
        // 1. Current bill (Remaining Statement Balance)
        const remainingStatement = Math.max(0, statementBalance - settledSinceStatement);

        // Handle MIN payment mode for the first bill
        let amountDueAtD1 = remainingStatement;
        if (metadata?.minPaymentOnly) {
          const absoluteMin = metadata?.minimumPaymentAmount || 0;
          const percentMin = metadata?.minimumPaymentPercent
            ? (currentBalance * metadata.minimumPaymentPercent) / 100
            : 0;
          const calculatedMin = Math.max(absoluteMin, percentMin);

          // If we've already paid more than min, we don't owe anything more for min
          amountDueAtD1 = Math.max(0, calculatedMin - settledSinceStatement);
        }

        amountDueAtD1 = Math.min(currentBalance, amountDueAtD1);
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
      // Note: If minPaymentOnly is true, future spending might only incur interest/future min payments.
      // For simplicity in Safe-to-Spend, we still project the full spending flow into the next bill
      // UNLESS we want to be very precise about future statement min-payments.
      // Fixed for now: all spending in a cycle is added to that cycle's obligation.
      for (const f of spendingFlows) {
        const fDate = startOfToday.add(f.dayOffset, 'day');
        const cycle = cycles.find(
          c => fDate.isBefore(c.sDate, 'day') || fDate.isSame(c.sDate, 'day'),
        );
        if (cycle) {
          cycle.amount += f.amount;
        }
      }

      // 4. Emit obligations
      for (let i = 0; i < cycles.length; i++) {
        const c = cycles[i];
        if (c.amount > AppConfig.defaults.simulation.financialEpsilon) {
          let finalAmount = c.amount;

          // Apply MIN payment logic to future cycles too if applicable
          if (isMinMode && i > 0) {
            const absoluteMin = metadata?.minimumPaymentAmount || 0;
            const percentMin = metadata?.minimumPaymentPercent
              ? (c.amount * metadata.minimumPaymentPercent) / 100
              : 0;
            const calculatedMin = Math.max(absoluteMin, percentMin);

            finalAmount = Math.min(c.amount, calculatedMin);
          }

          const roundedAmount = Math.round(finalAmount * 100) / 100;
          const dueDayOffset = c.dDate.diff(startOfToday, 'day');
          if (dueDayOffset < simulationDays && roundedAmount > 0) {
            obligations.push({
              liabilityId: acc.id,
              amount: roundedAmount,
              dueDayOffset,
              label: `${i === 0 ? 'Current bill' : 'Bill ' + (i + 1)}: ${acc.name}${paymentModeLabel}`,
            });
          }
        }
      }
    } else {
      // Non-CC liability (EMI)
      const deductionDay =
        metadata?.dueDay || metadata?.emiDay || AppConfig.insights.liabilityFallbackDeductionDay;
      let currDDate = getNextDueDate(startOfToday, deductionDay);

      let remainingBalance = currentBalance;
      for (const f of spendingFlows) {
        remainingBalance += f.amount;
      }

      const rawEmiAmount = metadata?.emiAmount;
      // If no explicit EMI amount is provided, we treat the entire remaining balance as a single obligation
      // on the next due date, matching legacy behavior.
      const emiAmount = rawEmiAmount || remainingBalance;

      while (
        currDDate.diff(startOfToday, 'day') < simulationDays &&
        remainingBalance > AppConfig.defaults.simulation.financialEpsilon
      ) {
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
