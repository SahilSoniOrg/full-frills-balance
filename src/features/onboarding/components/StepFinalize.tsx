import { AppButton, AppIcon, AppText } from '@/src/components/core';
import { Size, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, View } from 'react-native';

interface StepFinalizeProps {
    onFinish: () => void;
    isCompleting: boolean;
}

export const StepFinalize: React.FC<StepFinalizeProps> = ({
    onFinish,
    isCompleting,
}) => {
    const { theme } = useTheme();

    return (
        <View style={styles.container}>
            <View style={styles.iconContainer}>
                <AppIcon name="checkCircle" size={Size.xxl * 2} color={theme.primary} />
            </View>

            <AppText variant="title" style={styles.title}>
                All Ready!
            </AppText>

            <AppText variant="body" color="secondary" style={styles.subtitle}>
                Your accounts are set up and ready to go. Let&apos;s start tracking your balance.
            </AppText>

            <View style={styles.buttonContainer}>
                <AppButton
                    variant="primary"
                    size="lg"
                    onPress={onFinish}
                    loading={isCompleting}
                    style={styles.finishButton}
                >
                    Let&apos;s Begin
                </AppButton>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
        alignItems: 'center',
        padding: Spacing.lg,
    },
    iconContainer: {
        marginBottom: Spacing.xl,
    },
    title: {
        textAlign: 'center',
        marginBottom: Spacing.md,
    },
    subtitle: {
        textAlign: 'center',
        marginBottom: Spacing.xxl,
        maxWidth: 300,
    },
    buttonContainer: {
        width: '100%',
        marginTop: Spacing.lg,
    },
    finishButton: {
        width: '100%',
    },
});
