import { AppConfig } from '@/src/constants';
import { AuditLogEntry } from '@/src/features/audit/auditLogTypes';
import { useObservable } from '@/src/hooks/useObservable';
import { auditService } from '@/src/services/audit-service';
import { AuditEntityType, PlainAuditLog, WorkplaceId } from '@/src/types/domain';

export function useAuditLogs(params: {
  entityType?: AuditEntityType;
  entityId?: string;
  workplaceId: WorkplaceId;
}) {
  const { entityType, entityId, workplaceId } = params;
  const isFiltered = !!(entityType && entityId);

  const {
    data: rawLogs,
    isLoading,
    error,
    version,
  } = useObservable(
    () =>
      isFiltered
        ? auditService.observeAuditTrail(entityType!, entityId!, workplaceId)
        : auditService.observeRecentLogs(AppConfig.pagination.auditScreenLimit, workplaceId),
    [entityType, entityId, isFiltered, workplaceId],
    [] as PlainAuditLog[],
  );

  const logs: AuditLogEntry[] = (rawLogs || []).map(log => ({
    id: log.id,
    entityType: log.entityType,
    entityId: log.entityId,
    action: log.action,
    changes: log.changes,
    timestamp: log.timestamp,
    canRevert: log.canRevert,
  }));

  return { logs, isLoading, error, version };
}
