import { AppText } from '@/components/core';
import { Shape, Spacing } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface JournalModeToggleProps {
    isGuidedMode: boolean;
    setIsGuidedMode: (mode: boolean) => void;
}

export const JournalModeToggle = ({ isGuidedMode, setIsGuidedMode }: JournalModeToggleProps) => {
    const { theme } = useTheme();

    return (
        <View style={[styles.modeToggleContainer, { backgroundColor: theme.surfaceSecondary }]}>
            <TouchableOpacity
                style={[
                    styles.modeButton,
                    { backgroundColor: isGuidedMode ? theme.surface : 'transparent' },
                    isGuidedMode && Shape.elevation.sm
                ]}
                onPress={() => setIsGuidedMode(true)}
            >
                <AppText
                    variant="body"
                    weight={isGuidedMode ? "bold" : "medium"}
                    style={{ color: isGuidedMode ? theme.primary : theme.textSecondary }}
                >
                    Simple
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
                    variant="body"
                    weight={!isGuidedMode ? "bold" : "medium"}
                    style={{ color: !isGuidedMode ? theme.primary : theme.textSecondary }}
                >
                    Advanced
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
        marginHorizontal: Spacing.lg,
        marginVertical: Spacing.md,
    },
    modeButton: {
        flex: 1,
        paddingVertical: Spacing.md, // Approx 10->12
        paddingHorizontal: Spacing.md,
        borderRadius: Shape.radius.full,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
