import { AppText, IconButton } from '@/src/components/core';
import { Size } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { Pattern } from '@/src/services/insight-service';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Box, Inline } from '@/src/design-system';

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
        <Box marginBottom="sm">
            <Inline align="center" justify="space-between" space="md" marginBottom="lg">
                <Box flex={1} style={{ minWidth: 0 }}>
                    <AppText variant="title" numberOfLines={1}>
                        {greeting}
                    </AppText>
                </Box>

                <Inline align="center" space="xs">
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
                </Inline>
            </Inline>
        </Box>
    );
}

const styles = StyleSheet.create({
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
