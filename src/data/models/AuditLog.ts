import BaseScopedModel from '@/src/data/models/BaseScopedModel';
import { date, field } from '@nozbe/watermelondb/decorators';

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
}

export type AuditEntityType = 'account' | 'journal' | 'transaction';

export default class AuditLog extends BaseScopedModel {
  static table = 'audit_logs';

  @field('entity_type') entityType!: AuditEntityType;
  @field('entity_id') entityId!: string;
  @field('action') action!: AuditAction;
  @field('changes') changes!: string; // JSON string of before/after state
  @field('timestamp') timestamp!: number;

  @date('created_at') createdAt!: Date;

  // Helper to parse changes JSON
  get parsedChanges(): any {
    try {
      return JSON.parse(this.changes);
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
