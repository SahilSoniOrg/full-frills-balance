import { AppConfig } from '@/src/constants';
import AuditLog, { toPlainAuditLog } from '@/src/data/models/AuditLog';
import {
  AuditEntry,
  AuditLogCursor,
  auditRepository,
} from '@/src/data/repositories/AuditRepository';
import { revertRegistry } from '@/src/services/revert-registry';
import { preferences } from '@/src/services/preferences';
import { AuditEntityType } from '@/src/types/enums';
import type { AuditActor, AuditEventSource, AuditEventType } from '@/src/types/auditEvents';
import { getLocalAuditActorId } from '@/src/services/audit-identity';
import { WorkplaceId } from '@/src/types/ids';
import { PlainAuditLog } from '@/src/types/plainDtos';
import { map } from 'rxjs';

function toSupportedPlainAuditLog(log: AuditLog): PlainAuditLog {
  const changes = log.parsedChanges;
  return {
    ...toPlainAuditLog(log),
    canRevert:
      log.canRevert && !!changes && revertRegistry.supports(log.entityType, log.action, changes),
  };
}

/**
 * Audit Service
 *
 * Thin wrapper around AuditRepository for logging and retrieving audit entries.
 */
export class AuditService {
  constructor(
    private readonly preferenceSource: Pick<typeof preferences, 'userName'> = preferences,
  ) {}

  private getDefaultActor(source?: AuditEventSource): AuditActor {
    if (source === 'system' || source === 'repair') return { type: 'system' };
    if (source !== undefined && source !== 'app' && source !== 'import') {
      return { type: 'unknown' };
    }
    const label = this.preferenceSource.userName?.trim();
    const id = getLocalAuditActorId();
    return {
      type: 'user',
      ...(id ? { id, idScope: 'local-install' } : {}),
      ...(label ? { label } : {}),
    };
  }

  /**
   * Log an audit entry
   */
  async log<T>(entry: AuditEntry<T>, workplaceId: WorkplaceId): Promise<void> {
    return auditRepository.log(
      { ...entry, actor: entry.actor ?? this.getDefaultActor(entry.source) },
      workplaceId,
    );
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
    const changes = log.parsedChanges;
    if (!changes || !log.canRevert) {
      return { success: false, error: AppConfig.strings.audit.errors.revertFailed };
    }

    const handler = revertRegistry.getHandler(log.entityType);
    if (!handler || !revertRegistry.supports(log.entityType, log.action, changes)) {
      return {
        success: false,
        error: AppConfig.strings.audit.errors.revertTypeNotSupported(log.entityType),
      };
    }

    try {
      const reverted = await handler(log.entityId, changes, log.action, workplaceId, {
        auditLogId: log.id,
      });
      if (reverted === false) {
        return { success: false, error: AppConfig.strings.audit.errors.revertFailed };
      }
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
   * Get recent audit logs (for audit viewer)
   */
  async getRecentLogs(
    limit: number = AppConfig.pagination.auditRecentLimit,
    workplaceId: WorkplaceId,
  ): Promise<AuditLog[]> {
    return auditRepository.fetchRecent(limit, workplaceId);
  }

  /** Legacy convenience API, bounded to recent history. Use getOlderLogs for pagination. */
  async getAuditTrail(
    entityType: AuditEntityType,
    entityId: string,
    workplaceId: WorkplaceId,
  ): Promise<AuditLog[]> {
    return auditRepository.findByEntity(entityType, entityId, workplaceId);
  }

  async getOlderLogs(
    cursor: AuditLogCursor,
    limit: number,
    workplaceId: WorkplaceId,
    entity?: {
      entityType?: AuditEntityType;
      entityId?: string;
      source?: AuditEventSource;
      eventType?: AuditEventType;
      correlationId?: string;
    },
  ): Promise<PlainAuditLog[]> {
    const logs = await auditRepository.fetchOlder(cursor, limit, workplaceId, entity);
    return logs.map(toSupportedPlainAuditLog);
  }

  /**
   * Observe audit trail for a specific entity
   */
  observeAuditTrail(
    entityType: AuditEntityType,
    entityId: string,
    workplaceId: WorkplaceId,
    limit: number = AppConfig.pagination.auditScreenLimit,
  ) {
    return auditRepository
      .observeByEntity(entityType, entityId, workplaceId, limit)
      .pipe(map(logs => logs.map(toSupportedPlainAuditLog)));
  }

  /**
   * Observe recent audit logs
   */
  observeRecentLogs(
    limit: number = AppConfig.pagination.auditRecentLimit,
    workplaceId: WorkplaceId,
    entityType?: AuditEntityType,
    source?: AuditEventSource,
    eventType?: AuditEventType,
    correlationId?: string,
  ) {
    return auditRepository
      .observeRecent(limit, workplaceId, entityType, source, eventType, correlationId)
      .pipe(map(logs => logs.map(toSupportedPlainAuditLog)));
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
