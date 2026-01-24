import { AppCard, AppText } from '@/components/core';
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
        <AppCard elevation="sm" padding="lg" style={styles.modeToggleCard}>
            <View style={[styles.modeToggleContainer, { backgroundColor: theme.surfaceSecondary }]}>
                <TouchableOpacity
                    style={[
                        styles.modeButton,
                        isGuidedMode && styles.modeButtonActive,
                        { backgroundColor: isGuidedMode ? theme.primary : 'transparent' }
                    ]}
                    onPress={() => setIsGuidedMode(true)}
                >
                    <AppText
                        variant="body"
                        style={{ color: isGuidedMode ? theme.pureInverse : theme.text }}
                    >
                        Simple
                    </AppText>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.modeButton,
                        !isGuidedMode && styles.modeButtonActive,
                        { backgroundColor: !isGuidedMode ? theme.primary : 'transparent' }
                    ]}
                    onPress={() => setIsGuidedMode(false)}
                >
                    <AppText
                        variant="body"
                        style={{ color: !isGuidedMode ? theme.pureInverse : theme.text }}
                    >
                        Advanced
                    </AppText>
                </TouchableOpacity>
            </View>
        </AppCard>
    );
};

const styles = StyleSheet.create({
    modeToggleCard: {
        marginHorizontal: Spacing.lg,
        marginBottom: Spacing.md,
    },
    modeToggleContainer: {
        flexDirection: 'row',
        borderRadius: Shape.radius.full,
        padding: Spacing.xs,
    },
    modeButton: {
        flex: 1,
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.md,
        borderRadius: Shape.radius.full,
        alignItems: 'center',
    },
    modeButtonActive: {
        ...Shape.elevation.sm,
    },
});
