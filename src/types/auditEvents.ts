import { AUDIT_ENTITY_TYPES, AuditAction } from '@/src/types/enums';
import type { AuditEntityType } from '@/src/types/enums';

export const AUDIT_EVENT_SCHEMA_VERSION = 2 as const;

export const DEFAULT_AUDIT_ACTIONS = ['create', 'update', 'delete'] as const;

/**
 * Non-CRUD event names emitted by current writers, plus legacy aliases retained for imports.
 * Add new domain events here so writers get compile-time validation and the UI can label them.
 */
export const AUDIT_DOMAIN_EVENT_TYPES = [
  'account.created',
  'account.imported',
  'account.updated',
  'account.deleted',
  'account.restored',
  'account.reverted',
  'account.archived',
  'account.unarchived',
  'account.merged',
  'account.merged_into',
  'account.hierarchy_retargeted',
  'account.payment_source_retargeted',
  'account.reconciled',
  'account.balance_repaired',
  'journal.created',
  'journal.sms_auto_posted',
  'journal.imported',
  'journal.updated',
  'journal.deleted',
  'journal.restored',
  'journal.posted',
  'journal.reversed',
  'journal.reversal_created',
  'journal.planned_payment_generated',
  'journal.planned_payment_skipped',
  'journal.opening_balance_created',
  'journal.renamed',
  'journal.reverted',
  'journal.reverted_to_planned',
  'journal.status_changed',
  'journal.accounts_retargeted',
  'exchange_rate.manual_set',
  'budget.created',
  'budget.imported',
  'budget.updated',
  'budget.deleted',
  'budget.restored',
  'budget.reverted',
  'budget.accounts_retargeted',
  'planned_payment.created',
  'planned_payment.imported',
  'planned_payment.deleted',
  'planned_payment.updated',
  'planned_payment.completed',
  'planned_payment.accounts_retargeted',
  'planned_payment.status_changed',
  'planned_payment.schedule_advanced',
  'planned_payment.reverted',
  'transaction_auto_post_rule.created',
  'transaction_auto_post_rule.imported',
  'transaction_auto_post_rule.updated',
  'transaction_auto_post_rule.deleted',
  'transaction_auto_post_rule.accounts_retargeted',
  'transaction_inbox_record.created',
  'transaction_inbox_record.updated',
  'transaction_inbox_record.linked',
  'transaction_inbox_record.status_changed',
  'transaction_inbox_record.imported',
  'workplace.created',
  'workplace.updated',
  'workplace.restored',
  'workplace.currency_migrated',
  'workplace.reverted',
] as const satisfies readonly `${AuditEntityType}.${string}`[];

export type AuditEventType =
  | `${AuditEntityType}.${(typeof DEFAULT_AUDIT_ACTIONS)[number]}`
  | (typeof AUDIT_DOMAIN_EVENT_TYPES)[number];

export const AUDIT_EVENT_TYPES: readonly AuditEventType[] = [
  ...AUDIT_ENTITY_TYPES.flatMap(entityType =>
    DEFAULT_AUDIT_ACTIONS.map(action => `${entityType}.${action}` as AuditEventType),
  ),
  ...AUDIT_DOMAIN_EVENT_TYPES,
];

export type AuditJsonValue = string | number | boolean | null | AuditJsonObject | AuditJsonValue[];

export interface AuditJsonObject {
  [key: string]: AuditJsonValue;
}

export interface AuditFieldDelta {
  before: AuditJsonValue;
  after: AuditJsonValue;
}

export type AuditEventSource = 'app' | 'system' | 'import' | 'repair' | (string & {});

export interface AuditEventMetadata {
  eventType?: AuditEventType;
  source?: AuditEventSource;
  correlationId?: string;
  revertsLogId?: string;
  undoable?: boolean;
}

export interface AuditActor {
  id?: string;
  idScope?: 'local-install' | 'account' | 'organization' | (string & {});
  label?: string;
  type?: 'user' | 'system' | 'unknown' | (string & {});
}

interface AuditEventPayloadBase {
  eventType: string;
  source: AuditEventSource;
  displayName?: string;
  /** Currency context for financial fields, including when the currency did not change. */
  currencyCode?: string;
  actor?: AuditActor;
  correlationId?: string;
  revertsLogId?: string;
  undoable: boolean;
  details: AuditJsonObject;
  before?: AuditJsonObject;
  after?: AuditJsonObject;
}

/** Versioned payload stored in audit_logs.changes. Legacy payloads remain readable. */
export interface LegacyAuditEventPayload extends AuditEventPayloadBase {
  schemaVersion: 1;
  fields: Record<string, AuditFieldDelta>;
}

export interface CompactAuditEventPayload extends AuditEventPayloadBase {
  schemaVersion: typeof AUDIT_EVENT_SCHEMA_VERSION;
  action: AuditAction;
}

export type AuditEventPayload = LegacyAuditEventPayload | CompactAuditEventPayload;

export interface AuditEventInput {
  entityType: AuditEntityType;
  action: AuditAction;
  changes: unknown;
  displayName?: string;
  eventType?: AuditEventType;
  source?: AuditEventSource;
  actor?: AuditActor;
  correlationId?: string;
  revertsLogId?: string;
  undoable?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAuditFieldDeltas(value: unknown): value is Record<string, AuditFieldDelta> {
  return (
    isRecord(value) &&
    Object.values(value).every(delta => isRecord(delta) && 'before' in delta && 'after' in delta)
  );
}

function toAuditJson(value: unknown, ancestors = new Set<object>()): AuditJsonValue {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new Error('Circular audit data');
    ancestors.add(value);
    const result = value.map(item => toAuditJson(item, ancestors));
    ancestors.delete(value);
    return result;
  }
  if (isRecord(value)) {
    if (ancestors.has(value)) throw new Error('Circular audit data');
    ancestors.add(value);
    const result: AuditJsonObject = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = toAuditJson(item, ancestors);
    }
    ancestors.delete(value);
    return result;
  }
  return String(value);
}

function addDelta(
  fields: Record<string, AuditFieldDelta>,
  key: string,
  before: unknown,
  after: unknown,
): void {
  const normalizedBefore = toAuditJson(before);
  const normalizedAfter = toAuditJson(after);
  if (JSON.stringify(normalizedBefore) === JSON.stringify(normalizedAfter)) return;
  fields[key] = { before: normalizedBefore, after: normalizedAfter };
}

function projectAuditSnapshot(
  fields: Record<string, AuditFieldDelta>,
  side: 'before' | 'after',
): AuditJsonObject {
  return Object.fromEntries(
    Object.entries(fields).map(([key, delta]) => [key, delta[side]]),
  ) as AuditJsonObject;
}

function findAuditDisplayName(
  ...records: (Record<string, unknown> | undefined)[]
): string | undefined {
  for (const record of records) {
    if (!record) continue;
    for (const key of ['name', 'description', 'accountName']) {
      if (typeof record[key] === 'string') return record[key] as string;
    }
  }
  return undefined;
}

/** Rebuilds field deltas from snapshots. UPDATE snapshots may have a sparse `after` patch. */
export function deriveAuditFieldDeltas(
  action: AuditAction,
  before?: Record<string, unknown>,
  after?: Record<string, unknown>,
): Record<string, AuditFieldDelta> {
  const fields: Record<string, AuditFieldDelta> = {};

  if (action === AuditAction.CREATE && after) {
    for (const [key, value] of Object.entries(after)) {
      if (key !== 'action') addDelta(fields, key, null, value);
    }
  } else if (action === AuditAction.DELETE && before) {
    for (const [key, value] of Object.entries(before)) {
      if (key !== 'action') addDelta(fields, key, value, null);
    }
  } else if (action === AuditAction.UPDATE && before && after) {
    for (const [key, afterValue] of Object.entries(after)) {
      if (key === 'action') continue;
      addDelta(
        fields,
        key,
        Object.prototype.hasOwnProperty.call(before, key) ? before[key] : null,
        afterValue,
      );
    }
  }

  return fields;
}

export function getAuditEventFieldDeltas(
  payload: AuditEventPayload,
): Record<string, AuditFieldDelta> {
  if (payload.schemaVersion === 1) return payload.fields;
  return deriveAuditFieldDeltas(payload.action, payload.before, payload.after);
}

/** Converts a legacy before/after or flat payload to a versioned event envelope. */
export function createAuditEventPayload(input: AuditEventInput): AuditEventPayload {
  const raw = isRecord(input.changes) ? input.changes : { value: input.changes };
  const before = isRecord(raw.before) ? raw.before : undefined;
  const after = isRecord(raw.after) ? raw.after : undefined;
  const flatCreateSnapshot = input.action === AuditAction.CREATE && !after;
  const stateAfter = after ?? (flatCreateSnapshot ? raw : undefined);
  const fields = deriveAuditFieldDeltas(input.action, before, stateAfter);

  const details: AuditJsonObject = {};
  for (const [key, value] of Object.entries(raw)) {
    if (flatCreateSnapshot) continue;
    if (key === 'before' || key === 'after') continue;
    details[key] = toAuditJson(value);
  }
  if (after && typeof after.action === 'string') details.action = after.action;

  const payload: AuditEventPayload = {
    schemaVersion: AUDIT_EVENT_SCHEMA_VERSION,
    action: input.action,
    eventType: input.eventType ?? `${input.entityType}.${input.action.toLowerCase()}`,
    source: input.source ?? 'app',
    undoable:
      input.undoable ??
      ((input.action === AuditAction.CREATE && Object.keys(fields).length > 0) ||
        (input.action === AuditAction.DELETE && !!before && Object.keys(fields).length > 0) ||
        (input.action === AuditAction.UPDATE && !!before && Object.keys(fields).length > 0)),
    details,
  };

  const displayName = input.displayName ?? findAuditDisplayName(details, stateAfter, before);
  if (displayName) payload.displayName = displayName;
  const currencyCode = stateAfter?.currencyCode ?? before?.currencyCode;
  if (typeof currencyCode === 'string') payload.currencyCode = currencyCode;
  if (input.actor) payload.actor = input.actor;
  if (input.correlationId) payload.correlationId = input.correlationId;
  if (input.revertsLogId) payload.revertsLogId = input.revertsLogId;
  if (before) {
    payload.before =
      input.action === AuditAction.UPDATE
        ? projectAuditSnapshot(fields, 'before')
        : (toAuditJson(before) as AuditJsonObject);
  }
  if (after || flatCreateSnapshot) {
    payload.after =
      input.action === AuditAction.UPDATE
        ? projectAuditSnapshot(fields, 'after')
        : (toAuditJson(stateAfter) as AuditJsonObject);
  }
  return payload;
}

export function isAuditEventPayload(value: unknown): value is AuditEventPayload {
  if (
    !isRecord(value) ||
    typeof value.eventType !== 'string' ||
    typeof value.source !== 'string' ||
    typeof value.undoable !== 'boolean' ||
    (value.displayName !== undefined && typeof value.displayName !== 'string') ||
    (value.currencyCode !== undefined && typeof value.currencyCode !== 'string') ||
    !isRecord(value.details) ||
    (value.before !== undefined && !isRecord(value.before)) ||
    (value.after !== undefined && !isRecord(value.after))
  ) {
    return false;
  }
  if (value.schemaVersion === 1) return isAuditFieldDeltas(value.fields);
  return (
    value.schemaVersion === AUDIT_EVENT_SCHEMA_VERSION &&
    Object.values(AuditAction).includes(value.action as AuditAction)
  );
}
