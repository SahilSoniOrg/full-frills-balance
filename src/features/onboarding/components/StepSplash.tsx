import { AppButton, AppCard, AppInput, AppText } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import { useImport } from '@/src/hooks/use-import';
import { useTheme } from '@/src/hooks/use-theme';
import { router } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

interface StepSplashProps {
    name: string;
    setName: (name: string) => void;
    onContinue: () => void;
    isCompleting: boolean;
}

export const StepSplash: React.FC<StepSplashProps> = ({
    name,
    setName,
    onContinue,
    isCompleting,
}) => {
    const { theme } = useTheme();
    const { isImporting } = useImport();

    return (
        <View style={styles.container}>
            <AppText variant="title" style={styles.title}>
                Welcome to Balance
            </AppText>
            <AppText variant="body" color="secondary" style={styles.subtitle}>
                Let&apos;s start with your name to personalize your experience.
            </AppText>

            <AppCard elevation="sm" padding="lg" style={styles.inputContainer}>
                <AppInput
                    placeholder="Enter your name"
                    value={name}
                    onChangeText={setName}
                    autoFocus
                    accessibilityLabel="Your name"
                />
            </AppCard>

            <AppButton
                variant="outline"
                size="md"
                onPress={onContinue}
                disabled={!name.trim() || isCompleting}
                style={styles.continueButton}
                accessibilityLabel="Continue to next step"
                accessibilityState={{ disabled: !name.trim() || isCompleting }}
            >
                Continue
            </AppButton>

            <View style={styles.divider}>
                <View style={[styles.line, { backgroundColor: theme.border }]} />
                <AppText variant="caption" color="secondary" style={styles.orText}>OR</AppText>
                <View style={[styles.line, { backgroundColor: theme.border }]} />
            </View>

            <AppButton
                variant="ghost"
                size="md"
                onPress={() => router.push('/import-selection')}
                loading={isImporting}
                disabled={isImporting || isCompleting}
                accessibilityLabel="Import backup from file"
            >
                Import Backup
            </AppButton>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
        flex: 1,
        justifyContent: 'center',
        paddingVertical: Spacing.xl,
    },
    title: {
        textAlign: 'center',
        marginBottom: Spacing.sm,
    },
    subtitle: {
        textAlign: 'center',
        marginBottom: Spacing.xl,
    },
    inputContainer: {
        marginBottom: Spacing.xl,
    },
    continueButton: {
        marginBottom: Spacing.xs,
    },
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: Spacing.lg,
    },
    line: {
        flex: 1,
        height: 1,
    },
    orText: {
        marginHorizontal: Spacing.md,
    },
});
