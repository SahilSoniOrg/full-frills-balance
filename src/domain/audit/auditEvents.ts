import { AuditAction } from '@/src/types/enums';
import { AUDIT_EVENT_SCHEMA_VERSION } from '@/src/types/auditEvents';
import type {
  AuditEventInput,
  AuditEventPayload,
  AuditFieldDelta,
  AuditJsonObject,
  AuditJsonValue,
} from '@/src/types/auditEvents';

export function resolveAuditDisplayName(
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

  const displayName = input.displayName ?? resolveAuditDisplayName(details, stateAfter, before);
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
