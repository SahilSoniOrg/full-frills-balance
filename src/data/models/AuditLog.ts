import BaseScopedModel from '@/src/data/models/BaseScopedModel';
import { AuditAction, AuditEntityType } from '@/src/types/enums';
import { AUDIT_EVENT_SCHEMA_VERSION } from '@/src/types/auditEvents';
import type { AuditActor } from '@/src/types/auditEvents';
import { PlainAuditLog } from '@/src/types/plainDtos';
import { date, field } from '@nozbe/watermelondb/decorators';

export type ParsedAuditChanges = {
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  schemaVersion?: number;
  eventType?: string;
  source?: string;
  actor?: AuditActor;
  undoable?: boolean;
  fields?: Record<string, { before: unknown; after: unknown }>;
  details?: Record<string, unknown>;
  revertsLogId?: string;
  correlationId?: string;
  [key: string]: unknown;
};

export default class AuditLog extends BaseScopedModel {
  static table = 'audit_logs';

  @field('entity_type') entityType!: AuditEntityType;
  @field('entity_id') entityId!: string;
  @field('action') action!: AuditAction;
  @field('changes') changes!: string; // Versioned event payload; legacy before/after payloads remain readable.
  @field('timestamp') timestamp!: number;
  @field('source') source!: string | null;
  @field('event_type') eventType!: string | null;
  @field('correlation_id') correlationId!: string | null;

  @date('created_at') createdAt!: Date;

  // Helper to parse changes JSON
  get parsedChanges(): ParsedAuditChanges | null {
    try {
      const parsed: unknown = JSON.parse(this.changes);
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as ParsedAuditChanges)
        : null;
    } catch {
      return null;
    }
  }

  get canRevert(): boolean {
    const changes = this.parsedChanges;
    if (!changes) return false;

    if ('schemaVersion' in changes) {
      return (
        (changes.schemaVersion === 1 ||
          changes.schemaVersion === AUDIT_EVENT_SCHEMA_VERSION) &&
        changes.undoable === true
      );
    }

    // Reverting UPDATE needs 'before' state
    if (this.action === AuditAction.UPDATE) {
      return !!changes.before;
    }

    // Reverting DELETE needs 'before' state to recreate
    if (this.action === AuditAction.DELETE) {
      return !!changes.before;
    }

    // Reverting CREATE just deletes the new entity
    return true;
  }
}

export function toPlainAuditLog(log: AuditLog): PlainAuditLog {
  const changes = log.parsedChanges;
  return {
    id: log.id,
    entityType: log.entityType,
    entityId: log.entityId,
    action: log.action,
    changes: log.changes,
    timestamp: log.timestamp,
    eventType:
      log.eventType || changes?.eventType || `${log.entityType}.${log.action.toLowerCase()}`,
    source: log.source || changes?.source || 'app',
    actor: changes?.actor,
    correlationId: log.correlationId || changes?.correlationId,
    revertsLogId: changes?.revertsLogId,
    canRevert: log.canRevert,
  };
}
