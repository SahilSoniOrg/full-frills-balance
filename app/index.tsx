import { useUI } from '@/src/contexts/UIContext';
import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';

/**
 * Root Index - Entry point for the application.
 * Routes the user to the appropriate screen based on onboarding status.
 */
export default function RootIndex() {
    const { isInitialized, hasCompletedOnboarding } = useUI();

    if (!isInitialized) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" />
            </View>
        );
    }

    if (hasCompletedOnboarding) {
        return <Redirect href="/(tabs)" />;
    }

    return <Redirect href="/onboarding" />;
}
