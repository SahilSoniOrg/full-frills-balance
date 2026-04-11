import { AppCard, AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing, withOpacity } from '@/src/constants';
import {
  AuditLogEntry,
  EntityStatus,
  useAuditLogDiffViewModel,
} from '@/src/features/audit/hooks/useAuditLogDiffViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface AuditLogItemProps {
  item: AuditLogEntry;
  isExpanded: boolean;
  onToggle: () => void;
  onView?: (entityType: string, entityId: string, name?: string) => void;
  onRevert?: (logId: string) => void;
  accountMap: Record<string, { name: string; currency: string }>;
  entityStatusMap: Record<string, EntityStatus>;
}

export const AuditLogItem = ({
  item,
  isExpanded,
  onToggle,
  onView,
  onRevert,
  accountMap,
  entityStatusMap,
}: AuditLogItemProps) => {
  const { theme } = useTheme();
  const {
    actionColor,
    actionIcon,
    parsedChanges,
    entityLabel,
    entityDisplayName,
    timestampLabel,
    entityIdLabel,
    renderChanges,
    canRevert,
  } = useAuditLogDiffViewModel({ item, accountMap, entityStatusMap });

  return (
    <AppCard style={styles.card} padding="md" elevation="sm">
      <TouchableOpacity
        onPress={onToggle}
        accessibilityLabel={AppConfig.strings.audit.viewDetails}
        accessibilityRole="button"
      >
        <View style={styles.row}>
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: withOpacity(actionColor, Opacity.soft) },
            ]}
          >
            <AppIcon name={actionIcon} size={Size.sm} color={actionColor} />
          </View>
          <View style={styles.content}>
            <View style={styles.headerRow}>
              <AppText variant="body" weight="semibold">
                {entityLabel}
                {entityDisplayName ? `: ${entityDisplayName}` : ''}
              </AppText>
              <AppText variant="caption" style={{ color: actionColor }}>
                {item.action}
              </AppText>
            </View>
            <AppText variant="caption" color="secondary">
              {timestampLabel}
            </AppText>
            <AppText variant="caption" color="secondary" numberOfLines={1}>
              {entityIdLabel}
            </AppText>
          </View>
          <AppIcon
            name={isExpanded ? 'chevronUp' : 'chevronDown'}
            size={Size.sm}
            color={theme.textSecondary}
          />
        </View>
      </TouchableOpacity>

      {isExpanded && parsedChanges && (
        <View style={styles.expandedContent}>
          {renderChanges(parsedChanges)}

          <View style={styles.actions}>
            {onView && (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: theme.surfaceSecondary }]}
                onPress={() =>
                  onView(item.entityType, item.entityId, entityDisplayName || undefined)
                }
              >
                <AppIcon name="eye" size={Size.xs} color={theme.textSecondary} />
                <AppText variant="caption" weight="semibold">
                  {AppConfig.strings.audit.viewCta}
                </AppText>
              </TouchableOpacity>
            )}
            {onRevert && canRevert && (
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  { backgroundColor: withOpacity(theme.warning, Opacity.soft) },
                ]}
                onPress={() => onRevert(item.id)}
              >
                <AppIcon name="refresh" size={Size.xs} color={theme.warning} />
                <AppText variant="caption" weight="semibold">
                  {AppConfig.strings.audit.revertCta}
                </AppText>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </AppCard>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  iconContainer: {
    width: Size.xl,
    height: Size.xl,
    borderRadius: Shape.radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    gap: Spacing.xs / 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: Spacing.sm,
  },
  expandedContent: {
    marginTop: Spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: Shape.radius.sm,
    gap: Spacing.xs,
  },
});
