import { AppConfig } from '@/src/constants';
import AuditLog, { toPlainAuditLog } from '@/src/data/models/AuditLog';
import { AuditEntry, auditRepository } from '@/src/data/repositories/AuditRepository';
import { revertRegistry } from '@/src/services/revert-registry';
import { AuditEntityType, WorkplaceId } from '@/src/types/domain';
import { map } from 'rxjs';

/**
 * Audit Service
 *
 * Thin wrapper around AuditRepository for logging and retrieving audit entries.
 */
export class AuditService {
  /**
   * Log an audit entry
   */
  async log<T>(entry: AuditEntry<T>, workplaceId: WorkplaceId): Promise<void> {
    return auditRepository.log(entry, workplaceId);
  }

  /**
   * Revert an audit entry
   */
  async revertEntry(
    logId: string,
    workplaceId: WorkplaceId,
  ): Promise<{ success: boolean; error?: string }> {
    const log = await auditRepository.find(logId, workplaceId);
    if (!log) return { success: false, error: AppConfig.strings.audit.errors.notFound(logId) };
    if (!log.canRevert)
      return { success: false, error: AppConfig.strings.audit.errors.revertFailed };
    const changes = log.parsedChanges;
    if (!changes) return { success: false, error: AppConfig.strings.audit.errors.revertFailed };

    const handler = revertRegistry.getHandler(log.entityType);
    if (!handler) {
      return {
        success: false,
        error: AppConfig.strings.audit.errors.revertTypeNotSupported(log.entityType),
      };
    }

    try {
      await handler(log.entityId, changes, log.action, workplaceId);
      return { success: true };
    } catch (error: unknown) {
      return {
        success: false,
        error:
          error instanceof Error && error.message
            ? error.message
            : AppConfig.strings.audit.errors.revertFailed,
      };
    }
  }

  /**
   * Get audit trail for a specific entity
   */
  async getAuditTrail(
    entityType: AuditEntityType,
    entityId: string,
    workplaceId: WorkplaceId,
  ): Promise<AuditLog[]> {
    return auditRepository.findByEntity(entityType, entityId, workplaceId);
  }

  /**
   * Get recent audit logs (for audit viewer)
   */
  async getRecentLogs(
    limit: number = AppConfig.pagination.auditRecentLimit,
    workplaceId: WorkplaceId,
  ): Promise<AuditLog[]> {
    return auditRepository.fetchRecent(limit, workplaceId);
  }

  /**
   * Observe audit trail for a specific entity
   */
  observeAuditTrail(entityType: AuditEntityType, entityId: string, workplaceId: WorkplaceId) {
    return auditRepository
      .observeByEntity(entityType, entityId, workplaceId)
      .pipe(map(logs => logs.map(toPlainAuditLog)));
  }

  /**
   * Observe recent audit logs
   */
  observeRecentLogs(
    limit: number = AppConfig.pagination.auditRecentLimit,
    workplaceId: WorkplaceId,
  ) {
    return auditRepository
      .observeRecent(limit, workplaceId)
      .pipe(map(logs => logs.map(toPlainAuditLog)));
  }

  /**
   * Cleanup legacy entity types (convert to lowercase)
   * This is an idempotent one-time migration.
   */
  async cleanupLegacyEntityTypes(workplaceId: WorkplaceId): Promise<number> {
    return auditRepository.normalizeLegacyEntityTypes(workplaceId);
  }
}

// Export singleton instance
export const auditService = new AuditService();
