import { AlertContainer } from '@/src/components/common/AlertContainer';
import { ToastContainer } from '@/src/components/common/Toast';
import { ErrorBoundary } from '@/src/components/core';
import { UIProvider, useUI } from '@/src/contexts/UIContext';
import { useWorkplace, WorkplaceProvider } from '@/src/contexts/WorkplaceContext';
import { database } from '@/src/data/database/Database';
import { AppLockInterceptor } from '@/src/features/app/components/AppLockInterceptor';
import { useAppBootstrap } from '@/src/features/app/hooks/useAppBootstrap';
import { RestartRequiredScreen } from '@/src/features/dev';
import { resetAllCharts } from '@/src/hooks/chartInteractionRegistry';
import { useColorScheme } from '@/src/hooks/use-color-scheme';
import { analytics, POSTHOG_API_KEY, POSTHOG_HOST } from '@/src/services/analytics-service';
import { DatabaseProvider } from '@nozbe/watermelondb/react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, usePathname, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { PostHogProvider } from 'posthog-react-native';
import React from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FontManager } from './components/FontManager';

import { useWidgetSync } from '@/src/features/app/hooks/useWidgetSync';
import '@/src/services/audit-handlers';

// Prevent splash screen from auto-hiding before we are ready
SplashScreen.preventAutoHideAsync().catch(() => {
  /* ignore */
});

function PostHogScreenTracker() {
  const pathname = usePathname();
  const segments = useSegments();

  React.useEffect(() => {
    if (pathname) {
      // Enhanced screen name extraction
      const screenName = segments.join('/') || 'index';
      const screenType = getScreenType(screenName);
      const flowContext = getFlowContext(screenName);

      // Track screen view with enhanced context
      analytics.screen(screenName, {
        pathname,
        screen_type: screenType,
        flow_context: flowContext || 'none',
        segment_count: segments.length,
        is_modal: isModalScreen(screenName),
      });

      // Update activity for session tracking
      analytics.updateActivity();

      // Track user flow progression
      if (flowContext) {
        analytics.trackUserInteraction('screen_view', {
          screen: screenName,
          flow: flowContext,
          type: screenType,
        });
      }
    }
  }, [pathname, segments]);

  return null;
}

// Helper functions for screen classification
function getScreenType(screenName: string): string {
  if (screenName.includes('onboarding')) return 'onboarding';
  if (screenName.includes('journal') || screenName.includes('transaction')) return 'transaction';
  if (screenName.includes('account')) return 'account';
  if (screenName.includes('settings')) return 'settings';
  if (screenName.includes('import') || screenName.includes('export')) return 'data_management';
  if (screenName === 'index' || screenName === '(tabs)') return 'main';
  return 'other';
}

function getFlowContext(screenName: string): string | null {
  if (screenName.includes('onboarding')) return 'user_setup';
  if (screenName.includes('journal-entry')) return 'transaction_creation';
  if (screenName.includes('account-creation')) return 'account_setup';
  if (screenName.includes('import-selection')) return 'data_import';
  if (screenName.includes('audit-log')) return 'data_review';
  if (screenName.includes('appearance-settings')) return 'personalization';
  if (screenName.includes('privacy-security-settings')) return 'privacy_security';
  if (screenName.includes('automation-settings')) return 'automation';
  if (screenName.includes('maintenance-settings')) return 'maintenance';
  return null;
}

function isModalScreen(screenName: string): boolean {
  const modalScreens = [
    'journal-entry',
    'account-creation',
    'onboarding',
    'account-reorder',
    'manage-hierarchy',
    'appearance-settings',
  ];
  return modalScreens.some(modal => screenName.includes(modal));
}

function BootManager() {
  const { isAppReady } = useUI();

  React.useEffect(() => {
    if (isAppReady) {
      SplashScreen.hideAsync().catch(() => {
        /* ignore */
      });
    }
  }, [isAppReady]);

  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View
        style={{ flex: 1 }}
        onStartShouldSetResponderCapture={e => {
          const { pageX, pageY } = e.nativeEvent;
          resetAllCharts(pageX, pageY);
          return false; // don't block children (scroll, gestures)
        }}
      >
        <SafeAreaProvider>
          <ErrorBoundary>
            <DatabaseProvider database={database}>
              <WorkplaceProvider>
                <UIProvider>
                  <BootManager />
                  <FontManager>
                    <PostHogProvider
                      client={analytics.posthog ?? undefined}
                      apiKey={analytics.posthog ? undefined : POSTHOG_API_KEY}
                      options={
                        analytics.posthog ? undefined : { host: POSTHOG_HOST, disabled: true }
                      }
                      debug={__DEV__}
                    >
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
              </WorkplaceProvider>
            </DatabaseProvider>
          </ErrorBoundary>
        </SafeAreaProvider>
      </View>
    </GestureHandlerRootView>
  );
}

function AppContent() {
  const { isRestartRequired } = useUI();

  const { workplaceId, defaultCurrencyCode } = useWorkplace();
  // Sync app data with native widgets
  useWidgetSync(workplaceId, defaultCurrencyCode);

  useAppBootstrap(workplaceId, defaultCurrencyCode);

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
      <Stack.Screen
        name="journal-entry"
        options={{
          headerShown: false,
          presentation: 'card',
          animation: 'slide_from_bottom',
          gestureEnabled: true,
          gestureDirection: 'vertical',
        }}
      />
      <Stack.Screen
        name="account-creation"
        options={{
          headerShown: false,
          presentation: 'card',
          animation: 'slide_from_bottom',
          gestureEnabled: true,
          gestureDirection: 'vertical',
        }}
      />
      <Stack.Screen
        name="onboarding"
        options={{
          headerShown: false,
          presentation: 'card',
          animation: 'slide_from_bottom',
          gestureEnabled: true,
          gestureDirection: 'vertical',
        }}
      />
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
      <Stack.Screen name="privacy-security-settings" options={{ headerShown: false }} />
      <Stack.Screen name="automation-settings" options={{ headerShown: false }} />
      <Stack.Screen name="maintenance-settings" options={{ headerShown: false }} />
      <Stack.Screen name="about-support-settings" options={{ headerShown: false }} />
      <Stack.Screen
        name="appearance-settings"
        options={{ headerShown: false, presentation: 'modal' }}
      />
    </Stack>
  );
}
