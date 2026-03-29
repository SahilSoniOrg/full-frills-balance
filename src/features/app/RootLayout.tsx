import { AlertContainer } from '@/src/components/common/AlertContainer';
import { ToastContainer } from '@/src/components/common/Toast';
import { ErrorBoundary } from '@/src/components/core';
import { UIProvider, useUI } from '@/src/contexts/UIContext';
import { database } from '@/src/data/database/Database';
import { AppLockInterceptor } from '@/src/features/app/components/AppLockInterceptor';
import { useAppBootstrap } from '@/src/features/app/hooks/useAppBootstrap';
import { RestartRequiredScreen } from '@/src/features/dev';
import { useColorScheme } from '@/src/hooks/use-color-scheme';
import { analytics, posthogClient } from '@/src/services/analytics-service';
import { DatabaseProvider } from '@nozbe/watermelondb/react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, usePathname, useSegments } from 'expo-router';
import { PostHogProvider } from 'posthog-react-native';
import React from 'react';
import { DeviceEventEmitter, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FontManager } from './components/FontManager';

import { REPORT_CHART_EVENTS } from '@/src/constants/report-constants';
import { useWidgetSync } from '@/src/features/app/hooks/useWidgetSync';

function PostHogScreenTracker() {
  const pathname = usePathname();
  const segments = useSegments();

  React.useEffect(() => {
    if (pathname) {
      // Screen name can be the pathname or a more descriptive string from segments
      const screenName = segments.join('/') || 'index';
      analytics.screen(screenName, {
        pathname,
      });
    }
  }, [pathname, segments]);

  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View
        style={{ flex: 1 }}
        onStartShouldSetResponderCapture={e => {
          DeviceEventEmitter.emit(REPORT_CHART_EVENTS.globalTouch, {
            pageX: e.nativeEvent.pageX,
            pageY: e.nativeEvent.pageY,
          });
          return false;
        }}
      >
        <SafeAreaProvider>
          <ErrorBoundary>
            <DatabaseProvider database={database}>
              <UIProvider>
                <FontManager>
                  <PostHogProvider client={posthogClient ?? undefined} debug={__DEV__}>
                    <PostHogScreenTracker />
                    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
                      <AppLockInterceptor>
                        <AppContent />
                      </AppLockInterceptor>
                      <AlertContainer />
                      <ToastContainer />
                    </ThemeProvider>
                  </PostHogProvider>
                </FontManager>
              </UIProvider>
            </DatabaseProvider>
          </ErrorBoundary>
        </SafeAreaProvider>
      </View>
    </GestureHandlerRootView>
  );
}

function AppContent() {
  const { isRestartRequired } = useUI();

  // Sync app data with native widgets
  useWidgetSync();

  useAppBootstrap();

  if (isRestartRequired) {
    return <RestartRequiredScreen />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="journal-entry" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen
        name="account-creation"
        options={{ headerShown: false, presentation: 'modal' }}
      />
      <Stack.Screen name="onboarding" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="_design-preview" options={{ headerShown: false }} />
      <Stack.Screen name="account-details" options={{ headerShown: false }} />
      <Stack.Screen name="transaction-details" options={{ headerShown: false }} />
      <Stack.Screen
        name="account-reorder"
        options={{ headerShown: false, presentation: 'modal' }}
      />
      <Stack.Screen
        name="manage-hierarchy"
        options={{ headerShown: false, presentation: 'modal' }}
      />
      <Stack.Screen name="import-selection" options={{ headerShown: false }} />
      <Stack.Screen name="audit-log" options={{ headerShown: false }} />
      <Stack.Screen
        name="appearance-settings"
        options={{ headerShown: false, presentation: 'modal' }}
      />
    </Stack>
  );
}
