import BaseScopedModel from '@/src/data/models/BaseScopedModel';
import { AuditAction, AuditEntityType, PlainAuditLog } from '@/src/types/domain';
import { date, field } from '@nozbe/watermelondb/decorators';

export { AuditAction };
export type { AuditEntityType };

export type ParsedAuditChanges = {
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  [key: string]: unknown;
};

export default class AuditLog extends BaseScopedModel {
  static table = 'audit_logs';

  @field('entity_type') entityType!: AuditEntityType;
  @field('entity_id') entityId!: string;
  @field('action') action!: AuditAction;
  @field('changes') changes!: string; // JSON string of before/after state
  @field('timestamp') timestamp!: number;

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
  return {
    id: log.id,
    entityType: log.entityType,
    entityId: log.entityId,
    action: log.action,
    changes: log.changes,
    timestamp: log.timestamp,
    canRevert: log.canRevert,
  };
}
