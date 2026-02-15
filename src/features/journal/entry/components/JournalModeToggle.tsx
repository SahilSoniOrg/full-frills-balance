import { AppText } from '@/src/components/core';
import { AppConfig, Shape, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface JournalModeToggleProps {
    isGuidedMode: boolean;
    setIsGuidedMode: (mode: boolean) => void;
    variant?: 'default' | 'compact';
}

export const JournalModeToggle = ({ isGuidedMode, setIsGuidedMode, variant = 'default' }: JournalModeToggleProps) => {
    const { theme } = useTheme();
    const isCompact = variant === 'compact';

    if (isCompact) {
        return (
            <View style={[styles.compactContainer, { borderColor: theme.border, backgroundColor: theme.surfaceSecondary }]}>
                <TouchableOpacity
                    style={[
                        styles.compactButton,
                        { backgroundColor: isGuidedMode ? theme.surface : 'transparent' },
                    ]}
                    onPress={() => setIsGuidedMode(true)}
                >
                    <AppText
                        variant="caption"
                        weight={isGuidedMode ? "bold" : "medium"}
                        style={{ color: isGuidedMode ? theme.primary : theme.textSecondary }}
                    >
                        Simple
                    </AppText>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.compactButton,
                        { backgroundColor: !isGuidedMode ? theme.surface : 'transparent' },
                    ]}
                    onPress={() => setIsGuidedMode(false)}
                >
                    <AppText
                        variant="caption"
                        weight={!isGuidedMode ? "bold" : "medium"}
                        style={{ color: !isGuidedMode ? theme.primary : theme.textSecondary }}
                    >
                        Advanced
                    </AppText>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View
            style={[
                styles.modeToggleContainer,
                styles.modeToggleContainerDefault,
                { backgroundColor: theme.surfaceSecondary }
            ]}
        >
            <TouchableOpacity
                style={[
                    styles.modeButton,
                    { backgroundColor: isGuidedMode ? theme.surface : 'transparent' },
                    isGuidedMode && Shape.elevation.sm
                ]}
                onPress={() => setIsGuidedMode(true)}
            >
                <AppText
                    variant='body'
                    weight={isGuidedMode ? "bold" : "medium"}
                    style={{ color: isGuidedMode ? theme.primary : theme.textSecondary }}
                >
                    {AppConfig.strings.transactionFlow.simple}
                </AppText>
            </TouchableOpacity>

            <TouchableOpacity
                style={[
                    styles.modeButton,
                    { backgroundColor: !isGuidedMode ? theme.surface : 'transparent' },
                    !isGuidedMode && Shape.elevation.sm
                ]}
                onPress={() => setIsGuidedMode(false)}
            >
                <AppText
                    variant='body'
                    weight={!isGuidedMode ? "bold" : "medium"}
                    style={{ color: !isGuidedMode ? theme.primary : theme.textSecondary }}
                >
                    {AppConfig.strings.transactionFlow.advanced}
                </AppText>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    modeToggleContainer: {
        flexDirection: 'row',
        borderRadius: Shape.radius.full,
        padding: Spacing.xs,
    },
    modeToggleContainerDefault: {
        marginHorizontal: Spacing.lg,
        marginVertical: Spacing.md,
    },
    modeButton: {
        flex: 1,
        paddingVertical: Spacing.md,
        paddingHorizontal: Spacing.md,
        borderRadius: Shape.radius.full,
        alignItems: 'center',
        justifyContent: 'center',
    },
    compactContainer: {
        flexDirection: 'row',
        borderRadius: Shape.radius.full,
        borderWidth: 1,
        padding: Spacing.xs,
        gap: Spacing.xs,
        minWidth: 0,
    },
    compactButton: {
        minWidth: 0,
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.sm,
        borderRadius: Shape.radius.full,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
