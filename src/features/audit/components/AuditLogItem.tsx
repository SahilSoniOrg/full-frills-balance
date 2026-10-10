import {
  Icon,
  AppCard,
  AppIcon,
  AppText,
  IconTile,
  PressScaleTouchable,
} from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing } from '@/src/constants';
import { withOpacity } from '@/src/utils/color-math';
import { Inline, Stack } from '@/src/design-system';
import { AuditLogChangesView } from '@/src/features/audit/components/AuditLogChangesView';
import { getAuditEntityCapabilities } from '@/src/types/auditEntityCapabilities';
import { AuditLogEntry, EntityStatus } from '@/src/services/audit/auditLogTypes';
import { useAuditLogItemMeta } from '@/src/features/audit/hooks/useAuditLogItemMeta';
import { useTheme } from '@/src/hooks/use-theme';
import { StyleSheet } from 'react-native';

interface AuditLogItemProps {
  item: AuditLogEntry;
  isExpanded: boolean;
  onToggle: () => void;
  onView?: (entityType: string, entityId: string, name?: string) => void;
  onRevert?: (logId: string) => void;
  onShowRelated?: (correlationId: string) => void;
  accountMap: Record<string, { name: string; currency: string }>;
  entityStatusMap: Record<string, EntityStatus>;
  workplaceCurrency: string;
}

export const AuditLogItem = ({
  item,
  isExpanded,
  onToggle,
  onView,
  onRevert,
  onShowRelated,
  accountMap,
  entityStatusMap,
  workplaceCurrency,
}: AuditLogItemProps) => {
  const { theme } = useTheme();
  const canViewEntity =
    item.action !== 'DELETE' &&
    item.eventType !== 'account.merged_into' &&
    getAuditEntityCapabilities(item.entityType).canView;
  const {
    actionColor,
    actionIcon,
    parsedChanges,
    entityLabel,
    eventLabel,
    sourceLabel,
    actorLabel,
    revertsLabel,
    entityDisplayName,
    timestampLabel,
    entityIdLabel,
    canRevert,
  } = useAuditLogItemMeta({ item, entityStatusMap });

  return (
    <AppCard paddingSize="md" elevation="sm" radius="r2" style={styles.card}>
      <PressScaleTouchable
        pressScale="subtle"
        onPress={onToggle}
        accessibilityLabel={isExpanded ? 'Hide audit details' : AppConfig.strings.audit.viewDetails}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        activeOpacity={Opacity.heavy}
      >
        <Inline gap="md" align="center">
          <IconTile icon={actionIcon} tint={actionColor} size="lg" shape="circle" />
          <Stack flex={1} gap="xs">
            <Inline justify="space-between" align="baseline" gap="sm">
              <AppText variant="body" weight="semibold">
                {entityLabel}
                {entityDisplayName ? `: ${entityDisplayName}` : ''}
              </AppText>
              <AppText variant="caption" style={{ color: theme[actionColor] }}>
                {eventLabel}
              </AppText>
            </Inline>
            <AppText variant="caption" color="secondary">
              {timestampLabel}
            </AppText>
            {(sourceLabel || actorLabel || revertsLabel || item.correlationId) && (
              <AppText variant="caption" color="secondary">
                {[
                  sourceLabel,
                  actorLabel,
                  revertsLabel,
                  item.correlationId
                    ? AppConfig.strings.audit.correlationLabel(item.correlationId)
                    : undefined,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </AppText>
            )}
            <AppText variant="caption" color="secondary" numberOfLines={1}>
              {entityIdLabel}
            </AppText>
          </Stack>
          <AppIcon
            name={isExpanded ? Icon.ChevronUp : Icon.ChevronDown}
            size={Size.sm}
            color={theme.textSecondary}
          />
        </Inline>
      </PressScaleTouchable>

      {isExpanded && parsedChanges && (
        <Stack gap="md" style={styles.expandedContent}>
          <AuditLogChangesView
            changes={parsedChanges}
            accountMap={accountMap}
            workplaceCurrency={workplaceCurrency}
          />

          <Inline justify="flex-end" gap="sm">
            {onShowRelated && item.correlationId && (
              <PressScaleTouchable
                pressScale="subtle"
                style={[styles.actionButton, { backgroundColor: theme.surfaceSecondary }]}
                onPress={() => onShowRelated(item.correlationId!)}
                accessibilityRole="button"
                accessibilityLabel={AppConfig.strings.audit.relatedChangesCta}
              >
                <AppIcon name={Icon.History} size={Size.xs} color={theme.textSecondary} />
                <AppText variant="caption" weight="semibold">
                  {AppConfig.strings.audit.relatedChangesCta}
                </AppText>
              </PressScaleTouchable>
            )}
            {onView && canViewEntity && (
              <PressScaleTouchable
                pressScale="subtle"
                style={[styles.actionButton, { backgroundColor: theme.surfaceSecondary }]}
                onPress={() =>
                  onView(item.entityType, item.entityId, entityDisplayName || undefined)
                }
                accessibilityRole="button"
                accessibilityLabel={`View ${entityDisplayName || entityLabel}`}
              >
                <AppIcon name={Icon.Eye} size={Size.xs} color={theme.textSecondary} />
                <AppText variant="caption" weight="semibold">
                  {AppConfig.strings.audit.viewCta}
                </AppText>
              </PressScaleTouchable>
            )}
            {onRevert && canRevert && (
              <PressScaleTouchable
                pressScale="subtle"
                style={[
                  styles.actionButton,
                  { backgroundColor: withOpacity(theme.warning, Opacity.soft) },
                ]}
                onPress={() => onRevert(item.id)}
                accessibilityRole="button"
                accessibilityLabel={`Revert ${entityDisplayName || entityLabel}`}
              >
                <AppIcon name={Icon.Refresh} size={Size.xs} color={theme.warning} />
                <AppText variant="caption" weight="semibold">
                  {AppConfig.strings.audit.revertCta}
                </AppText>
              </PressScaleTouchable>
            )}
          </Inline>
        </Stack>
      )}
    </AppCard>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: Spacing.md,
  },
  expandedContent: {
    marginTop: Spacing.sm,
  },
  actionButton: {
    minHeight: Size.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: Shape.radius.sm,
    gap: Spacing.xs,
  },
});
