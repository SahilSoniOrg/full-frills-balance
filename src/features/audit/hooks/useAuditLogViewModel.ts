import { AppConfig } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import {
  getAuditEntityCapabilities,
  type AuditStatusLookupType,
} from '@/src/types/auditEntityCapabilities';
import { useAuditAccounts, useAuditEntityStatus } from '@/src/features/audit/hooks/useAuditData';
import { toAuditLogEntry, useAuditLogs } from '@/src/features/audit/hooks/useAuditLogs';
import type { AuditLogEntry } from '@/src/features/audit/auditLogTypes';
import { analytics } from '@/src/services/analytics';
import { auditService } from '@/src/services/audit-service';
import { exportAuditHistoryArchive } from '@/src/services/export';
import { AccountId, BudgetId, JournalId, PlannedPaymentId } from '@/src/types/ids';
import { AuditEntityType } from '@/src/types/enums';
import type { AuditEventSource, AuditEventType } from '@/src/types/auditEvents';
import * as Alerts from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import { logger } from '@/src/utils/logger';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

export interface AuditLogViewModel {
  logs: ReturnType<typeof useAuditLogs>['logs'];
  visibleLogs: ReturnType<typeof useAuditLogs>['logs'];
  accountMap: ReturnType<typeof useAuditAccounts>['accountMap'];
  entityStatusMap: ReturnType<typeof useAuditEntityStatus>;
  workplaceCurrency: string;
  isLoading: boolean;
  error: Error | null;
  retry: () => void;
  isFiltered: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMoreError: boolean;
  loadMore: () => Promise<void>;
  entityFilter: AuditEntityFilter;
  onEntityFilterChange: (filter: AuditEntityFilter) => void;
  sourceFilter: AuditSourceFilter;
  onSourceFilterChange: (filter: AuditSourceFilter) => void;
  eventFilter: AuditEventFilter;
  onEventFilterChange: (filter: AuditEventFilter) => void;
  correlationFilter: string | null;
  onCorrelationFilterChange: (correlationId: string | null) => void;
  isExportingHistory: boolean;
  archiveExportProgress: { exportedCount: number; totalAtStart: number } | null;
  onExportHistory: () => void;
  expandedIds: Set<string>;
  onToggleExpanded: (id: string) => void;
  onView: (entityType: string, entityId: string, name?: string) => void;
  onRevert: (logId: string) => void;
}

export type AuditEntityFilter = AuditEntityType | 'all';
export type AuditSourceFilter = AuditEventSource | null;
export type AuditEventFilter = AuditEventType | 'all';

interface AuditLogPageState {
  key: string;
  logs: AuditLogEntry[];
  hasMore: boolean | null;
  isLoadingMore: boolean;
  hasError: boolean;
}

const EMPTY_AUDIT_ENTRIES: AuditLogEntry[] = [];

function mergeAuditLogEntries(...groups: readonly AuditLogEntry[][]): AuditLogEntry[] {
  const byId = new Map<string, AuditLogEntry>();
  for (const group of groups) {
    for (const entry of group) byId.set(entry.id, entry);
  }
  return [...byId.values()].sort((left, right) => {
    if (left.timestamp !== right.timestamp) return right.timestamp - left.timestamp;
    if (left.id === right.id) return 0;
    return left.id < right.id ? 1 : -1;
  });
}

export function useAuditLogViewModel(): AuditLogViewModel {
  const { entityType, entityId } = useLocalSearchParams<{
    entityType?: AuditEntityType;
    entityId?: string;
  }>();
  const { workplaceId, defaultCurrencyCode: workplaceCurrency } = useWorkplace();

  const mountTimeRef = useRef<number>(0);
  useEffect(() => {
    mountTimeRef.current = performance.now();
  }, []);

  // Log UI Mount
  useEffect(() => {
    logger.info('[AuditLog] Screen Mounted');
  }, []);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [pageState, setPageState] = useState<AuditLogPageState>({
    key: '',
    logs: EMPTY_AUDIT_ENTRIES,
    hasMore: null,
    isLoadingMore: false,
    hasError: false,
  });
  const [entityFilter, setEntityFilter] = useState<AuditEntityFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<AuditSourceFilter>(null);
  const [eventFilter, setEventFilter] = useState<AuditEventFilter>('all');
  const [correlationFilter, setCorrelationFilter] = useState<string | null>(null);
  const [isExportingHistory, setIsExportingHistory] = useState(false);
  const [archiveExportProgress, setArchiveExportProgress] = useState<{
    exportedCount: number;
    totalAtStart: number;
  } | null>(null);
  const isFiltered = !!(entityType && entityId);
  const activeSourceFilter = isFiltered ? null : sourceFilter;
  const activeEventFilter = isFiltered || eventFilter === 'all' ? undefined : eventFilter;
  const activeCorrelationFilter = isFiltered ? undefined : correlationFilter;
  const queryKey = JSON.stringify([
    workplaceId,
    entityType ?? '',
    entityId ?? '',
    isFiltered || entityFilter === 'all' ? '' : entityFilter,
    activeSourceFilter ?? '',
    activeEventFilter ?? '',
    activeCorrelationFilter ?? '',
  ]);
  const queryKeyRef = useRef(queryKey);
  useLayoutEffect(() => {
    queryKeyRef.current = queryKey;
  }, [queryKey]);
  const loadingMoreKeyRef = useRef<string | null>(null);

  const { accountMap, isLoading: accountsLoading } = useAuditAccounts(workplaceId);
  const {
    logs: liveLogs,
    isLoading,
    error,
    retry,
  } = useAuditLogs({
    entityType,
    entityId,
    entityFilter: isFiltered || entityFilter === 'all' ? undefined : entityFilter,
    sourceFilter: activeSourceFilter ?? undefined,
    eventTypeFilter: activeEventFilter,
    correlationIdFilter: activeCorrelationFilter ?? undefined,
    workplaceId,
    limit: AppConfig.pagination.auditScreenLimit,
  });

  const activePageState = pageState.key === queryKey ? pageState : null;
  const cachedLogs = activePageState?.logs ?? EMPTY_AUDIT_ENTRIES;
  const logs = useMemo(() => mergeAuditLogEntries(cachedLogs, liveLogs), [cachedLogs, liveLogs]);

  const hasData = logs.length > 0;

  // Log Data Arrival
  useEffect(() => {
    if (hasData) {
      const duration = Math.round(performance.now() - (mountTimeRef.current || 0));
      logger.info(`[AuditLog] Data Loaded in ${duration}ms`);
      logger.metric('AuditLog.DataLoaded', duration);
    }
  }, [hasData]);

  const idsByEntityType = useMemo(() => {
    const groups: Record<AuditStatusLookupType, Set<string>> = {
      account: new Set(),
      journal: new Set(),
      budget: new Set(),
      planned_payment: new Set(),
      workplace: new Set(),
    };
    logs.forEach(log => {
      if (!log.canRevert) return;
      const handlerType = getAuditEntityCapabilities(log.entityType).revertHandler;
      if (handlerType !== 'none') groups[handlerType].add(log.entityId);
    });
    return {
      account: [...groups.account],
      journal: [...groups.journal],
      budget: [...groups.budget],
      planned_payment: [...groups.planned_payment],
      workplace: [...groups.workplace],
    };
  }, [logs]);

  const entityStatusMap = useAuditEntityStatus(workplaceId, idsByEntityType);

  const hasMore =
    activePageState?.hasMore ??
    (!isLoading && liveLogs.length >= AppConfig.pagination.auditScreenLimit);
  const isLoadingMore = activePageState?.isLoadingMore ?? false;
  const loadMoreError = activePageState?.hasError ?? false;

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoadingMore || logs.length === 0 || loadingMoreKeyRef.current === queryKey) {
      return;
    }
    const oldest = logs[logs.length - 1];
    if (!oldest) return;

    const requestKey = queryKey;
    loadingMoreKeyRef.current = requestKey;
    setPageState(current => {
      const base =
        current.key === requestKey
          ? current
          : {
              key: requestKey,
              logs: EMPTY_AUDIT_ENTRIES,
              hasMore,
              isLoadingMore: false,
              hasError: false,
            };
      return {
        ...base,
        logs: mergeAuditLogEntries(base.logs, logs),
        isLoadingMore: true,
        hasError: false,
      };
    });

    try {
      const olderLogs = await auditService.getOlderLogs(
        { timestamp: oldest.timestamp, id: oldest.id },
        AppConfig.pagination.auditScreenLimit,
        workplaceId,
        {
          ...(isFiltered ? { entityType: entityType!, entityId: entityId! } : {}),
          ...(!isFiltered && entityFilter !== 'all' ? { entityType: entityFilter } : {}),
          ...(activeSourceFilter === null ? {} : { source: activeSourceFilter }),
          ...(activeEventFilter ? { eventType: activeEventFilter } : {}),
          ...(activeCorrelationFilter ? { correlationId: activeCorrelationFilter } : {}),
        },
      );
      if (queryKeyRef.current !== requestKey) return;
      const olderEntries = olderLogs.map(toAuditLogEntry);
      setPageState(current => {
        const base =
          current.key === requestKey
            ? current
            : {
                key: requestKey,
                logs: EMPTY_AUDIT_ENTRIES,
                hasMore: null,
                isLoadingMore: false,
                hasError: false,
              };
        return {
          ...base,
          logs: mergeAuditLogEntries(base.logs, olderEntries, logs),
          hasMore: olderLogs.length >= AppConfig.pagination.auditScreenLimit,
          isLoadingMore: false,
          hasError: false,
        };
      });
    } catch (loadError) {
      if (queryKeyRef.current === requestKey) {
        logger.error('[AuditLog] Failed to load older changes', loadError);
        setPageState(current => {
          const base =
            current.key === requestKey
              ? current
              : {
                  key: requestKey,
                  logs,
                  hasMore,
                  isLoadingMore: false,
                  hasError: false,
                };
          return { ...base, isLoadingMore: false, hasError: true };
        });
      }
    } finally {
      if (loadingMoreKeyRef.current === requestKey) loadingMoreKeyRef.current = null;
    }
  }, [
    entityFilter,
    entityId,
    entityType,
    activeEventFilter,
    activeCorrelationFilter,
    activeSourceFilter,
    hasMore,
    isFiltered,
    isLoadingMore,
    logs,
    queryKey,
    workplaceId,
  ]);
  const visibleLogs = logs;

  const onToggleExpanded = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const onEntityFilterChange = useCallback((filter: AuditEntityFilter) => {
    setEntityFilter(filter);
    setEventFilter(current =>
      current === 'all' || filter === 'all' || current.startsWith(`${filter}.`) ? current : 'all',
    );
  }, []);

  const onCorrelationFilterChange = useCallback((correlationId: string | null) => {
    setCorrelationFilter(correlationId);
    if (correlationId) {
      setEntityFilter('all');
      setSourceFilter(null);
      setEventFilter('all');
    }
  }, []);

  const onExportHistory = useCallback(async () => {
    setIsExportingHistory(true);
    setArchiveExportProgress(null);
    try {
      await exportAuditHistoryArchive(workplaceId, (exportedCount, totalAtStart) => {
        setArchiveExportProgress({ exportedCount, totalAtStart });
      });
      Alerts.toast.success(AppConfig.strings.audit.exportHistoryComplete);
    } catch (error) {
      const wasCancelled =
        typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';
      if (!wasCancelled) {
        logger.error('[AuditLog] Failed to export audit archive', error);
        Alerts.showErrorAlert(AppConfig.strings.audit.exportHistoryFailed);
      }
    } finally {
      setIsExportingHistory(false);
    }
  }, [workplaceId]);

  const onView = useCallback((type: string, id: string, name?: string) => {
    analytics.trackFeatureUsage('audit', 'view_entity', { entity_type: type });
    if (type === 'account') {
      AppNavigation.toAccountDetails(id as AccountId, { preview: { name } });
    } else if (type === 'journal') {
      AppNavigation.toJournalDetails(id as JournalId, { title: name });
    } else if (type === 'budget') {
      AppNavigation.toBudgetDetail(id as BudgetId, { name });
    } else if (type === 'planned_payment') {
      AppNavigation.toPlannedPaymentDetails(id as PlannedPaymentId, { description: name });
    }
  }, []);

  const onRevert = useCallback(
    (logId: string) => {
      Alerts.showConfirmationAlert(
        AppConfig.strings.audit.revertConfirmTitle,
        AppConfig.strings.audit.revertConfirmMessage,
        async () => {
          analytics.trackFeatureUsage('audit', 'revert_initiated', { log_id: logId });
          const result = await auditService.revertEntry(logId, workplaceId);
          if (result.success) {
            analytics.trackFeatureUsage('audit', 'revert_success', { log_id: logId });
            Alerts.toast.success(AppConfig.strings.audit.revertSuccess);
          } else {
            analytics.trackFeatureUsage('audit', 'revert_failed', {
              log_id: logId,
              error: result.error,
            });
            Alerts.showErrorAlert(result.error || AppConfig.strings.audit.errors.revertFailed);
          }
        },
      );
    },
    [workplaceId],
  );

  return {
    logs,
    visibleLogs,
    accountMap,
    entityStatusMap,
    workplaceCurrency,
    isLoading: isLoading || accountsLoading,
    error,
    retry,
    isFiltered,
    hasMore,
    isLoadingMore,
    loadMoreError,
    loadMore,
    entityFilter,
    sourceFilter: activeSourceFilter,
    onEntityFilterChange,
    onSourceFilterChange: setSourceFilter,
    eventFilter: isFiltered ? 'all' : eventFilter,
    onEventFilterChange: setEventFilter,
    correlationFilter: activeCorrelationFilter ?? null,
    onCorrelationFilterChange,
    isExportingHistory,
    archiveExportProgress,
    onExportHistory,
    expandedIds,
    onToggleExpanded,
    onView,
    onRevert,
  };
}
