import { useAppReady } from '@/src/contexts/app-shell/AppReadyProvider';
import { useTheme } from '@/src/hooks/use-theme';
import { useLaunchCoordinator } from './LaunchCoordinator';
import * as Linking from 'expo-linking';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

/**
 * Root Index - Entry point for the application.
 * Routes an open Workplace into tabs, or stays a themed carrier while launch resolves.
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
  const carrier = <View style={{ flex: 1, backgroundColor: theme.background }} />;

  useEffect(() => {
    Linking.getInitialURL().then(url => setInitialUrl(url ?? null));
  }, []);

  if (!isAppReady || launch.kind === 'loading' || launch.kind === 'error') {
    return carrier;
  }
  if (launch.kind !== 'open') return carrier;

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
