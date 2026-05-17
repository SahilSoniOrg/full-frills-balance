import { AppConfig } from '@/src/constants/app-config';
import { analytics, navigationIntegration } from '@/src/services/analytics-service';
import { DatabaseProvider } from '@nozbe/watermelondb/react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as Sentry from '@sentry/react-native';
import { useNavigationContainerRef } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import PostHog, { PostHogProvider } from 'posthog-react-native';
import React, { useEffect } from 'react';
import { View, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AlertContainer } from '@/src/components/common/AlertContainer';
import { ToastContainer } from '@/src/components/common/Toast';
import { ErrorBoundary } from '@/src/components/core';
import { UIProvider, useUI } from '@/src/contexts/UIContext';
import { WorkplaceProvider, useWorkplace } from '@/src/contexts/WorkplaceContext';
import { database } from '@/src/data/database/Database';
import { resetAllCharts } from '@/src/hooks/chartInteractionRegistry';
import { AppLockInterceptor } from './components/AppLockInterceptor';
import { AppContent } from './components/AppNavigation';
import { useAppBootstrap } from './hooks/useAppBootstrap';
import { useFonts } from './hooks/useFonts';
import { useTelemetry } from './hooks/useTelemetry';
import { useWidgetSync } from './hooks/useWidgetSync';

import '@/src/services/audit-handlers';

// Prevent splash from hiding until we control it
SplashScreen.preventAutoHideAsync().catch(() => {});
analytics.initialize();

/**
 * Root Layout
 */
function RootLayout() {
  const navigationRef = useNavigationContainerRef();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? DarkTheme : DefaultTheme;

  useEffect(() => {
    if (navigationRef && AppConfig.features.enableSentry) {
      navigationIntegration.registerNavigationContainer(navigationRef);
    }
  }, [navigationRef]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View
        style={{ flex: 1, backgroundColor: '#000000' }}
        onStartShouldSetResponderCapture={e => {
          resetAllCharts(e.nativeEvent.pageX, e.nativeEvent.pageY);
          return false;
        }}
      >
        <SafeAreaProvider>
          <ErrorBoundary>
            <DatabaseProvider database={database}>
              <UIProvider>
                <EarlyBootstrap />
                <WorkplaceProvider>
                  <MaybeAnalyticsProvider client={analytics.posthog}>
                    <ThemeProvider value={theme}>
                      <WorkplaceBootstrap />
                      <AppLockInterceptor>
                        <AppContent />
                      </AppLockInterceptor>
                      <AlertContainer />
                      <ToastContainer />
                      <SplashOrchestrator />
                    </ThemeProvider>
                  </MaybeAnalyticsProvider>
                </WorkplaceProvider>
              </UIProvider>
            </DatabaseProvider>
          </ErrorBoundary>
        </SafeAreaProvider>
      </View>
    </GestureHandlerRootView>
  );
}

/**
 * Stage 1: UI Readiness (Fonts, Telemetry)
 */
function EarlyBootstrap() {
  useFonts();
  useTelemetry();
  return null;
}

/**
 * Stage 2: Data Readiness (Bootstrap, Widgets)
 */
function WorkplaceBootstrap() {
  const { workplaceId, defaultCurrencyCode } = useWorkplace();
  useAppBootstrap(workplaceId, defaultCurrencyCode);
  useWidgetSync(workplaceId, defaultCurrencyCode);
  return null;
}

/**
 * Manages the transition from Native Splash to application UI.
 */
function SplashOrchestrator() {
  const { isAppReady, isDataHydrated, hasCompletedOnboarding } = useUI();

  // If onboarding is done, we wait for both UI and Data hydration.
  // Otherwise, we just wait for UI assets to show the onboarding shell.
  const isFullyReady = isAppReady && (!hasCompletedOnboarding || isDataHydrated);

  useEffect(() => {
    if (isFullyReady) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [isFullyReady]);

  return null;
}

function MaybeAnalyticsProvider({
  client,
  children,
}: {
  client: PostHog | null;
  children: React.ReactNode;
}) {
  if (!client) return <>{children}</>;
  return (
    <PostHogProvider client={client} debug={__DEV__}>
      {children}
    </PostHogProvider>
  );
}

export default Sentry.wrap(RootLayout);
