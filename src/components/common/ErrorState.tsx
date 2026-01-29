/**
 * ErrorState Component
 * 
 * Reusable component for displaying error states with consistent styling.
 */
import { AppButton, AppIcon, AppText } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, View } from 'react-native';

export interface ErrorStateProps {
    /** Main error title (default: "Something went wrong") */
    title?: string;
    /** Error message/description */
    message?: string;
    /** Retry handler */
    onRetry?: () => void;
    /** Go back handler */
    onBack?: () => void;
}

export function ErrorState({
    title = 'Something went wrong',
    message,
    onRetry,
    onBack,
}: ErrorStateProps) {
    const { theme } = useTheme();

    return (
        <View style={styles.container}>
            <AppIcon
                name="error"
                size={48}
                color={theme.textSecondary}
                style={styles.icon}
            />
            <AppText variant="subheading" style={styles.title}>
                {title}
            </AppText>
            {message && (
                <AppText
                    variant="body"
                    color="secondary"
                    style={styles.message}
                >
                    {message}
                </AppText>
            )}
            <View style={styles.actions}>
                {onRetry && (
                    <AppButton
                        variant="primary"
                        onPress={onRetry}
                        style={styles.button}
                    >
                        Try Again
                    </AppButton>
                )}
                {onBack && (
                    <AppButton
                        variant="ghost"
                        onPress={onBack}
                        style={styles.button}
                    >
                        Go Back
                    </AppButton>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
    },
    icon: {
        marginBottom: Spacing.md,
    },
    title: {
        marginBottom: Spacing.sm,
        textAlign: 'center',
    },
    message: {
        textAlign: 'center',
        marginBottom: Spacing.md,
    },
    actions: {
        marginTop: Spacing.lg,
        alignItems: 'center',
        gap: Spacing.sm,
    },
    button: {
        minWidth: 120,
    },
});
