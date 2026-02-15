import { AppCard, AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing, withOpacity } from '@/src/constants';
import { AuditLogEntry, useAuditLogDiffViewModel } from '@/src/features/audit/hooks/useAuditLogDiffViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface AuditLogItemProps {
    item: AuditLogEntry;
    isExpanded: boolean;
    onToggle: () => void;
    accountMap: Record<string, { name: string; currency: string }>;
}

export const AuditLogItem = ({ item, isExpanded, onToggle, accountMap }: AuditLogItemProps) => {
    const { theme } = useTheme();
    const {
        actionColor,
        actionIcon,
        parsedChanges,
        entityLabel,
        timestampLabel,
        entityIdLabel,
        renderChanges,
    } = useAuditLogDiffViewModel({ item, accountMap });

    return (
        <AppCard style={styles.card} padding="md" elevation="sm">
            <TouchableOpacity onPress={onToggle} accessibilityLabel={AppConfig.strings.audit.viewDetails} accessibilityRole="button">
                <View style={styles.row}>
                    <View style={[styles.iconContainer, { backgroundColor: withOpacity(actionColor, Opacity.soft) }]}>
                        <AppIcon name={actionIcon} size={Size.sm} color={actionColor} />
                    </View>
                    <View style={styles.content}>
                        <View style={styles.headerRow}>
                            <AppText variant="body" weight="semibold">
                                {entityLabel}
                            </AppText>
                            <AppText variant="caption" style={{ color: actionColor }}>
                                {item.action}
                            </AppText>
                        </View>
                        <AppText variant="caption" color="secondary">
                            {timestampLabel}
                        </AppText>
                        <AppText variant="caption" color="secondary" numberOfLines={1}>
                            {entityIdLabel}...
                        </AppText>
                    </View>
                    <AppIcon name={isExpanded ? 'chevronUp' : 'chevronDown'} size={Size.sm} color={theme.textSecondary} />
                </View>
                {isExpanded && parsedChanges && renderChanges(parsedChanges)}
            </TouchableOpacity>
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
        alignItems: 'center',
    },
});
