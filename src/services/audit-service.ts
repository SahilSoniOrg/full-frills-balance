import { AppConfig } from '@/src/constants';
import { database } from '@/src/data/database/Database';
import AuditLog, { AuditEntityType } from '@/src/data/models/AuditLog';
import { AuditEntry, auditRepository } from '@/src/data/repositories/AuditRepository';
import { revertRegistry } from '@/src/services/revert-registry';

/**
 * Audit Service
 *
 * Thin wrapper around AuditRepository for logging and retrieving audit entries.
 */
export class AuditService {
  /**
   * Log an audit entry
   */
  async log<T>(entry: AuditEntry<T>): Promise<void> {
    return auditRepository.log(entry);
  }

  /**
   * Revert an audit entry
   */
  async revertEntry(logId: string): Promise<{ success: boolean; error?: string }> {
    const log = await auditRepository.find(logId);
    if (!log) return { success: false, error: AppConfig.strings.audit.errors.notFound(logId) };
    if (!log.canRevert)
      return { success: false, error: AppConfig.strings.audit.errors.revertFailed };

    const handler = revertRegistry.getHandler(log.entityType);
    if (!handler) {
      return {
        success: false,
        error: AppConfig.strings.audit.errors.revertTypeNotSupported(log.entityType),
      };
    }

    try {
      await handler(log.entityId, log.parsedChanges, log.action);
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || AppConfig.strings.audit.errors.revertFailed,
      };
    }
  }

  /**
   * Get audit trail for a specific entity
   */
  async getAuditTrail(entityType: AuditEntityType, entityId: string): Promise<AuditLog[]> {
    return auditRepository.findByEntity(entityType, entityId);
  }

  /**
   * Get recent audit logs (for audit viewer)
   */
  async getRecentLogs(limit: number = AppConfig.pagination.auditRecentLimit): Promise<AuditLog[]> {
    return auditRepository.fetchRecent(limit);
  }

  /**
   * Observe audit trail for a specific entity
   */
  observeAuditTrail(entityType: AuditEntityType, entityId: string) {
    return auditRepository.observeByEntity(entityType, entityId);
  }

  /**
   * Observe recent audit logs
   */
  observeRecentLogs(limit: number = AppConfig.pagination.auditRecentLimit) {
    return auditRepository.observeRecent(limit);
  }

  /**
   * Cleanup legacy entity types (convert to lowercase)
   * This is an idempotent one-time migration.
   */
  async cleanupLegacyEntityTypes(): Promise<number> {
    const allLogs = await auditRepository.findAll();
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
          ...batch.map(log =>
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

// Export singleton instance
export const auditService = new AuditService();
