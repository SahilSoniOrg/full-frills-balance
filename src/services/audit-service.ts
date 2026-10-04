import { AppConfig } from '@/src/constants';
import AuditLog, { toPlainAuditLog } from '@/src/data/models/AuditLog';
import {
  AuditLogCursor,
  auditRepository,
} from '@/src/data/repositories/AuditRepository';
import { revertRegistry } from '@/src/services/revert-registry';
import { AuditEntityType } from '@/src/types/enums';
import type { AuditEventSource, AuditEventType } from '@/src/types/auditEvents';
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

export async function revertEntry(
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

export async function getOlderLogs(
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

export function observeAuditTrail(
  entityType: AuditEntityType,
  entityId: string,
  workplaceId: WorkplaceId,
  limit: number = AppConfig.pagination.auditScreenLimit,
) {
  return auditRepository
    .observeByEntity(entityType, entityId, workplaceId, limit)
    .pipe(map(logs => logs.map(toSupportedPlainAuditLog)));
}

export function observeRecentLogs(
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
