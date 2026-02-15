import AuditLog, { AuditEntityType } from '@/src/data/models/AuditLog';
import { AuditLogEntry } from '@/src/features/audit/hooks/useAuditLogDiffViewModel';
import { useObservable } from '@/src/hooks/useObservable';
import { auditService } from '@/src/services/audit-service';

export function useAuditLogs(params: { entityType?: AuditEntityType; entityId?: string }) {
    const { entityType, entityId } = params;
    const isFiltered = !!(entityType && entityId);

    const { data: rawLogs, isLoading, error, version } = useObservable(
        () => isFiltered
            ? auditService.observeAuditTrail(entityType!, entityId!)
            : auditService.observeRecentLogs(200),
        [entityType, entityId, isFiltered],
        [] as AuditLog[]
    );

    const logs: AuditLogEntry[] = (rawLogs || []).map((log) => ({
        id: log.id,
        entityType: log.entityType,
        entityId: log.entityId,
        action: log.action,
        changes: log.changes,
        timestamp: log.timestamp,
    }));

    return { logs, isLoading, error, version };
}
