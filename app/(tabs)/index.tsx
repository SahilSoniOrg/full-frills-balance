import { useUI } from '@/src/contexts/UIContext';
import { JournalListScreen } from '@/src/features/journal/list/JournalListScreen';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';

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

  // Fallback (should be handled by root index, but safe to keep as null or basic view)
  return null;
}
