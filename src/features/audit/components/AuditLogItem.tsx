import { AppCard, AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing, withOpacity } from '@/src/constants';
import { Box, Inline, Stack } from '@/src/design-system';
import {
  AuditLogEntry,
  EntityStatus,
  useAuditLogDiffViewModel,
} from '@/src/features/audit/hooks/useAuditLogDiffViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';

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
    <AppCard padding="md" elevation="sm" radius="r2" style={styles.card}>
      <TouchableOpacity
        onPress={onToggle}
        accessibilityLabel={AppConfig.strings.audit.viewDetails}
        accessibilityRole="button"
        activeOpacity={Opacity.heavy}
      >
        <Inline gap="md" align="center">
          <Box
            width={Size.xl}
            height={Size.xl}
            borderRadius="full"
            alignItems="center"
            justifyContent="center"
            background={actionColor}
            backgroundOpacity="soft"
          >
            <AppIcon name={actionIcon} size={Size.sm} color={theme[actionColor]} />
          </Box>
          <Stack flex={1} gap="xs">
            <Inline justify="space-between" align="baseline" gap="sm">
              <AppText variant="body" weight="semibold">
                {entityLabel}
                {entityDisplayName ? `: ${entityDisplayName}` : ''}
              </AppText>
              <AppText variant="caption" style={{ color: theme[actionColor] }}>
                {item.action}
              </AppText>
            </Inline>
            <AppText variant="caption" color="secondary">
              {timestampLabel}
            </AppText>
            <AppText variant="caption" color="secondary" numberOfLines={1}>
              {entityIdLabel}
            </AppText>
          </Stack>
          <AppIcon
            name={isExpanded ? 'chevronUp' : 'chevronDown'}
            size={Size.sm}
            color={theme.textSecondary}
          />
        </Inline>
      </TouchableOpacity>

      {isExpanded && parsedChanges && (
        <Stack gap="md" style={styles.expandedContent}>
          {renderChanges(parsedChanges)}

          <Inline justify="flex-end" gap="sm">
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: Shape.radius.sm,
    gap: Spacing.xs,
  },
});
