import { AppText } from '@/components/core';
import { useTheme } from '@/hooks/use-theme';
import React from 'react';
import { StyleSheet, View } from 'react-native';

export default function ReportsScreen() {
    const { theme, themeMode } = useTheme();

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <AppText variant="heading" themeMode={themeMode}>Reports</AppText>
            <AppText variant="body" themeMode={themeMode} color="secondary" style={styles.subtitle}>
                Coming Soon: Net Worth, Income vs Expense, and more.
            </AppText>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    subtitle: {
        textAlign: 'center',
        marginTop: 10,
    },
});
