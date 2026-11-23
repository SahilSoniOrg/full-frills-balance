import { AuditAction } from '@/src/types/enums';
import { getAuditEventFieldDeltas, isAuditEventPayload } from '@/src/domain/audit/auditEvents';
import { stableAuditJson } from '@/src/domain/audit/stableAuditJson';
import type { RevertCapability } from '@/src/services/revert-registry';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalQueryRepository';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';

export type AuditChanges = Record<string, unknown> & {
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  fields?: Record<string, unknown>;
  eventType?: string;
};

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function eventFieldNames(changes: AuditChanges): string[] {
  if (isAuditEventPayload(changes)) {
    return Object.keys(getAuditEventFieldDeltas(changes));
  }
  const fields = asRecord(changes.fields);
  if (fields) return Object.keys(fields);
  const after = asRecord(changes.after);
  if (after) return Object.keys(after).filter(key => key !== 'action');
  const before = asRecord(changes.before);
  return before ? Object.keys(before).filter(key => key !== 'action') : [];
}

export function expectedJournalFields(changes: AuditChanges): Record<string, unknown> {
  const after = asRecord(changes.after);
  if (!after) return {};
  return Object.fromEntries(
    eventFieldNames(changes)
      .filter(field => Object.prototype.hasOwnProperty.call(after, field))
      .map(field => [field, after[field]]),
  );
}

export function capabilityForFields(allowed: ReadonlySet<string>): RevertCapability {
  return (action, rawChanges) => {
    if (action === AuditAction.CREATE || action === AuditAction.DELETE) return true;
    const changes = rawChanges as AuditChanges;
    if (!changes.before) return false;
    if ('deletedAt' in changes.before) return true;
    const fields = eventFieldNames(changes);
    return fields.length > 0 && fields.every(field => allowed.has(field));
  };
}

export function normalizedJournalSnapshot(
  journal: Awaited<ReturnType<typeof journalQueryRepository.find>>,
  transactions: Awaited<ReturnType<typeof transactionQueryRepository.findByJournal>>,
): Record<string, unknown> {
  if (!journal) return {};
  return {
    description: journal.description ?? null,
    notes: journal.notes ?? null,
    journalDate: journal.journalDate,
    currencyCode: journal.currencyCode,
    status: journal.status,
    totalAmount: journal.totalAmount,
    transactions: transactions.map(transaction => ({
      accountId: transaction.accountId,
      amount: transaction.amount,
      transactionType: transaction.transactionType,
      notes: transaction.notes ?? null,
      exchangeRate: transaction.exchangeRate ?? null,
      currencyCode: transaction.currencyCode ?? null,
    })),
  };
}

export function equalAuditValue(field: string, left: unknown, right: unknown): boolean {
  if (field === 'transactions' && Array.isArray(left) && Array.isArray(right)) {
    const sortLines = (lines: unknown[]) =>
      [...lines].sort((a, b) => stableAuditJson(a).localeCompare(stableAuditJson(b)));
    return stableAuditJson(sortLines(left)) === stableAuditJson(sortLines(right));
  }
  return stableAuditJson(left) === stableAuditJson(right);
}

export function matchesCurrentJournal(
  changes: AuditChanges,
  current: Record<string, unknown>,
): boolean {
  const expected = asRecord(changes.after);
  if (!expected) return true;
  const fields = eventFieldNames(changes);
  for (const field of fields) {
    if (!(field in expected)) continue;
    if (!equalAuditValue(field, current[field], expected[field])) return false;
  }
  return true;
}

export function matchesSnapshot(
  expected: Record<string, unknown>,
  current: Record<string, unknown>,
): boolean {
  return Object.entries(expected)
    .filter(([field]) => field !== 'action')
    .every(([field, value]) => equalAuditValue(field, current[field], value));
}

export const accountRevertibleFields = new Set([
  'name',
  'accountType',
  'accountSubtype',
  'currencyCode',
  'description',
  'icon',
  'color',
  'parentAccountId',
  'orderNum',
  'reconciledAt',
  'deletedAt',
  'archivedAt',
  'metadata',
]);

export const journalRevertibleFields = new Set([
  'description',
  'notes',
  'journalDate',
  'currencyCode',
  'status',
  'totalAmount',
  'transactions',
  'deletedAt',
]);

export const workplaceRevertibleFields = new Set(['name', 'icon', 'defaultCurrencyCode']);

export const budgetRevertibleFields = new Set([
  'name',
  'amount',
  'currencyCode',
  'startMonth',
  'intervalType',
  'intervalN',
  'startDate',
  'recurrenceDay',
  'recurrenceMonth',
  'active',
  'assetAccountIds',
  'scopedAccountIds',
]);

export const plannedPaymentRevertibleFields = new Set([
  'name',
  'description',
  'amount',
  'currencyCode',
  'fxMode',
  'destinationAmount',
  'fromAccountId',
  'toAccountId',
  'intervalN',
  'intervalType',
  'startDate',
  'endDate',
  'nextOccurrence',
  'isAutoPost',
  'recurrenceDay',
  'recurrenceMonth',
]);
