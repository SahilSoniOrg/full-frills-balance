import { AppConfig } from '@/src/constants';
import { AccountType } from '@/src/data/models/Account';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { Insight } from './InsightService';

export interface CalculationInput {
  recurringCandidates: any[];
  expenseTransactions: any[];
  accounts: any[];
  activePlannedPayments: any[];
  workplaceId: string;
}

/**
 * Pure calculation logic for identifying financial insights.
 * Designed to be offloadable to a background worklet/thread.
 */
export function calculateInsights(input: CalculationInput): Insight[] {
  const { recurringCandidates, expenseTransactions, accounts, activePlannedPayments, workplaceId } =
    input;

  const insightsConfig = AppConfig.insights;
  const minCount = insightsConfig.minRecurringCount;
  const accountMap = new Map(accounts.map(a => [a.id, a]));
  const patterns: Insight[] = [];

  // 1. Process recurring candidates (Database already grouped by description)
  for (const candidate of recurringCandidates) {
    const acc = accountMap.get(candidate.accountId);
    if (acc?.accountType !== AccountType.EXPENSE) continue;

    const dates = (candidate.transactionDates || '')
      .split(',')
      .map(Number)
      .sort((a: number, b: number) => a - b);

    if (dates.length < minCount) continue;

    const intervals = [];
    for (let i = 1; i < dates.length; i++) {
      intervals.push(dates[i] - dates[i - 1]);
    }

    const isRecurring = intervals.every(interval => {
      const days = interval / AppConfig.time.msPerDay;
      const minD = insightsConfig.minRecurringIntervalDays;
      const maxD = insightsConfig.maxRecurringIntervalDays;
      const minA = insightsConfig.minAnnualRecurringIntervalDays;
      const maxA = insightsConfig.maxAnnualRecurringIntervalDays;
      return (days >= minD && days <= maxD) || (days >= minA && days <= maxA);
    });

    if (isRecurring) {
      const amount = Math.abs(candidate.amount);
      const description = candidate.description || 'Unknown';
      const accountName = acc.name || 'Unknown Spending';
      const formattedAmount = CurrencyFormatter.format(amount, candidate.currencyCode);

      patterns.push({
        id: `sub_${amount}_${candidate.accountId}_${description.replace(/\s+/g, '_')}`,
        type: 'subscription-amnesiac',
        severity: amount > insightsConfig.spendingSpikeSeverityThreshold ? 'high' : 'medium',
        message: AppConfig.strings.dashboard.hub.subscriptionAmnesia.message,
        description: AppConfig.strings.dashboard.hub.subscriptionAmnesia.description(
          formattedAmount,
          description,
          accountName,
        ),
        suggestion: AppConfig.strings.dashboard.hub.subscriptionAmnesia.suggestion,
        journalIds: (candidate.journalIds || '').split(','),
        amount,
        currencyCode: candidate.currencyCode,
        accountSubtype: acc.accountSubtype,
        accountName,
      });
    }
  }

  // 2. Evaluate Leaks and Lifestyle Drift
  const spikeWindow = insightsConfig.spikeWindowDays;
  const last7Days = Date.now() - spikeWindow * AppConfig.time.msPerDay;

  const finalPatterns = patterns.filter((p: Insight) => {
    if (p.type !== 'subscription-amnesiac') return true;
    const account = accounts.find((a: { id: string; name: string }) => a.name === p.accountName);
    if (!account) return true;

    const isAlreadyPlanned = activePlannedPayments.some(
      (pp: { amount: number; fromAccountId?: string; toAccountId?: string }) =>
        Math.abs(pp.amount) === Math.abs(p.amount || 0) &&
        (pp.fromAccountId === account.id || pp.toAccountId === account.id),
    );
    return !isAlreadyPlanned;
  });

  const currentWeekTransactions = expenseTransactions.filter(t => t.transactionDate >= last7Days);
  const previousWeeksTransactions = expenseTransactions.filter(t => t.transactionDate < last7Days);

  const currentWeekBySubtype = new Map<string, number>();
  currentWeekTransactions.forEach(t => {
    const acc = accountMap.get(t.accountId);
    const subcat = acc?.accountSubtype || 'UNKNOWN';
    currentWeekBySubtype.set(subcat, (currentWeekBySubtype.get(subcat) || 0) + Math.abs(t.amount));
  });

  const totalBySubtype = new Map<string, number>();
  previousWeeksTransactions.forEach(t => {
    const acc = accountMap.get(t.accountId);
    const subcat = acc?.accountSubtype || 'UNKNOWN';
    totalBySubtype.set(subcat, (totalBySubtype.get(subcat) || 0) + Math.abs(t.amount));
  });

  currentWeekBySubtype.forEach((amount, subtype) => {
    const historyTotal = totalBySubtype.get(subtype) || 0;

    const MIN_WEEKS = 4;
    const WEEK_MS = 7 * AppConfig.time.msPerDay;
    const historicalTxs = previousWeeksTransactions.filter(
      t => accountMap.get(t.accountId)?.accountSubtype === subtype,
    );
    const oldestDate =
      historicalTxs.length > 0 ? Math.min(...historicalTxs.map(t => t.transactionDate)) : null;
    const weeksOfHistory = oldestDate ? Math.max(1, (last7Days - oldestDate) / WEEK_MS) : 0;

    if (weeksOfHistory < MIN_WEEKS) return;

    const historyAverage = historyTotal / weeksOfHistory;

    const spikeMultiplier = insightsConfig.spendingSpikeMultiplier;
    if (historyAverage > 0 && amount > historyAverage * spikeMultiplier) {
      const formattedSubtype = subtype
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, l => l.toUpperCase());
      const percentIncrease = Math.round((spikeMultiplier - 1) * 100);
      finalPatterns.push({
        id: `leak_${workplaceId}_${subtype}`,
        type: 'slow-leak',
        severity: 'low',
        message: AppConfig.strings.dashboard.hub.spendingSpike.message,
        description: AppConfig.strings.dashboard.hub.spendingSpike.description(
          formattedSubtype,
          percentIncrease,
        ),
        suggestion: AppConfig.strings.dashboard.hub.spendingSpike.suggestion,
        journalIds: Array.from(
          new Set(
            currentWeekTransactions
              .filter(t => accountMap.get(t.accountId)?.accountSubtype === subtype)
              .map(t => t.journalId),
          ),
        ),
      });
    }
  });

  const assets = accounts.filter(a => a.accountType === AccountType.ASSET);
  if (assets.length > 0) {
    const hasEmergencyFund = assets.some(a => a.accountSubtype === 'EMERGENCY_FUND');
    const hasSignificantAssets = assets.length >= 3;

    if (!hasEmergencyFund && hasSignificantAssets) {
      const { insight: strings } = AppConfig.strings.dashboard.hub.emergencyFund;
      finalPatterns.push({
        id: `no_emergency_fund_${workplaceId}`,
        type: 'lifestyle-drift',
        severity: 'medium',
        message: strings.message,
        description: strings.description,
        suggestion: strings.suggestion,
        journalIds: [],
      });
    }
  }

  return finalPatterns;
}
