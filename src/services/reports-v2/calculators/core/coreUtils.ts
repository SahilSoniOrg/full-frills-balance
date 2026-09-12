import {
  AccountSubtype,
  AccountType,
  JournalDisplayType,
  SemanticType,
  TransactionType,
} from '@/src/types/enums';
import { roundToPrecision } from '@/src/utils/money';

import type {
  ReportBalanceInput,
  ReportBucket,
  ReportComparison,
  ReportGranularity,
  ReportPeriod,
  ReportQuery,
  ReportingFact,
} from './coreTypes';

export const PRECISION = 2;

export const INTERNAL_TRANSFER_SEMANTICS = new Set<string>([
  SemanticType.TRANSFER,
  SemanticType.LIABILITY_TRANSFER,
  SemanticType.EQUITY_TRANSFER,
  SemanticType.SAVINGS_ALLOCATION,
  SemanticType.EXPENSE_RECLASSIFICATION,
  SemanticType.INCOME_RECLASSIFICATION,
]);

export const INCOME_REVERSAL_SEMANTICS = new Set<string>([SemanticType.INCOME_REVERSAL]);

export const EXPENSE_REFUND_SEMANTICS = new Set<string>([
  SemanticType.REFUND,
  SemanticType.CREDIT_REFUND,
  SemanticType.EXPENSE_REVERSAL,
]);

export const LIQUID_ASSET_SUBTYPES = new Set<string>([
  AccountSubtype.CASH,
  AccountSubtype.WALLET,
  AccountSubtype.BANK_CHECKING,
  AccountSubtype.BANK_SAVINGS,
  AccountSubtype.MONEY_MARKET,
]);

export const CREDIT_CARD_SUBTYPE = AccountSubtype.CREDIT_CARD;

export function round(value: number): number {
  return roundToPrecision(Number.isFinite(value) ? value : 0, PRECISION);
}

export function sum(values: readonly number[]): number {
  return round(values.reduce((total, value) => total + value, 0));
}

export function amountInReportCurrency(fact: ReportingFact): number {
  const amount = fact.historicalBaseAmount ?? fact.amount;
  return Math.abs(Number.isFinite(amount) ? amount : 0);
}

function normalizedAccountType(fact: ReportingFact): AccountType | null {
  return Object.values(AccountType).includes(fact.accountType as AccountType)
    ? (fact.accountType as AccountType)
    : null;
}

function normalizedTransactionType(fact: ReportingFact): TransactionType | null {
  return Object.values(TransactionType).includes(fact.transactionType as TransactionType)
    ? (fact.transactionType as TransactionType)
    : null;
}

export function signedDelta(fact: ReportingFact): number {
  if (Number.isFinite(fact.signedBalanceDelta)) return round(fact.signedBalanceDelta as number);

  const accountType = normalizedAccountType(fact);
  const transactionType = normalizedTransactionType(fact);
  if (!accountType || !transactionType) return 0;

  const amount = amountInReportCurrency(fact);
  const positive =
    ((accountType === AccountType.ASSET || accountType === AccountType.EXPENSE) &&
      transactionType === TransactionType.DEBIT) ||
    ((accountType === AccountType.LIABILITY ||
      accountType === AccountType.EQUITY ||
      accountType === AccountType.INCOME) &&
      transactionType === TransactionType.CREDIT);
  return round(positive ? amount : -amount);
}

export function semantic(fact: ReportingFact): string | undefined {
  return fact.semanticType == null ? undefined : String(fact.semanticType);
}

export function isExpenseRefund(fact: ReportingFact): boolean {
  const type = semantic(fact);
  return signedDelta(fact) < 0 || (type !== undefined && EXPENSE_REFUND_SEMANTICS.has(type));
}

export function isIncomeReversal(fact: ReportingFact): boolean {
  const type = semantic(fact);
  return signedDelta(fact) < 0 || (type !== undefined && INCOME_REVERSAL_SEMANTICS.has(type));
}

export function isInternalTransferSemantic(fact: ReportingFact): boolean {
  const type = semantic(fact);
  return type !== undefined && INTERNAL_TRANSFER_SEMANTICS.has(type);
}

export function isLeafFact(fact: ReportingFact): boolean {
  return fact.isLeafAccount !== false;
}

export function isIncomeFact(fact: ReportingFact): boolean {
  return fact.accountType === AccountType.INCOME;
}

export function isExpenseFact(fact: ReportingFact): boolean {
  return fact.accountType === AccountType.EXPENSE;
}

export function isAssetFact(fact: ReportingFact): boolean {
  return fact.accountType === AccountType.ASSET;
}

export function isLiabilityFact(fact: ReportingFact): boolean {
  return fact.accountType === AccountType.LIABILITY;
}

export function isLiquidAssetFact(fact: ReportingFact): boolean {
  return isAssetFact(fact) && LIQUID_ASSET_SUBTYPES.has(String(fact.accountSubtype));
}

export function isCreditCardFact(fact: ReportingFact): boolean {
  return isLiabilityFact(fact) && fact.accountSubtype === CREDIT_CARD_SUBTYPE;
}

export function isCreditCardPurchaseSemantic(fact: ReportingFact): boolean {
  const type = semantic(fact);
  return type === SemanticType.EXPENSE_ON_CREDIT || type === SemanticType.PURCHASE;
}

export function isDebtPaymentSemantic(fact: ReportingFact): boolean {
  const type = semantic(fact);
  return type === SemanticType.DEBT_PAYMENT || type === SemanticType.DEBT_PAYDOWN;
}

export function isBorrowingSemantic(fact: ReportingFact): boolean {
  return semantic(fact) === SemanticType.BORROWING;
}

export function isOwnerWithdrawalSemantic(fact: ReportingFact): boolean {
  return semantic(fact) === SemanticType.OWNER_WITHDRAWAL;
}

export function journalGroups(facts: readonly ReportingFact[]): Map<string, ReportingFact[]> {
  const groups = new Map<string, ReportingFact[]>();
  for (const fact of facts) {
    const existing = groups.get(fact.journalId);
    if (existing) existing.push(fact);
    else groups.set(fact.journalId, [fact]);
  }
  return groups;
}

/**
 * Reclassifications and explicit transfers are not economic spending/income.
 * A display-type transfer is only excluded when the journal has no P&L line;
 * debt payments remain cash flow events and credit-card purchases remain
 * spending events.
 */
export function isNonEconomicFlowJournal(facts: readonly ReportingFact[]): boolean {
  if (facts.some(isInternalTransferSemantic)) return true;
  const hasIncomeOrExpense = facts.some(fact => isIncomeFact(fact) || isExpenseFact(fact));
  return (
    facts.some(fact => fact.journalDisplayType === JournalDisplayType.TRANSFER) &&
    !hasIncomeOrExpense
  );
}

export function resolveCurrentPeriod(query: ReportQuery): ReportPeriod {
  const period: ReportPeriod = query.period ?? {
    startDate: query.startDate as number,
    endDate: query.endDate as number,
  };
  if (!Number.isFinite(period.startDate) || !Number.isFinite(period.endDate)) {
    throw new RangeError('Reports V2 requires finite period startDate and endDate');
  }
  if (period.endDate < period.startDate) {
    throw new RangeError('Reports V2 period endDate must be >= startDate');
  }
  return {
    startDate: period.startDate,
    endDate: period.endDate,
    timeZone: period.timeZone,
  };
}

export function resolveComparisonPeriod(
  query: ReportQuery,
  current: ReportPeriod,
): ReportPeriod | null {
  if (query.comparisonPeriod) return query.comparisonPeriod;
  const comparison = String(query.comparison ?? 'NONE') as ReportComparison;
  if (comparison === 'NONE') return null;

  if (comparison === 'PREVIOUS_YEAR') {
    const start = new Date(current.startDate);
    const end = new Date(current.endDate);
    start.setUTCFullYear(start.getUTCFullYear() - 1);
    end.setUTCFullYear(end.getUTCFullYear() - 1);
    return { startDate: start.getTime(), endDate: end.getTime(), timeZone: current.timeZone };
  }

  const duration = current.endDate - current.startDate;
  const endDate = current.startDate - 1;
  return {
    startDate: endDate - duration,
    endDate,
    timeZone: current.timeZone,
  };
}

export function factsInPeriod(
  facts: readonly ReportingFact[],
  period: ReportPeriod,
): ReportingFact[] {
  return facts.filter(
    fact => fact.journalDate >= period.startDate && fact.journalDate <= period.endDate,
  );
}

export function granularityFor(query: ReportQuery, period: ReportPeriod): ReportGranularity {
  if (query.granularity && query.granularity !== 'AUTO') return query.granularity;
  const days = (period.endDate - period.startDate) / 86_400_000;
  if (days <= 31) return 'DAY';
  if (days <= 120) return 'WEEK';
  return 'MONTH';
}

function utcDayStart(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function bucketStartFor(timestamp: number, granularity: ReportGranularity): number {
  const date = new Date(timestamp);
  if (granularity === 'DAY') return utcDayStart(timestamp);
  if (granularity === 'MONTH') {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  }

  const day = date.getUTCDay();
  const daysFromMonday = (day + 6) % 7;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - daysFromMonday);
}

function bucketEndFor(startDate: number, granularity: ReportGranularity): number {
  const date = new Date(startDate);
  if (granularity === 'DAY') return startDate + 86_400_000 - 1;
  if (granularity === 'MONTH') {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) - 1;
  }
  return startDate + 7 * 86_400_000 - 1;
}

function nextBucketStart(startDate: number, granularity: ReportGranularity): number {
  const date = new Date(startDate);
  if (granularity === 'DAY') return startDate + 86_400_000;
  if (granularity === 'MONTH') return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  return startDate + 7 * 86_400_000;
}

function bucketLabel(startDate: number, granularity: ReportGranularity): string {
  const date = new Date(startDate);
  if (granularity === 'MONTH') {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  const iso = date.toISOString().slice(0, 10);
  return granularity === 'WEEK' ? `Week of ${iso}` : iso;
}

export function makeBuckets(period: ReportPeriod, granularity: ReportGranularity): ReportBucket[] {
  const buckets: ReportBucket[] = [];
  let cursor = bucketStartFor(period.startDate, granularity);
  const finalBucketStart = bucketStartFor(period.endDate, granularity);

  while (cursor <= finalBucketStart) {
    buckets.push({
      startDate: Math.max(cursor, period.startDate),
      endDate: Math.min(bucketEndFor(cursor, granularity), period.endDate),
      label: bucketLabel(cursor, granularity),
    });
    cursor = nextBucketStart(cursor, granularity);
  }
  return buckets;
}

export function bucketForDate(
  buckets: readonly ReportBucket[],
  timestamp: number,
): ReportBucket | undefined {
  return buckets.find(bucket => timestamp >= bucket.startDate && timestamp <= bucket.endDate);
}

export function comparisonMetric(
  current: number,
  previous: number | null,
): {
  current: number;
  previous: number | null;
  change: number | null;
  percentChange: number | null;
} {
  const roundedCurrent = round(current);
  if (previous === null) {
    return { current: roundedCurrent, previous: null, change: null, percentChange: null };
  }
  const roundedPrevious = round(previous);
  const change = round(roundedCurrent - roundedPrevious);
  return {
    current: roundedCurrent,
    previous: roundedPrevious,
    change,
    percentChange: roundedPrevious === 0 ? null : round((change / Math.abs(roundedPrevious)) * 100),
  };
}

export function reportBalanceAmount(balance: ReportBalanceInput): number {
  const value = balance.reportCurrencyBalance ?? balance.balance;
  return round(Number.isFinite(value) ? value : 0);
}

export function isBalanceLeaf(balance: ReportBalanceInput): boolean {
  return balance.isLeafAccount !== false;
}

export function balancePath(balance: ReportBalanceInput): string[] {
  return [...(balance.accountPath ?? [balance.accountId])];
}

export function accountGroupKey(fact: ReportingFact): string {
  return fact.accountId;
}

export function subtypeGroupKey(fact: ReportingFact): string {
  return String(fact.accountSubtype ?? 'OTHER');
}

export function balanceSubtypeGroupKey(balance: ReportBalanceInput): string {
  return String(balance.accountSubtype ?? 'OTHER');
}

export function reportCurrencyFor(query: ReportQuery): string | undefined {
  return query.targetCurrency;
}

export function periodHasDate(period: ReportPeriod, timestamp: number): boolean {
  return timestamp >= period.startDate && timestamp <= period.endDate;
}
