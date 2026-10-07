import { AppConfig, JOURNAL_DETAILS_LIMITS } from '@/src/constants';
import {
  getAuditDetails,
  getAuditFieldDiff,
  isAuditChangeRecord,
  mergeAuditLogsById,
  parseAuditChanges,
  resolveAuditEventType,
  type AuditChangeRecord,
  type AuditChangeValue,
  type AuditLogEntry,
  type AuditTransactionSnapshot,
  type ParsedChanges,
} from '@/src/services/audit/auditLogTypes';
import {
  asTransactionSnapshots,
  formatAuditAccountLabel,
  shouldHideUnchangedTransactionLeg,
  type AuditAccountMap,
} from '@/src/services/audit/auditLogDiffDisplay';
import { isAuditEventPayload } from '@/src/types/auditEvents';
import { AuditAction } from '@/src/types/enums';
import type { AccountId } from '@/src/types/ids';
import { formatImportSource } from './journalSourcePresentation';

/** `rate` values are masked like money but carry no currency. */
export type JournalHistoryValueFormat = 'money' | 'rate' | 'date' | 'text';

export interface JournalHistoryDetail {
  field: string;
  before: string | number;
  after: string | number;
  format: JournalHistoryValueFormat;
  currencyCode?: string;
  beforeCurrencyCode?: string;
}

export interface JournalHistoryEvent {
  id: string;
  kind: string;
  title: string;
  timestamp: number;
  detail: JournalHistoryDetail[];
  description?: string;
  amount?: number;
  currencyCode?: string;
  canRevert: boolean;
}

// These entries leave the journal's fields untouched, so they don't block undoing the edit before them.
const PASSIVE_EVENTS = ['journal.imported', 'transaction_inbox_record.linked'];
const DIFFED_EVENTS = [
  'journal.updated',
  'journal.renamed',
  'journal.accounts_retargeted',
  'journal.reverted',
];
const FIELD_FORMATS: Record<string, JournalHistoryValueFormat> = {
  amount: 'money',
  totalAmount: 'money',
  parsedAmount: 'money',
  rate: 'rate',
  exchangeRate: 'rate',
  journalDate: 'date',
};

interface DiffCurrencies {
  before?: string;
  after?: string;
}

function primitive(value: AuditChangeValue | undefined): string | number {
  return typeof value === 'number' || typeof value === 'string'
    ? value
    : AppConfig.strings.audit.notSet;
}

function afterRecord(parsed: ParsedChanges | null): AuditChangeRecord | undefined {
  return parsed && 'after' in parsed && isAuditChangeRecord(parsed.after)
    ? parsed.after
    : undefined;
}

function fieldLabel(key: string): string | undefined {
  const labels: Record<string, string> = AppConfig.strings.journalDetails.field;
  return labels[key] ?? AppConfig.strings.audit.fieldLabels[key];
}

function eventTitle(kind: string): string {
  const labels: Record<string, string> = AppConfig.strings.journalDetails.events;
  return labels[kind] ?? AppConfig.strings.audit.eventLabels[kind] ?? labels['journal.updated'];
}

/** Every account a journal's history mentions, including ones it no longer uses. */
export function journalHistoryAccountIds(logs: readonly AuditLogEntry[]): AccountId[] {
  const ids = new Set<AccountId>();
  for (const log of logs) {
    const parsed = parseAuditChanges(log.changes);
    if (!parsed) continue;
    const diff = getAuditFieldDiff(parsed);
    for (const value of [
      diff?.before.transactions,
      diff?.after.transactions,
      afterRecord(parsed)?.transactions,
      getAuditDetails(parsed).transactions,
    ])
      for (const leg of asTransactionSnapshots(value)) ids.add(leg.accountId);
  }
  return [...ids].sort();
}

function diffTransactionLegs(
  beforeValue: AuditChangeValue | undefined,
  afterValue: AuditChangeValue | undefined,
  totals: { before?: AuditChangeValue; after?: AuditChangeValue },
  currencies: DiffCurrencies,
  accountMap: AuditAccountMap,
): JournalHistoryDetail[] {
  const strings = AppConfig.strings.journalDetails;
  const label = (leg: AuditTransactionSnapshot) =>
    formatAuditAccountLabel(leg.accountId, leg, accountMap);
  const beforeLegs = asTransactionSnapshots(beforeValue);
  const afterLegs = asTransactionSnapshots(afterValue);
  const detail: JournalHistoryDetail[] = [];

  // Match unchanged accounts first; pair retargeted legs only when there is one unambiguous pair.
  const removed = beforeLegs.filter(
    leg => !afterLegs.some(item => item.accountId === leg.accountId),
  );
  const added = afterLegs.filter(leg => !beforeLegs.some(item => item.accountId === leg.accountId));
  if (removed.length === 1 && added.length === 1 && removed[0].type === added[0].type) {
    detail.push({
      field: removed[0].type === 'DEBIT' ? strings.field.category : strings.field.account,
      before: label(removed[0]),
      after: label(added[0]),
      format: 'text',
    });
  }

  // The Amount line already says this; repeating it per entry is noise.
  const movedWithTotal = (old: AuditTransactionSnapshot, leg: AuditTransactionSnapshot) =>
    typeof totals.before === 'number' &&
    typeof totals.after === 'number' &&
    totals.before !== totals.after &&
    old.amount === totals.before &&
    leg.amount === totals.after &&
    (old.currencyCode ?? currencies.before) === currencies.before &&
    (leg.currencyCode ?? currencies.after) === currencies.after;
  let coveredByTotal = false;
  for (const leg of afterLegs) {
    const old = beforeLegs.find(item => item.accountId === leg.accountId);
    if (!old || shouldHideUnchangedTransactionLeg(old, leg)) continue;
    if (movedWithTotal(old, leg)) {
      coveredByTotal = true;
      continue;
    }
    detail.push({
      field: label(leg),
      before: old.amount,
      after: leg.amount,
      format: 'money',
      currencyCode: leg.currencyCode ?? old.currencyCode ?? currencies.after,
      beforeCurrencyCode: old.currencyCode ?? currencies.before,
    });
  }

  if (detail.length === 0 && !coveredByTotal) {
    detail.push({
      field: strings.field.transactions,
      before: strings.entries(beforeLegs.length),
      after: strings.entries(afterLegs.length),
      format: 'text',
    });
  }
  return detail;
}

function diffFields(
  diff: { before: AuditChangeRecord; after: AuditChangeRecord },
  currencies: DiffCurrencies,
  accountMap: AuditAccountMap,
): JournalHistoryDetail[] {
  const detail: JournalHistoryDetail[] = [];
  for (const key of Object.keys(diff.after)) {
    const before = diff.before[key];
    const after = diff.after[key];
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    if (key === 'transactions') {
      detail.push(
        ...diffTransactionLegs(
          before,
          after,
          { before: diff.before.totalAmount, after: diff.after.totalAmount },
          currencies,
          accountMap,
        ),
      );
      continue;
    }
    const field = fieldLabel(key);
    const isNested = (value: AuditChangeValue | undefined) =>
      value !== null && typeof value === 'object';
    if (!field || isNested(before) || isNested(after)) continue;
    const format = FIELD_FORMATS[key] ?? 'text';
    detail.push({
      field,
      before: primitive(before),
      after: primitive(after),
      format,
      ...(format === 'money'
        ? { currencyCode: currencies.after, beforeCurrencyCode: currencies.before }
        : {}),
    });
  }
  return detail;
}

function describeEvent(
  kind: string,
  details: AuditChangeRecord,
  snapshot: AuditChangeRecord,
  accountMap: AuditAccountMap,
): string | undefined {
  if (kind === 'journal.imported') {
    const source = details.importSource ?? details.source ?? snapshot.importSource;
    return typeof source === 'string' ? formatImportSource(source) : undefined;
  }
  if (kind === 'transaction_inbox_record.linked') {
    return typeof details.senderAddress === 'string' ? details.senderAddress : undefined;
  }
  if (kind !== 'journal.created' && kind !== 'journal.sms_auto_posted') return undefined;
  const legs = asTransactionSnapshots(snapshot.transactions);
  const from = legs.filter(leg => leg.type === 'CREDIT');
  const to = legs.filter(leg => leg.type === 'DEBIT');
  if (from.length === 0 || to.length === 0) return undefined;
  const names = (side: AuditTransactionSnapshot[]) =>
    side.length === 1
      ? formatAuditAccountLabel(side[0].accountId, side[0], accountMap)
      : AppConfig.strings.journalDetails.accounts(side.length);
  return AppConfig.strings.journalDetails.flow(names(from), names(to));
}

function toHistoryEvent(log: AuditLogEntry, accountMap: AuditAccountMap): JournalHistoryEvent {
  const parsed = parseAuditChanges(log.changes);
  const kind = resolveAuditEventType(log, parsed);
  const details = parsed ? getAuditDetails(parsed) : {};
  const snapshot = afterRecord(parsed) ?? details;
  const currencyCode =
    typeof snapshot.currencyCode === 'string'
      ? snapshot.currencyCode
      : parsed && isAuditEventPayload(parsed)
        ? parsed.currencyCode
        : undefined;
  const diff = parsed && DIFFED_EVENTS.includes(kind) ? getAuditFieldDiff(parsed) : null;
  const beforeCurrencyCode =
    typeof diff?.before.currencyCode === 'string' ? diff.before.currencyCode : currencyCode;
  return {
    id: log.id,
    kind,
    title: eventTitle(kind),
    timestamp: log.timestamp,
    detail: diff
      ? diffFields(diff, { before: beforeCurrencyCode, after: currencyCode }, accountMap)
      : [],
    description: describeEvent(kind, details, snapshot, accountMap),
    amount: typeof snapshot.totalAmount === 'number' ? snapshot.totalAmount : undefined,
    currencyCode,
    // Creating a journal is undone by deleting it. That belongs to Delete, not this edit action.
    canRevert: log.canRevert === true && log.action === AuditAction.UPDATE,
  };
}

/**
 * A revert and the change it undid cancel out here; the full log keeps both.
 * Newest first, so a revert of a revert brings the original change back into view.
 */
function withoutCancelledChanges(logs: readonly AuditLogEntry[]): AuditLogEntry[] {
  const cancelled = new Set<string>();
  return mergeAuditLogsById([...logs]).filter(log => {
    if (cancelled.has(log.id)) return false;
    if (!log.revertsLogId) return true;
    cancelled.add(log.revertsLogId);
    return false;
  });
}

export function mapJournalHistory(
  logs: readonly AuditLogEntry[],
  accountMap: AuditAccountMap = {},
): JournalHistoryEvent[] {
  const events = withoutCancelledChanges(logs)
    .slice(0, JOURNAL_DETAILS_LIMITS.historyEvents)
    .map(log => toHistoryEvent(log, accountMap));
  // Older edits conflict with whatever changed the journal after them.
  const newest = events.find(event => !PASSIVE_EVENTS.includes(event.kind));
  return events.map(event => ({ ...event, canRevert: event.canRevert && event === newest }));
}
