import { useUser } from '@/contexts/UIContext';
import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-get-random-values';
import JournalListScreen from './journal-list-content';

export default function IndexScreen() {
  const { hasCompletedOnboarding, isInitialized } = useUser();

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
