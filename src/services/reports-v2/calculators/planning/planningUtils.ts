import { FactStreamsInput, NumberLookup, PlanningFact, PlanningPeriod } from './planningContracts';

export const DEFAULT_PRECISION = 2;

export function roundAmount(value: number, precision: number = DEFAULT_PRECISION): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function upper(value: string | undefined): string {
  return value?.toUpperCase() ?? '';
}

export function isPlannedFact(fact: PlanningFact): boolean {
  return fact.isPlanned === true || upper(fact.journalStatus) === 'PLANNED';
}

export function isPostedFact(fact: PlanningFact): boolean {
  if (fact.isPlanned === true) return false;
  if (!fact.journalStatus) return true;
  return upper(fact.journalStatus) === 'POSTED';
}

export function selectActualFacts(input: FactStreamsInput): PlanningFact[] {
  const source = input.actualFacts ?? input.postedFacts ?? input.facts ?? [];
  return source.filter(isPostedFact);
}

export function selectPlannedFacts(input: FactStreamsInput): PlanningFact[] {
  if (input.plannedFacts) {
    return input.plannedFacts.filter(fact => !fact.journalStatus || isPlannedFact(fact));
  }
  return (input.facts ?? []).filter(isPlannedFact);
}

export function signedDelta(fact: PlanningFact): number {
  if (Number.isFinite(fact.signedBalanceDelta)) return fact.signedBalanceDelta as number;

  const amount = Number.isFinite(fact.amount) ? fact.amount : 0;
  const debit = upper(fact.transactionType) === 'DEBIT';
  const type = upper(fact.accountType);
  if (type === 'ASSET' || type === 'EXPENSE') return debit ? amount : -amount;
  if (type === 'LIABILITY' || type === 'EQUITY' || type === 'INCOME') {
    return debit ? -amount : amount;
  }
  return 0;
}

export function inPeriod(fact: PlanningFact, period: PlanningPeriod): boolean {
  return fact.journalDate >= period.startDate && fact.journalDate <= period.endDate;
}

export function isLeafFact(fact: PlanningFact): boolean {
  return fact.isLeafAccount !== false;
}

export function journalIds(facts: readonly PlanningFact[]): string[] {
  return unique(facts.map(fact => fact.journalId));
}

export function accountIds(facts: readonly PlanningFact[]): string[] {
  return unique(facts.map(fact => fact.accountId));
}

export function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

export function lookupNumber(lookup: NumberLookup | undefined, key: string): number | undefined {
  if (!lookup) return undefined;
  if (lookup instanceof Map) return lookup.get(key);
  return (lookup as Readonly<Record<string, number>>)[key];
}

export function dateKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dayTimestamp(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function periodDayTimestamps(period: PlanningPeriod): number[] {
  const start = dayTimestamp(period.startDate);
  const end = dayTimestamp(period.endDate);
  const days: number[] = [];
  for (let current = start; current <= end; current += 86_400_000) days.push(current);
  return days;
}

export function percentage(value: number, divisor: number, precision: number): number | null {
  if (divisor === 0) return null;
  return roundAmount((value / divisor) * 100, precision);
}

export function periodProgress(period: PlanningPeriod, precision: number): number | null {
  if (period.asOfDate === undefined) return null;
  const duration = period.endDate - period.startDate;
  if (duration <= 0) return 1;
  const elapsed = Math.min(Math.max(period.asOfDate - period.startDate, 0), duration);
  return roundAmount(elapsed / duration, precision + 4);
}
