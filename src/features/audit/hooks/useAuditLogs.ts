import { AppConfig } from '@/src/constants';
import { AuditLogEntry, mergeAuditLogsById } from '@/src/services/audit/auditLogTypes';
import { useObservable } from '@/src/hooks/useObservable';
import { observeAuditTrail, observeRecentLogs } from '@/src/services/audit-service';
import { AuditEntityType } from '@/src/types/enums';
import { PlainAuditLog } from '@/src/types/plainDtos';
import { WorkplaceId } from '@/src/types/ids';
import type { AuditEventSource, AuditEventType } from '@/src/types/auditEvents';
import { scan } from 'rxjs/operators';
import { useMemo } from 'react';

const EMPTY_AUDIT_LOGS: PlainAuditLog[] = [];
const OBSERVED_AUDIT_PAGE_BUFFER = 3;

export function toAuditLogEntry(log: PlainAuditLog): AuditLogEntry {
  return {
    id: log.id,
    entityType: log.entityType,
    entityId: log.entityId,
    action: log.action,
    changes: log.changes,
    timestamp: log.timestamp,
    eventType: log.eventType,
    source: log.source,
    actor: log.actor,
    correlationId: log.correlationId,
    revertsLogId: log.revertsLogId,
    canRevert: log.canRevert,
  };
}

export function useAuditLogs(params: {
  entityType?: AuditEntityType;
  entityId?: string;
  entityFilter?: AuditEntityType;
  sourceFilter?: AuditEventSource;
  eventTypeFilter?: AuditEventType;
  correlationIdFilter?: string;
  workplaceId: WorkplaceId;
  limit?: number;
}) {
  const {
    entityType,
    entityId,
    entityFilter,
    sourceFilter,
    eventTypeFilter,
    correlationIdFilter,
    workplaceId,
    limit = AppConfig.pagination.auditScreenLimit,
  } = params;
  const isFiltered = !!(entityType && entityId);
  const queryKey = JSON.stringify([
    workplaceId,
    entityType ?? '',
    entityId ?? '',
    entityFilter ?? '',
    sourceFilter ?? '',
    eventTypeFilter ?? '',
    correlationIdFilter ?? '',
    limit,
  ]);

  const { data, isLoading, error, retry } = useObservable(
    () =>
      (isFiltered
        ? observeAuditTrail(entityType!, entityId!, workplaceId, limit)
        : observeRecentLogs(
            limit,
            workplaceId,
            entityFilter,
            sourceFilter,
            eventTypeFilter,
            correlationIdFilter,
          )
      ).pipe(
        scan(
          (previous, latestPage) => ({
            queryKey,
            logs: mergeAuditLogsById(previous.logs, latestPage).slice(
              0,
              Math.max(limit, limit * OBSERVED_AUDIT_PAGE_BUFFER),
            ),
          }),
          { queryKey, logs: EMPTY_AUDIT_LOGS },
        ),
      ),
    [
      entityType,
      entityId,
      entityFilter,
      sourceFilter,
      eventTypeFilter,
      correlationIdFilter,
      isFiltered,
      limit,
      workplaceId,
    ],
    null as { queryKey: string; logs: PlainAuditLog[] } | null,
    { keepPreviousData: false },
  );

  const rawLogs = data?.queryKey === queryKey ? data.logs : EMPTY_AUDIT_LOGS;
  const logs: AuditLogEntry[] = useMemo(() => rawLogs.map(toAuditLogEntry), [rawLogs]);

  return { logs, isLoading: isLoading || data?.queryKey !== queryKey, error, retry };
}
