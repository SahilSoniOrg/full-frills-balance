import { AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Shape, Size, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { AdvancedModeInfoModal } from './AdvancedModeInfoModal';

interface JournalModeToggleProps {
    isGuidedMode: boolean;
    setIsGuidedMode: (mode: boolean) => void;
    variant?: 'default' | 'compact';
}

export const JournalModeToggle = ({ isGuidedMode, setIsGuidedMode, variant = 'default' }: JournalModeToggleProps) => {
    const { theme } = useTheme();
    const [infoModalVisible, setInfoModalVisible] = useState(false);
    const isCompact = variant === 'compact';

    if (isCompact) {
        return (
            <View style={[styles.compactWrapper]}>
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
                            {AppConfig.strings.transactionFlow.simple}
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
                            {AppConfig.strings.transactionFlow.advanced}
                        </AppText>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity
                    style={styles.infoIconCompact}
                    onPress={() => setInfoModalVisible(true)}
                    accessibilityLabel={AppConfig.strings.transactionFlow.explanationIconAccessibility}
                >
                    <AppIcon name="helpCircle" size={Size.iconXs} color={theme.textSecondary} />
                </TouchableOpacity>

                <AdvancedModeInfoModal
                    visible={infoModalVisible}
                    onClose={() => setInfoModalVisible(false)}
                />
            </View>
        );
    }

    return (
        <View style={styles.defaultWrapper}>
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

            <TouchableOpacity
                style={styles.infoIconDefault}
                onPress={() => setInfoModalVisible(true)}
                accessibilityLabel={AppConfig.strings.transactionFlow.explanationIconAccessibility}
            >
                <AppIcon name="helpCircle" size={Size.iconSm} color={theme.textSecondary} />
            </TouchableOpacity>

            <AdvancedModeInfoModal
                visible={infoModalVisible}
                onClose={() => setInfoModalVisible(false)}
            />
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
    compactWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    compactContainer: {
        flexDirection: 'row',
        borderRadius: Shape.radius.full,
        borderWidth: 1,
        padding: Spacing.xs,
        gap: Spacing.xs,
    },
    compactButton: {
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.md,
        borderRadius: Shape.radius.full,
        alignItems: 'center',
        justifyContent: 'center',
    },
    infoIconCompact: {
        padding: Spacing.xs,
    },
    defaultWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingRight: Spacing.lg,
    },
    infoIconDefault: {
        padding: Spacing.sm,
    },
});
