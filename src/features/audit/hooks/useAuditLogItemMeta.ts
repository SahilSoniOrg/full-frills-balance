import type { IconName } from '@/src/types/domainIcons';
import { AppConfig, ColorKey } from '@/src/constants';
import { AuditAction } from '@/src/types/enums';
import {
  AuditLogEntry,
  EntityStatus,
  computeCanRevert,
  getEntityDisplayName,
  parseAuditChanges,
} from '@/src/features/audit/auditLogTypes';
import { formatDate } from '@/src/utils/dateUtils';
import { useMemo } from 'react';
const AUDIT_ID_PREVIEW_LEN = 12;

interface UseAuditLogItemMetaParams {
  item: AuditLogEntry;
  entityStatusMap: Record<string, EntityStatus>;
}

export function useAuditLogItemMeta({ item, entityStatusMap }: UseAuditLogItemMetaParams) {
  const actionColor = useMemo((): ColorKey => {
    switch (item.action) {
      case AuditAction.CREATE:
        return 'income';
      case AuditAction.UPDATE:
        return 'transfer';
      case AuditAction.DELETE:
        return 'expense';
      default:
        return 'text';
    }
  }, [item.action]);

  const actionIcon = useMemo<IconName>(() => {
    switch (item.action) {
      case AuditAction.CREATE:
        return 'plusCircle';
      case AuditAction.UPDATE:
        return 'edit';
      case AuditAction.DELETE:
        return 'delete';
      default:
        return 'circle';
    }
  }, [item.action]);

  const parsedChanges = useMemo(() => parseAuditChanges(item.changes), [item.changes]);

  const entityDisplayName = useMemo(() => getEntityDisplayName(parsedChanges), [parsedChanges]);

  const canRevert = useMemo(() => computeCanRevert(item, entityStatusMap), [item, entityStatusMap]);

  return {
    actionColor,
    actionIcon,
    parsedChanges,
    entityLabel: AppConfig.strings.audit.entityLabels[item.entityType] || item.entityType,
    entityDisplayName,
    timestampLabel: formatDate(item.timestamp, { includeTime: true }),
    entityIdLabel: AppConfig.strings.audit.idLabel(
      item.entityId.substring(0, AUDIT_ID_PREVIEW_LEN),
    ),
    canRevert,
  };
}
