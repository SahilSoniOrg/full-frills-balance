import { getPerfNow } from '@/src/utils/dateHelpers';
import { AppConfig } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useAuditAccounts, useAuditEntityStatus } from '@/src/features/audit/hooks/useAuditData';
import { useAuditLogs } from '@/src/features/audit/hooks/useAuditLogs';
import { analytics } from '@/src/services/analytics-service';
import { auditService } from '@/src/services/audit-service';
import { AccountId, AuditEntityType, JournalId } from '@/src/types/domain';
import * as Alerts from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import { logger } from '@/src/utils/logger';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface AuditLogViewModel {
  logs: ReturnType<typeof useAuditLogs>['logs'];
  accountMap: ReturnType<typeof useAuditAccounts>['accountMap'];
  entityStatusMap: ReturnType<typeof useAuditEntityStatus>;
  workplaceCurrency: string;
  isLoading: boolean;
  isFiltered: boolean;
  expandedIds: Set<string>;
  onToggleExpanded: (id: string) => void;
  onView: (entityType: string, entityId: string, name?: string) => void;
  onRevert: (logId: string) => void;
}

export function useAuditLogViewModel(): AuditLogViewModel {
  const { entityType, entityId } = useLocalSearchParams<{
    entityType?: AuditEntityType;
    entityId?: string;
  }>();
  const { workplaceId, defaultCurrencyCode: workplaceCurrency } = useWorkplace();

  const mountTimeRef = useRef<number>(0);
  useEffect(() => {
    mountTimeRef.current = getPerfNow();
  }, []);

  // Log UI Mount
  useEffect(() => {
    logger.info('[AuditLog] Screen Mounted');
  }, []);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const { accountMap, isLoading: accountsLoading } = useAuditAccounts(workplaceId);
  const { logs, isLoading } = useAuditLogs({ entityType, entityId, workplaceId });

  const hasData = logs.length > 0;

  // Log Data Arrival
  useEffect(() => {
    if (hasData) {
      const duration = Math.round(getPerfNow() - (mountTimeRef.current || 0));
      logger.info(`[AuditLog] Data Loaded in ${duration}ms`);
      logger.metric('AuditLog.DataLoaded', duration);
    }
  }, [hasData]);

  const idsByEntityType = useMemo(() => {
    const groups: Record<string, string[]> = { account: [], journal: [] };
    logs.forEach(log => {
      if (groups[log.entityType]) groups[log.entityType].push(log.entityId);
    });
    return groups;
  }, [logs]);

  const entityStatusMap = useAuditEntityStatus(workplaceId, idsByEntityType);

  const isFiltered = !!entityId;

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

  const onView = useCallback((type: string, id: string, name?: string) => {
    analytics.trackFeatureUsage('audit', 'view_entity', { entity_type: type });
    if (type === 'account') {
      AppNavigation.toAccountDetails(id as AccountId, { preview: { name } });
    } else if (type === 'journal') {
      AppNavigation.toJournalDetails(id as JournalId, { title: name });
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
    accountMap,
    entityStatusMap,
    workplaceCurrency,
    isLoading: isLoading || accountsLoading,
    isFiltered,
    expandedIds,
    onToggleExpanded,
    onView,
    onRevert,
  };
}
