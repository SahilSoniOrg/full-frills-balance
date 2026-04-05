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
  ): Promise<LiabilityResult> {
    const simulationDays = this.time.getSimulationDays();
    const startOfToday = this.time.getStartOfToday();
    const todayDay = startOfToday.date();

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

    const addLiabilityFlow = (acc: Account, amount: number, dayOffset: number, context: string) => {
      flows.push({
        dayOffset,
        amount: -amount,
        source: FlowSource.LIABILITY,
        type: FlowType.OUTFLOW,
        name: acc.name,
        accountId: acc.id,
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

      const coverageAmount = coverageMap.get(acc.id) || 0;
      const metadata = metadataMap.get(acc.id);
      const statementDay = metadata?.statementDay;
      const dueDay = metadata?.dueDay || AppConfig.insights.liabilityDefaultDueDay;

      const EPSILON = AppConfig.insights.liabilityCommitmentTolerance || 0.01;

      if (acc.accountSubtype === AccountSubtype.CREDIT_CARD && statementDay) {
        let d1Date = startOfToday.date(dueDay).startOf('day');
        if (d1Date.isBefore(startOfToday, 'day')) d1Date = d1Date.add(1, 'month');

        let s1Date = d1Date.date(statementDay).startOf('day');
        if (dueDay <= statementDay) s1Date = s1Date.subtract(1, 'month');

        let amountDueAtD1 = balanceInResultCurrency;
        let amountDueAtD2 = 0;

        if (startOfToday.isAfter(s1Date, 'day') || startOfToday.isSame(s1Date, 'day')) {
          const statementBalanceRaw = statementBalances.get(acc.id) || 0;
          const convStatement = await this.converter.convert(
            Math.abs(statementBalanceRaw),
            acc.currencyCode || this.resultCurrency,
            this.resultCurrency,
          );

          amountDueAtD1 = Math.min(balanceInResultCurrency, convStatement);
          amountDueAtD2 = Math.max(0, balanceInResultCurrency - amountDueAtD1);
        }

        const coverageForD1 = Math.min(coverageAmount, amountDueAtD1);
        const coverageForD2 = Math.min(Math.max(0, coverageAmount - coverageForD1), amountDueAtD2);

        if (amountDueAtD1 > EPSILON) {
          const unsettled = Math.max(0, amountDueAtD1 - coverageForD1);
          if (unsettled > EPSILON) {
            const dayOffset = d1Date.diff(startOfToday, 'day');
            addLiabilityFlow(acc, unsettled, dayOffset, 'Current bill');
            result.committed += unsettled;
            result.committedCreditCard += unsettled;
          }
        }

        if (amountDueAtD2 > EPSILON) {
          const unsettled = Math.max(0, amountDueAtD2 - coverageForD2);
          if (unsettled > EPSILON) {
            const d2Date = d1Date.add(1, 'month');
            const dayOffset = d2Date.diff(startOfToday, 'day');
            if (dayOffset < simulationDays) {
              addLiabilityFlow(acc, unsettled, dayOffset, 'Future spending');
              result.committed += unsettled;
              result.committedCreditCard += unsettled;
            }
          }
        }
      } else {
        const unsettledAmount = Math.max(0, balanceInResultCurrency - coverageAmount);
        if (unsettledAmount > EPSILON) {
          let deductionDay =
            metadata?.dueDay ||
            metadata?.emiDay ||
            AppConfig.insights.liabilityFallbackDeductionDay;
          let targetDate = startOfToday.date(deductionDay);
          if (deductionDay <= todayDay) targetDate = targetDate.add(1, 'month');

          const dayOffset = targetDate.startOf('day').diff(startOfToday, 'day');
          if (dayOffset < simulationDays) {
            addLiabilityFlow(acc, unsettledAmount, dayOffset, 'Unsettled');
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
