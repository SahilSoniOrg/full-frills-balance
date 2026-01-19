import { AppCard, AppText } from '@/components/core';
import { Shape, Spacing, ThemeMode } from '@/constants';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface JournalModeToggleProps {
    isGuidedMode: boolean;
    setIsGuidedMode: (mode: boolean) => void;
    theme: any;
    themeMode: ThemeMode;
}

export const JournalModeToggle = ({ isGuidedMode, setIsGuidedMode, theme, themeMode }: JournalModeToggleProps) => {
    return (
        <AppCard elevation="sm" padding="lg" style={styles.modeToggleCard} themeMode={themeMode}>
            <View style={styles.modeToggleContainer}>
                <TouchableOpacity
                    style={[
                        styles.modeButton,
                        isGuidedMode && styles.modeButtonActive,
                        { backgroundColor: isGuidedMode ? theme.primary : theme.surface }
                    ]}
                    onPress={() => setIsGuidedMode(true)}
                >
                    <AppText
                        variant="body"
                        themeMode={themeMode}
                        style={{ color: isGuidedMode ? '#fff' : theme.text }}
                    >
                        Simple
                    </AppText>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.modeButton,
                        !isGuidedMode && styles.modeButtonActive,
                        { backgroundColor: !isGuidedMode ? theme.primary : theme.surface }
                    ]}
                    onPress={() => setIsGuidedMode(false)}
                >
                    <AppText
                        variant="body"
                        themeMode={themeMode}
                        style={{ color: !isGuidedMode ? '#fff' : theme.text }}
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
        backgroundColor: '#f5f5f5',
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
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
        elevation: 2,
    },
});
