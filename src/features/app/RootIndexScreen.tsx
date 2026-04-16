import { useUI } from '@/src/contexts/UIContext';
import { useTheme } from '@/src/hooks/use-theme';
import * as Linking from 'expo-linking';
import { Redirect } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import * as SplashScreen from 'expo-splash-screen';

/**
 * Root Index - Entry point for the application.
 * Routes user to the appropriate screen based on onboarding status.
 *
 * On cold start with a widget deeplink (e.g. fullfrillsbalance://journal-entry?...),
 * we detect the pending URL and skip the redirect so Expo Router can resolve
 * the deeplink path directly.
 */
export function RootIndexScreen() {
  const { isAppReady, hasCompletedOnboarding } = useUI();
  const { theme } = useTheme();
  // undefined = still loading, null = no initial URL
  const [initialUrl, setInitialUrl] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    Linking.getInitialURL().then(url => setInitialUrl(url ?? null));
  }, []);

  useEffect(() => {
    // HARDENED: Hide splash as soon as UI is safe (Phase 2).
    // Do not wait for deep links if the main UI is ready to paint.
    if (isAppReady) {
      SplashScreen.hideAsync().catch(() => {
        /* ignore */
      });
    }
  }, [isAppReady]);

  if (!isAppReady) {
    // TIGHTENED: Render a themed carrier view instead of null to prevent "black void" flicker
    // during the handoff from native splash to React Native surface.
    return <View style={{ flex: 1, backgroundColor: theme.background }} />;
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
