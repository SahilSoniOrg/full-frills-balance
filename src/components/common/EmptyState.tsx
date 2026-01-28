/**
 * EmptyState Component
 * 
 * Reusable component for displaying empty list states with consistent styling.
 */
import { AppButton, AppText } from '@/src/components/core';
import { Opacity, Spacing, Typography } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';

export interface EmptyStateProps {
    /** Icon name from Ionicons */
    icon?: keyof typeof Ionicons.glyphMap;
    /** Main title text */
    title: string;
    /** Optional subtitle/description text */
    subtitle?: string;
    /** Optional action button */
    action?: {
        label: string;
        onPress: () => void;
    };
}

export function EmptyState({
    icon = 'folder-open-outline',
    title,
    subtitle,
    action,
}: EmptyStateProps) {
    const { theme } = useTheme();

    return (
        <View style={styles.container}>
            <Ionicons
                name={icon}
                size={48}
                color={theme.textSecondary}
                style={styles.icon}
            />
            <AppText variant="heading" style={styles.title}>
                {title}
            </AppText>
            {subtitle && (
                <AppText
                    variant="body"
                    color="secondary"
                    style={styles.subtitle}
                >
                    {subtitle}
                </AppText>
            )}
            {action && (
                <AppButton
                    variant="ghost"
                    onPress={action.onPress}
                    style={styles.actionButton}
                >
                    {action.label}
                </AppButton>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: Spacing.xxxxl * 2,
        paddingHorizontal: Spacing.lg,
    },
    icon: {
        marginBottom: Spacing.md,
        opacity: Opacity.medium,
    },
    title: {
        fontSize: Typography.sizes.lg,
        marginBottom: Spacing.sm,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: Typography.sizes.sm,
        opacity: Opacity.medium,
        textAlign: 'center',
    },
    actionButton: {
        marginTop: Spacing.lg,
    },
});
