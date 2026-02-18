import { AppButton, AppInput, AppText } from '@/src/components/core';
import { AppConfig, Layout, Spacing, Typography } from '@/src/constants';
import { useImport } from '@/src/hooks/use-import';
import { useTheme } from '@/src/hooks/use-theme';
import { router } from 'expo-router';
import React from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

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
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.container}
            keyboardVerticalOffset={Platform.OS === 'android' ? Layout.keyboardOffset.android : 0}
        >
            <View style={styles.header}>
                <AppText variant="hero" style={styles.title}>
                    {AppConfig.strings.onboarding.splash.title}
                </AppText>
                <AppText variant="body" color="secondary" style={styles.subtitle}>
                    {AppConfig.strings.onboarding.splash.subtitle}
                </AppText>
            </View>

            <View style={styles.content}>
                <AppInput
                    label={AppConfig.strings.onboarding.splash.inputLabel}
                    placeholder={AppConfig.strings.onboarding.splash.inputPlaceholder}
                    value={name}
                    onChangeText={setName}
                    autoFocus
                    accessibilityLabel={AppConfig.strings.onboarding.splash.inputLabel}
                    containerStyle={styles.inputContainer}
                />

                <AppButton
                    variant="primary"
                    size="lg"
                    onPress={onContinue}
                    disabled={!name.trim() || isCompleting}
                    style={styles.continueButton}
                    accessibilityLabel={AppConfig.strings.onboarding.splash.btnGetStarted}
                    accessibilityState={{ disabled: !name.trim() || isCompleting }}
                >
                    {AppConfig.strings.onboarding.splash.btnGetStarted}
                </AppButton>
            </View>

            <View style={styles.footer}>
                <View style={styles.divider}>
                    <View style={[styles.line, { backgroundColor: theme.border }]} />
                    <AppText variant="caption" color="secondary" style={styles.orText}>
                        {AppConfig.strings.onboarding.splash.dividerOr}
                    </AppText>
                    <View style={[styles.line, { backgroundColor: theme.border }]} />
                </View>

                <AppButton
                    variant="ghost"
                    size="md"
                    onPress={() => router.push('/import-selection')}
                    loading={isImporting}
                    disabled={isImporting || isCompleting}
                    accessibilityLabel={AppConfig.strings.onboarding.splash.btnRestore}
                >
                    {AppConfig.strings.onboarding.splash.btnRestore}
                </AppButton>
            </View>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'space-between',
        paddingVertical: Spacing.xl,
    },
    header: {
        alignItems: 'center',
        paddingTop: Spacing.xl,
    },
    title: {
        textAlign: 'center',
        marginBottom: Spacing.md,
    },
    subtitle: {
        textAlign: 'center',
    },
    content: {
        width: '100%',
        paddingHorizontal: Spacing.md,
    },
    inputContainer: {
        marginBottom: Spacing.xl,
    },
    continueButton: {
        width: '100%',
    },
    footer: {
        width: '100%',
        paddingBottom: Spacing.lg,
    },
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: Spacing.lg,
        paddingHorizontal: Spacing.xl,
    },
    line: {
        flex: 1,
        height: 1,
    },
    orText: {
        marginHorizontal: Spacing.md,
        textTransform: 'uppercase',
        letterSpacing: 1,
        fontSize: Typography.sizes.xs,
    },
});
