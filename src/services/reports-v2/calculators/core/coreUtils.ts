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

type ZonedDateParts = { year: number; month: number; day: number; weekday: number };

function zonedParts(timestamp: number, timeZone: string): ZonedDateParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(timestamp);
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(value('weekday'));
  return {
    year: Number(value('year')),
    month: Number(value('month')),
    day: Number(value('day')),
    weekday: weekday < 0 ? 0 : weekday,
  };
}

/** Converts a local calendar midnight in an IANA zone to its UTC timestamp. */
function zonedMidnight(parts: Omit<ZonedDateParts, 'weekday'>, timeZone: string): number {
  let candidate = Date.UTC(parts.year, parts.month - 1, parts.day);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = zonedPartsWithTime(candidate, timeZone);
    const desired = Date.UTC(parts.year, parts.month - 1, parts.day);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    const corrected = candidate + desired - actualAsUtc;
    if (corrected === candidate) break;
    candidate = corrected;
  }
  return candidate;
}

function zonedPartsWithTime(timestamp: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(timestamp);
  const value = (type: string) => Number(parts.find(part => part.type === type)?.value ?? 0);
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  };
}

function calendarStart(
  timestamp: number,
  granularity: ReportGranularity,
  timeZone: string,
): number {
  const date = zonedParts(timestamp, timeZone);
  if (granularity === 'MONTH')
    return zonedMidnight({ year: date.year, month: date.month, day: 1 }, timeZone);
  const daysFromMonday = (date.weekday + 6) % 7;
  const monday = new Date(Date.UTC(date.year, date.month - 1, date.day - daysFromMonday));
  if (granularity === 'WEEK') {
    return zonedMidnight(
      { year: monday.getUTCFullYear(), month: monday.getUTCMonth() + 1, day: monday.getUTCDate() },
      timeZone,
    );
  }
  return zonedMidnight({ year: date.year, month: date.month, day: date.day }, timeZone);
}

function nextCalendarStart(
  startDate: number,
  granularity: ReportGranularity,
  timeZone: string,
): number {
  const date = zonedParts(startDate, timeZone);
  const utcDate = new Date(Date.UTC(date.year, date.month - 1, date.day));
  if (granularity === 'MONTH') utcDate.setUTCMonth(utcDate.getUTCMonth() + 1, 1);
  else utcDate.setUTCDate(utcDate.getUTCDate() + (granularity === 'WEEK' ? 7 : 1));
  return zonedMidnight(
    { year: utcDate.getUTCFullYear(), month: utcDate.getUTCMonth() + 1, day: utcDate.getUTCDate() },
    timeZone,
  );
}

function bucketLabel(startDate: number, granularity: ReportGranularity, timeZone: string): string {
  const date = zonedParts(startDate, timeZone);
  const iso = `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
  return granularity === 'MONTH'
    ? iso.slice(0, 7)
    : granularity === 'WEEK'
      ? `Week of ${iso}`
      : iso;
}

export function makeBuckets(period: ReportPeriod, granularity: ReportGranularity): ReportBucket[] {
  const timeZone = period.timeZone || 'UTC';
  const buckets: ReportBucket[] = [];
  let cursor = calendarStart(period.startDate, granularity, timeZone);
  const finalBucketStart = calendarStart(period.endDate, granularity, timeZone);

  while (cursor <= finalBucketStart) {
    const next = nextCalendarStart(cursor, granularity, timeZone);
    buckets.push({
      startDate: Math.max(cursor, period.startDate),
      endDate: Math.min(next - 1, period.endDate),
      label: bucketLabel(cursor, granularity, timeZone),
    });
    cursor = next;
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
