import { useUI } from '@/src/contexts/UIContext';
import { Redirect } from 'expo-router';
import * as Linking from 'expo-linking';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

/**
 * Root Index - Entry point for the application.
 * Routes user to the appropriate screen based on onboarding status.
 *
 * On cold start with a widget deeplink (e.g. fullfrillsbalance://journal-entry?...),
 * we detect the pending URL and skip the redirect so Expo Router can resolve
 * the deeplink path directly.
 */
export function RootIndexScreen() {
  const { isInitialized, hasCompletedOnboarding } = useUI();
  // undefined = still loading, null = no initial URL
  const [initialUrl, setInitialUrl] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    Linking.getInitialURL().then(url => setInitialUrl(url ?? null));
  }, []);

  if (!isInitialized || initialUrl === undefined) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // If cold-started with a deeplink to a specific route, let Expo Router handle it
  if (initialUrl) {
    const parsed = Linking.parse(initialUrl);
    if (parsed.path && parsed.path !== '/' && parsed.path !== '') {
      return null;
    }
  }

  return hasCompletedOnboarding ? <Redirect href="/(tabs)" /> : <Redirect href="/onboarding" />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
