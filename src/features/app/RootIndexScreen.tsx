import { useAppReady } from '@/src/contexts/app-shell/AppReadyProvider';
import { useTheme } from '@/src/hooks/use-theme';
import { useLaunchCoordinator } from './LaunchCoordinator';
import * as Linking from 'expo-linking';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

/**
 * Root Index - Entry point for the application.
 * Routes user to the appropriate screen based on onboarding status.
 *
 * On cold start with a widget deeplink (e.g. fullfrillsbalance://journal-entry?...),
 * we detect the pending URL and skip the redirect so Expo Router can resolve
 * the deeplink path directly.
 */
export function RootIndexScreen() {
  const { isAppReady } = useAppReady();
  const launch = useLaunchCoordinator();
  const { theme } = useTheme();
  // undefined = still loading, null = no initial URL
  const [initialUrl, setInitialUrl] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    Linking.getInitialURL().then(url => setInitialUrl(url ?? null));
  }, []);

  if (!isAppReady) {
    // TIGHTENED: Render a themed carrier view instead of null to prevent "black void" flicker
    // during the handoff from native splash to React Native surface.
    return <View style={{ flex: 1, backgroundColor: theme.background }} />;
  }

  if (launch.kind === 'loading' || launch.kind === 'error') {
    return <View style={{ flex: 1, backgroundColor: theme.background }} />;
  }
  if (launch.kind !== 'open') return null;

  // Bare books deep links are ambiguous before a Workplace is open. Only links
  // carrying the exact resolved Workplace identity may pass through.
  if (initialUrl) {
    const parsed = Linking.parse(initialUrl);
    if (parsed.path && parsed.path !== '/' && parsed.path !== '') {
      const linkedWorkplaceId = parsed.queryParams?.workplaceId;
      if (linkedWorkplaceId !== launch.workplaceId) return <Redirect href="/" />;
      return null;
    }
  }

  return <Redirect href="/(tabs)" />;
}
