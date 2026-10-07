import { Icon, type IconName } from '@/src/types/domainIcons';
import { AppConfig, ColorKey } from '@/src/constants';
import { AuditAction, AuditEntityType } from '@/src/types/enums';
import {
  AuditLogEntry,
  EntityStatus,
  computeCanRevert,
  getEntityDisplayName,
  parseAuditChanges,
} from '@/src/services/audit/auditLogTypes';
import { formatDate } from '@/src/utils/dateUtils';
import { useHourCyclePrefs } from '@/src/hooks/useHourCyclePrefs';
import { useMemo } from 'react';
const AUDIT_ID_PREVIEW_LEN = 12;

interface UseAuditLogItemMetaParams {
  item: AuditLogEntry;
  entityStatusMap: Record<string, EntityStatus>;
}

export function useAuditLogItemMeta({ item, entityStatusMap }: UseAuditLogItemMetaParams) {
  const { resolvedHourCycle } = useHourCyclePrefs();
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
        return Icon.PlusCircle;
      case AuditAction.UPDATE:
        return Icon.Edit;
      case AuditAction.DELETE:
        return Icon.Delete;
      default:
        return Icon.Circle;
    }
  }, [item.action]);

  const parsedChanges = useMemo(() => parseAuditChanges(item.changes), [item.changes]);

  const entityDisplayName = useMemo(() => getEntityDisplayName(parsedChanges), [parsedChanges]);

  const canRevert = useMemo(() => computeCanRevert(item, entityStatusMap), [item, entityStatusMap]);
  const eventLabel =
    AppConfig.strings.audit.eventLabels[item.eventType || ''] ||
    item.action.charAt(0) + item.action.slice(1).toLowerCase();
  const sourceLabel = item.source
    ? AppConfig.strings.audit.sourceLabels[item.source] || item.source
    : undefined;
  const actorName =
    item.actor?.label?.trim() ||
    (item.actor?.type
      ? AppConfig.strings.audit.actorTypes[item.actor.type] || item.actor.type
      : undefined);
  const actorLabel = actorName ? AppConfig.strings.audit.byActor(actorName) : undefined;
  const revertsLabel = item.revertsLogId
    ? AppConfig.strings.audit.revertsLabel(item.revertsLogId)
    : undefined;

  const timestampLabel = useMemo(
    () => formatDate(item.timestamp, { includeTime: true, hourCycle: resolvedHourCycle }),
    [item.timestamp, resolvedHourCycle],
  );

  return {
    actionColor,
    actionIcon,
    parsedChanges,
    entityLabel:
      AppConfig.strings.audit.entityLabels[item.entityType as AuditEntityType] || item.entityType,
    eventLabel,
    sourceLabel,
    actorLabel,
    revertsLabel,
    entityDisplayName,
    timestampLabel,
    entityIdLabel: AppConfig.strings.audit.idLabel(
      item.entityId.substring(0, AUDIT_ID_PREVIEW_LEN),
    ),
    canRevert,
  };
}
