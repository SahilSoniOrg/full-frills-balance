import { AppText, IconButton } from '@/src/components/core';
import { Size, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { Pattern } from '@/src/services/insight-service';
import React from 'react';
import { StyleSheet, View } from 'react-native';

interface DashboardHeaderProps {
    greeting: string;
    patterns?: Pattern[];
    onInsightsPress?: () => void;
    isPrivacyMode: boolean;
    onTogglePrivacy: () => void;
}

export function DashboardHeader({
    greeting,
    patterns = [],
    onInsightsPress,
    isPrivacyMode,
    onTogglePrivacy
}: DashboardHeaderProps) {
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

                <View style={styles.actionButtons}>
                    <IconButton
                        name={isPrivacyMode ? "eyeOff" : "eye"}
                        size={Size.iconSm}
                        variant="clear"
                        onPress={onTogglePrivacy}
                        accessibilityLabel={isPrivacyMode ? "Show balances" : "Hide balances"}
                        iconColor={theme.text}
                    />
                    {onInsightsPress && (
                        <View style={styles.bellContainer}>
                            <IconButton
                                name="sparkles"
                                size={Size.iconSm}
                                variant="clear"
                                onPress={onInsightsPress}
                                accessibilityRole="button"
                                accessibilityLabel="View Insights"
                                iconColor={theme.text}
                            />
                            {insightsCount > 0 && (
                                <View style={[styles.badge, { backgroundColor: theme.error }]} />
                            )}
                        </View>
                    )}
                </View>
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
    actionButtons: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
    },
    bellContainer: {
        position: 'relative',
    },
    badge: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 8,
        height: 8,
        borderRadius: 4,
    }
});
