import { AppIcon, AppText } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { Pattern } from '@/src/services/insight-service';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface DashboardHeaderProps {
    greeting: string;
    patterns?: Pattern[];
    onInsightsPress?: () => void;
}

export function DashboardHeader({ greeting, patterns = [], onInsightsPress }: DashboardHeaderProps) {
    const { theme } = useTheme();
    const insightsCount = patterns.length;

    return (
        <View style={styles.container}>
            <View style={styles.headerRow}>
                <View style={styles.greetingContainer}>
                    <AppText variant="title" numberOfLines={1}>
                        {greeting}
                    </AppText>
                </View>

                {onInsightsPress && (
                    <TouchableOpacity
                        style={styles.bellContainer}
                        onPress={onInsightsPress}
                        accessibilityRole="button"
                        accessibilityLabel="View Insights"
                    >
                        <AppIcon name="sparkles" size={24} color={theme.text} />
                        {insightsCount > 0 && (
                            <View style={[styles.badge, { backgroundColor: theme.error }]} />
                        )}
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: Spacing.sm,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: Spacing.lg,
        gap: Spacing.md,
    },
    greetingContainer: {
        flex: 1,
        minWidth: 0,
        marginRight: Spacing.sm,
    },
    bellContainer: {
        position: 'relative',
        padding: Spacing.xs,
    },
    badge: {
        position: 'absolute',
        top: 2,
        right: 4,
        width: 8,
        height: 8,
        borderRadius: 4,
    }
});
