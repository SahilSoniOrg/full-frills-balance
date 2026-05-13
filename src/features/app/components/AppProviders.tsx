import { DatabaseProvider } from '@nozbe/watermelondb/react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import PostHog, { PostHogProvider } from 'posthog-react-native';
import React from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AlertContainer } from '@/src/components/common/AlertContainer';
import { ToastContainer } from '@/src/components/common/Toast';
import { ErrorBoundary } from '@/src/components/core';
import { UIProvider } from '@/src/contexts/UIContext';
import { database } from '@/src/data/database/Database';
import { resetAllCharts } from '@/src/hooks/chartInteractionRegistry';
import { useColorScheme } from '@/src/hooks/use-color-scheme';
import { AppLockInterceptor } from './AppLockInterceptor';
import { BootManager } from './BootManager';
import { FontManager } from './FontManager';

interface AppProvidersProps {
  children: React.ReactNode;
  analyticsClient: PostHog | null;
}

/**
 * Composes all global context providers and structural wrappers.
 */
export function AppProviders({ children, analyticsClient }: AppProvidersProps) {
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View
        style={{ flex: 1 }}
        onStartShouldSetResponderCapture={e => {
          const { pageX, pageY } = e.nativeEvent;
          resetAllCharts(pageX, pageY);
          return false;
        }}
      >
        <SafeAreaProvider>
          <ErrorBoundary>
            <DatabaseProvider database={database}>
              <UIProvider>
                <BootManager />
                <FontManager>
                  <MaybePostHogProvider client={analyticsClient}>
                    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
                      <AppLockInterceptor>{children}</AppLockInterceptor>
                      <AlertContainer />
                      <ToastContainer />
                    </ThemeProvider>
                  </MaybePostHogProvider>
                </FontManager>
              </UIProvider>
            </DatabaseProvider>
          </ErrorBoundary>
        </SafeAreaProvider>
      </View>
    </GestureHandlerRootView>
  );
}

/**
 * Helper to ensure we don't render PostHogProvider without a valid client.
 */
function MaybePostHogProvider({
  client,
  children,
}: {
  client: PostHog | null;
  children: React.ReactNode;
}) {
  if (!client) {
    return <>{children}</>;
  }

  return (
    <PostHogProvider client={client} debug={__DEV__}>
      {children}
    </PostHogProvider>
  );
}
