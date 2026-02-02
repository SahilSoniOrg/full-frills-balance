/**
 * Dashboard Screen - Main entry point for the dashboard tab
 * 
 * Handles loading state and renders JournalListScreen content.
 */
import { useUI } from '@/src/contexts/UIContext';
import { JournalListScreen } from '@/src/features/journal/list/JournalListScreen';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

export default function DashboardScreen() {
    const { hasCompletedOnboarding, isInitialized } = useUI();

    if (!isInitialized) {
        return (
            <View style={styles.loading}>
                <ActivityIndicator size="large" />
            </View>
        );
    }

    if (hasCompletedOnboarding) {
        return <JournalListScreen />;
    }

    return null;
}

const styles = StyleSheet.create({
    loading: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
