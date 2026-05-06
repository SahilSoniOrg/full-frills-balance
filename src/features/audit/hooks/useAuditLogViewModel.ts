import { AppConfig } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { AuditEntityType } from '@/src/data/models/AuditLog';
import { useAuditAccounts, useAuditEntityStatus } from '@/src/features/audit/hooks/useAuditData';
import { useAuditLogs } from '@/src/features/audit/hooks/useAuditLogs';
import { auditService } from '@/src/services/audit-service';
import { AccountId, JournalId } from '@/src/types/domain';
import * as Alerts from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

export interface AuditLogViewModel {
  logs: ReturnType<typeof useAuditLogs>['logs'];
  accountMap: ReturnType<typeof useAuditAccounts>['accountMap'];
  entityStatusMap: ReturnType<typeof useAuditEntityStatus>;
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
  const { workplaceId } = useWorkplace();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const { accountMap, isLoading: accountsLoading } = useAuditAccounts(workplaceId);
  const { logs, isLoading } = useAuditLogs({ entityType, entityId, workplaceId });

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
    if (type === 'account') {
      AppNavigation.toAccountDetails(id as AccountId, { preview: { name } });
    } else if (type === 'journal') {
      AppNavigation.toTransactionDetails(id as JournalId, { title: name });
    }
  }, []);

  const onRevert = useCallback((logId: string) => {
    Alerts.showConfirmationAlert(
      AppConfig.strings.audit.revertConfirmTitle,
      AppConfig.strings.audit.revertConfirmMessage,
      async () => {
        const result = await auditService.revertEntry(logId, workplaceId);
        if (result.success) {
          Alerts.toast.success(AppConfig.strings.audit.revertSuccess);
        } else {
          Alerts.showErrorAlert(result.error || AppConfig.strings.audit.errors.revertFailed);
        }
      },
    );
  }, []);

  return {
    logs,
    accountMap,
    entityStatusMap,
    isLoading: isLoading || accountsLoading,
    isFiltered,
    expandedIds,
    onToggleExpanded,
    onView,
    onRevert,
  };
}
