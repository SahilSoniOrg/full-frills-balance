import { AppConfig } from '@/src/constants/app-config';
import { database } from '@/src/data/database/Database';
import AuditLog from '@/src/data/models/AuditLog';
import { AuditAction, AuditEntityType, WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { Q } from '@nozbe/watermelondb';

export interface AuditEntry<T = unknown> {
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  changes: T; // Will be JSON stringified
}

export class AuditRepository {
  private get auditLogs() {
    return database.collections.get<AuditLog>('audit_logs');
  }

  async find(id: string, workplaceId: WorkplaceId): Promise<AuditLog | null> {
    try {
      const auditLog = await this.auditLogs.find(id);
      if (auditLog.workplaceId !== workplaceId) return null;
      return auditLog;
    } catch {
      return null;
    }
  }

  /**
   * Log an audit entry
   */
  async log<T>(entry: AuditEntry<T>, workplaceId: WorkplaceId): Promise<void> {
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
  prepareLog<T>(entry: AuditEntry<T>, workplaceId: WorkplaceId): AuditLog {
    return this.auditLogs.prepareCreate((record: AuditLog) => {
      this.applyEntryToRecord(record, entry);
      record.workplaceId = workplaceId;
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
    workplaceId: WorkplaceId,
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
  observeByEntity(entityType: AuditEntityType, entityId: string, workplaceId: WorkplaceId) {
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
  observeRecent(limit: number = AppConfig.pagination.auditRecentLimit, workplaceId: WorkplaceId) {
    return this.auditLogs
      .query(Q.where('workplace_id', workplaceId), Q.sortBy('timestamp', Q.desc), Q.take(limit))
      .observe();
  }

  /**
   * Fetch recent audit logs
   */
  async fetchRecent(
    limit: number = AppConfig.pagination.auditRecentLimit,
    workplaceId: WorkplaceId,
  ): Promise<AuditLog[]> {
    return this.auditLogs
      .query(Q.where('workplace_id', workplaceId), Q.sortBy('timestamp', Q.desc), Q.take(limit))
      .fetch();
  }

  /**
   * Fetch all audit logs
   */
  async findAll(workplaceId: WorkplaceId): Promise<AuditLog[]> {
    return this.auditLogs
      .query(Q.where('workplace_id', workplaceId), Q.sortBy('timestamp', Q.desc))
      .fetch();
  }

  /**
   * Count all audit logs
   */
  async countAll(workplaceId: WorkplaceId): Promise<number> {
    return this.auditLogs.query(Q.where('workplace_id', workplaceId)).fetchCount();
  }

  /**
   * Cleanup legacy entity types (convert to lowercase)
   * This is an idempotent one-time migration.
   */
  async normalizeLegacyEntityTypes(workplaceId: WorkplaceId): Promise<number> {
    const allLogs = await this.findAll(workplaceId);
    const uppercaseLogs = allLogs.filter(log => log.entityType !== log.entityType.toLowerCase());

    if (uppercaseLogs.length === 0) return 0;

    await database.write(async () => {
      const batches = [];
      const batchSize = AppConfig.pagination.auditRecentLimit;
      for (let i = 0; i < uppercaseLogs.length; i += batchSize) {
        batches.push(uppercaseLogs.slice(i, i + batchSize));
      }

      for (const batch of batches) {
        await database.batch(
          batch.map(log =>
            log.prepareUpdate(record => {
              record.entityType = log.entityType.toLowerCase() as AuditEntityType;
            }),
          ),
        );
      }
    });

    return uppercaseLogs.length;
  }
}

export const auditRepository = new AuditRepository();
