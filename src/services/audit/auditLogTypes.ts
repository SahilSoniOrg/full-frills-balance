import { resolveAuditDisplayName } from '@/src/services/audit-identity';
import { AuditAction } from '@/src/types/enums';
import { getAuditEntityCapabilities } from '@/src/types/auditEntityCapabilities';
import { AccountId } from '@/src/types/ids';
import {
  AuditEventPayload,
  getAuditEventFieldDeltas,
  isAuditEventPayload,
} from '@/src/types/auditEvents';
import type { AuditActor } from '@/src/types/auditEvents';

export interface EntityStatus {
  exists: boolean;
  isDeleted: boolean;
}

export interface AuditLogEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: AuditAction;
  changes: string;
  timestamp: number;
  eventType?: string;
  source?: string;
  actor?: AuditActor;
  correlationId?: string;
  revertsLogId?: string;
  canRevert?: boolean;
}

export type AuditChangePrimitive = string | number | boolean | null;
export type AuditChangeValue = AuditChangePrimitive | AuditChangeRecord | AuditChangeValue[];

export interface AuditChangeRecord {
  [key: string]: AuditChangeValue | undefined;
}

export interface ParsedBeforeAfterChanges {
  before?: AuditChangeRecord;
  after?: AuditChangeRecord;
}

export type ParsedChanges = ParsedBeforeAfterChanges | AuditChangeRecord | AuditEventPayload;

export interface AuditTransactionSnapshot {
  accountId: AccountId;
  amount: number;
  type: string;
  accountName?: string;
  currencyCode?: string;
}

export function isAuditChangeRecord(value: unknown): value is AuditChangeRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isTransactionSnapshot(value: unknown): value is AuditTransactionSnapshot {
  if (!isAuditChangeRecord(value)) return false;
  return typeof value.accountId === 'string' && typeof value.amount === 'number';
}

export function parseAuditChanges(changes: string): ParsedChanges | null {
  try {
    const parsed: unknown = JSON.parse(changes);
    if (isAuditEventPayload(parsed)) return parsed;
    if (!isAuditChangeRecord(parsed)) return null;
    return parsed as ParsedChanges;
  } catch {
    return null;
  }
}

export function mergeAuditLogsById<T extends { id: string; timestamp: number }>(
  ...groups: readonly T[][]
): T[] {
  const byId = new Map<string, T>();
  for (const group of groups) {
    for (const entry of group) byId.set(entry.id, entry);
  }
  return [...byId.values()].sort((left, right) => {
    if (left.timestamp !== right.timestamp) return right.timestamp - left.timestamp;
    if (left.id === right.id) return 0;
    return left.id < right.id ? 1 : -1;
  });
}

const PAST_TENSE_CRUD: Record<string, string> = {
  create: 'created',
  update: 'updated',
  delete: 'deleted',
};

/**
 * The domain event a log records. Generic `<entity>.create` names and rows written before event
 * types existed map onto the `<entity>.created`-style domain events.
 */
export function resolveAuditEventType(
  log: Pick<AuditLogEntry, 'entityType' | 'action' | 'eventType'>,
  parsed: ParsedChanges | null,
): string {
  const raw =
    log.eventType ??
    (parsed && isAuditEventPayload(parsed)
      ? parsed.eventType
      : `${log.entityType}.${log.action.toLowerCase()}`);
  const [entity, verb] = raw.split('.');
  return PAST_TENSE_CRUD[verb] ? `${entity}.${PAST_TENSE_CRUD[verb]}` : raw;
}

export function getEntityDisplayName(parsed: ParsedChanges | null): string {
  if (!parsed) return '';
  if (isAuditEventPayload(parsed) && parsed.displayName) return parsed.displayName;
  const records: AuditChangeRecord[] = isAuditEventPayload(parsed)
    ? [parsed.details, parsed.after ?? {}, parsed.before ?? {}]
    : [
        ...('after' in parsed && isAuditChangeRecord(parsed.after) ? [parsed.after] : []),
        ...('before' in parsed && isAuditChangeRecord(parsed.before) ? [parsed.before] : []),
        parsed as AuditChangeRecord,
      ];
  return resolveAuditDisplayName(...records) ?? '';
}

export function getAuditFieldDiff(
  changes: ParsedChanges,
): (ParsedBeforeAfterChanges & { before: AuditChangeRecord; after: AuditChangeRecord }) | null {
  if (isAuditEventPayload(changes)) {
    const before: AuditChangeRecord = {};
    const after: AuditChangeRecord = {};
    for (const [key, delta] of Object.entries(getAuditEventFieldDeltas(changes))) {
      before[key] = delta.before as AuditChangeValue;
      after[key] = delta.after as AuditChangeValue;
    }
    if (Object.keys(before).length === 0) return null;
    const currencyCode =
      changes.currencyCode ?? changes.after?.currencyCode ?? changes.before?.currencyCode;
    if (typeof currencyCode === 'string') {
      before.currencyCode ??= currencyCode;
      after.currencyCode ??= currencyCode;
    }
    return { before, after };
  }

  if (!hasBeforeAfterChanges(changes)) return null;
  const { before, after } = changes;
  // Older account updates used a full `before` snapshot and a sparse `after` patch.
  // Treat only the after keys as changed so untouched fields are not shown as cleared.
  const keys = Object.keys(after).filter(key => key !== 'action');
  if (keys.length === 0) return null;
  const projectedBefore: AuditChangeRecord = {};
  const projectedAfter: AuditChangeRecord = {};
  for (const key of keys) {
    projectedBefore[key] = Object.prototype.hasOwnProperty.call(before, key) ? before[key] : null;
    projectedAfter[key] = after[key] ?? null;
  }
  return { before: projectedBefore, after: projectedAfter };
}

export function getAuditDetails(changes: ParsedChanges): AuditChangeRecord {
  if (isAuditEventPayload(changes)) return changes.details;
  return changes as AuditChangeRecord;
}

export function hasBeforeAfterChanges(
  changes: ParsedChanges,
): changes is ParsedBeforeAfterChanges & { before: AuditChangeRecord; after: AuditChangeRecord } {
  return (
    'before' in changes &&
    'after' in changes &&
    isAuditChangeRecord(changes.before) &&
    isAuditChangeRecord(changes.after)
  );
}

export function getChangeField(
  record: AuditChangeRecord,
  key: string,
): AuditChangeValue | undefined {
  return record[key];
}

export function computeCanRevert(
  item: AuditLogEntry,
  entityStatusMap: Record<string, EntityStatus>,
): boolean {
  if (!item.canRevert) return false;

  const status = entityStatusMap[item.entityId];
  if (!status) return false;

  if (item.action === AuditAction.CREATE) {
    return status.exists && !status.isDeleted;
  }

  if (item.action === AuditAction.DELETE) {
    return (
      status.isDeleted ||
      (!status.exists &&
        getAuditEntityCapabilities(item.entityType).canRecreateAfterDelete === true)
    );
  }

  if (item.action === AuditAction.UPDATE) {
    return status.exists && !status.isDeleted;
  }

  return false;
}
