import { useUI } from '@/contexts/UIContext';
import { JournalListScreen } from '@/src/features/journal/list/JournalListScreen';
import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-get-random-values';

export default function IndexScreen() {
  const { hasCompletedOnboarding, isInitialized } = useUI();

  // Show loading screen while preferences are being loaded
  if (!isInitialized) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (hasCompletedOnboarding) {
    // Render the journal list content as the dashboard
    return <JournalListScreen />;
  }

  // Mandatory onboarding for new users
  return <Redirect href="/onboarding" />;
}
