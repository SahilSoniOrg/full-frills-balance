import { AuditAction } from '@/src/data/models/AuditLog';
import { AccountId } from '@/src/types/domain';

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

export type ParsedChanges = ParsedBeforeAfterChanges | AuditChangeRecord;

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
    if (!isAuditChangeRecord(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getEntityDisplayName(parsed: ParsedChanges | null): string {
  if (!parsed) return '';
  let record: AuditChangeRecord;
  if ('after' in parsed && isAuditChangeRecord(parsed.after)) {
    record = parsed.after;
  } else if ('before' in parsed && isAuditChangeRecord(parsed.before)) {
    record = parsed.before;
  } else if (isAuditChangeRecord(parsed)) {
    record = parsed;
  } else {
    return '';
  }
  const name = record.name;
  const description = record.description;
  if (typeof name === 'string') return name;
  if (typeof description === 'string') return description;
  return '';
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
  if (!status || !status.exists) {
    return false;
  }

  if (item.action === AuditAction.CREATE) {
    return !status.isDeleted;
  }

  if (item.action === AuditAction.DELETE) {
    return status.isDeleted;
  }

  if (item.action === AuditAction.UPDATE) {
    return !status.isDeleted;
  }

  return false;
}
