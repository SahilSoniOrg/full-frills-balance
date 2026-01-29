import { AppButton, AppCard, AppIcon, AppText } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

export default function ReportsScreen() {
    const { theme } = useTheme();
    const router = useRouter();

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <AppCard elevation="sm" padding="lg" style={styles.section}>
                <View style={styles.iconContainer}>
                    <AppIcon name="reports" size={64} color={theme.primary} />
                </View>
                <AppText variant="heading" style={styles.heading}>Reports Coming Soon</AppText>
                <AppText variant="body" color="secondary" style={styles.description}>
                    Net Worth trends, Income vs Expense charts, and account-level analytics are on the way.
                </AppText>
            </AppCard>

            <AppCard elevation="sm" padding="lg" style={styles.section}>
                <AppText variant="subheading" style={styles.subheading}>Need your data now?</AppText>
                <AppText variant="body" color="secondary" style={styles.description}>
                    Export your data as JSON for backup or use in spreadsheets.
                </AppText>
                <AppButton
                    variant="outline"
                    onPress={() => router.push('/(tabs)/settings')}
                    style={styles.button}
                >
                    Go to Settings → Export
                </AppButton>
            </AppCard>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: Spacing.lg,
    },
    section: {
        marginBottom: Spacing.lg,
    },
    iconContainer: {
        alignItems: 'center',
        marginBottom: Spacing.lg,
    },
    heading: {
        marginBottom: Spacing.md,
        textAlign: 'center',
    },
    subheading: {
        marginBottom: Spacing.sm,
    },
    description: {
        marginBottom: Spacing.md,
    },
    button: {
        marginTop: Spacing.sm,
    },
});
