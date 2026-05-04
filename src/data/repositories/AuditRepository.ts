import { AppConfig } from '@/src/constants/app-config';
import { database } from '@/src/data/database/Database';
import AuditLog, { AuditAction, AuditEntityType } from '@/src/data/models/AuditLog';
import { logger } from '@/src/utils/logger';
import { Q } from '@nozbe/watermelondb';

export interface AuditEntry<T = any> {
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  changes: T; // Will be JSON stringified
}

export class AuditRepository {
  private get auditLogs() {
    return database.collections.get<AuditLog>('audit_logs');
  }

  async find(id: string, workplaceId: string): Promise<AuditLog | null> {
    try {
      const audits = await this.auditLogs
        .query(Q.where('id', id), Q.where('workplace_id', workplaceId))
        .fetch();
      return audits[0] ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Log an audit entry
   */
  async log<T>(entry: AuditEntry<T>, workplaceId: string): Promise<void> {
    await database.write(async () => {
      await this.auditLogs.create((record: AuditLog) => {
        this.applyEntryToRecord(record, entry);
        record.workplaceId = workplaceId;
      });
    });
  }

  /**
   * Prepare an audit entry (does not write to DB)
   */
  prepareLog<T>(entry: AuditEntry<T>): AuditLog {
    return this.auditLogs.prepareCreate((record: AuditLog) => {
      this.applyEntryToRecord(record, entry);
    });
  }

  private applyEntryToRecord<T>(record: AuditLog, entry: AuditEntry<T>): void {
    record.entityType = entry.entityType.toLowerCase() as AuditEntityType;
    record.entityId = entry.entityId;
    record.action = entry.action;
    try {
      record.changes = JSON.stringify(entry.changes);
    } catch (error) {
      logger.warn('[AuditRepository] Failed to stringify changes (possibly circular)', {
        entityType: entry.entityType,
        entityId: entry.entityId,
      });
      record.changes = JSON.stringify({
        error: 'Failed to serialize changes (Circular reference)',
        message: error instanceof Error ? error.message : String(error),
      });
    }
    record.timestamp = Date.now();
    record.createdAt = new Date();
  }

  /**
   * Find audit logs for a specific entity
   */
  async findByEntity(
    entityType: AuditEntityType,
    entityId: string,
    workplaceId: string,
  ): Promise<AuditLog[]> {
    return this.auditLogs
      .query(
        Q.where('entity_type', entityType.toLowerCase()),
        Q.where('entity_id', entityId),
        Q.where('workplace_id', workplaceId),
        Q.sortBy('timestamp', Q.desc),
      )
      .fetch();
  }

  /**
   * Observe audit logs for a specific entity
   */
  observeByEntity(entityType: AuditEntityType, entityId: string, workplaceId: string) {
    return this.auditLogs
      .query(
        Q.where('entity_type', entityType.toLowerCase()),
        Q.where('entity_id', entityId),
        Q.where('workplace_id', workplaceId),
        Q.sortBy('timestamp', Q.desc),
      )
      .observe();
  }

  /**
   * Observe recent audit logs
   */
  observeRecent(limit: number = AppConfig.pagination.auditRecentLimit, workplaceId: string) {
    return this.auditLogs
      .query(Q.where('workplace_id', workplaceId), Q.sortBy('timestamp', Q.desc), Q.take(limit))
      .observe();
  }

  /**
   * Fetch recent audit logs
   */
  async fetchRecent(
    limit: number = AppConfig.pagination.auditRecentLimit,
    workplaceId: string,
  ): Promise<AuditLog[]> {
    return this.auditLogs
      .query(Q.where('workplace_id', workplaceId), Q.sortBy('timestamp', Q.desc), Q.take(limit))
      .fetch();
  }

  /**
   * Fetch all audit logs
   */
  async findAll(workplaceId: string): Promise<AuditLog[]> {
    return this.auditLogs
      .query(Q.where('workplace_id', workplaceId), Q.sortBy('timestamp', Q.desc))
      .fetch();
  }

  /**
   * Count all audit logs
   */
  async countAll(workplaceId: string): Promise<number> {
    return this.auditLogs.query(Q.where('workplace_id', workplaceId)).fetchCount();
  }
}

export const auditRepository = new AuditRepository();
