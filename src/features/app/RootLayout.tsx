import { AppConfig } from '@/src/constants/app-config';
import { analytics, navigationIntegration } from '@/src/services/analytics-service';
import * as SplashScreen from 'expo-splash-screen';
import { useNavigationContainerRef } from 'expo-router';
import * as Sentry from '@sentry/react-native';
import React, { useEffect } from 'react';
import { View, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DatabaseProvider } from '@nozbe/watermelondb/react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import PostHog, { PostHogProvider } from 'posthog-react-native';

import { AlertContainer } from '@/src/components/common/AlertContainer';
import { ToastContainer } from '@/src/components/common/Toast';
import { ErrorBoundary } from '@/src/components/core';
import { UIProvider, useUI } from '@/src/contexts/UIContext';
import { WorkplaceProvider, useWorkplace } from '@/src/contexts/WorkplaceContext';
import { database } from '@/src/data/database/Database';
import { resetAllCharts } from '@/src/hooks/chartInteractionRegistry';
import { AppContent } from './components/AppNavigation';
import { AppLockInterceptor } from './components/AppLockInterceptor';
import { useTelemetry } from './hooks/useTelemetry';
import { useFonts } from './hooks/useFonts';
import { useAppBootstrap } from './hooks/useAppBootstrap';
import { useWidgetSync } from './hooks/useWidgetSync';

import '@/src/services/audit-handlers';

// Initialize core services
SplashScreen.preventAutoHideAsync().catch(() => {});
analytics.initialize();

/**
 * Root Layout
 * The entry point that composes all global providers and initializes the app.
 */
function RootLayout() {
  const navigationRef = useNavigationContainerRef();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? DarkTheme : DefaultTheme;

  // Sentry Navigation Tracing
  useEffect(() => {
    if (navigationRef && AppConfig.features.enableSentry) {
      navigationIntegration.registerNavigationContainer(navigationRef);
    }
  }, [navigationRef]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View
        style={{ flex: 1 }}
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
 * Stage 1: Critical UI path (Fonts, Telemetry, Splash)
 * Runs immediately when UIProvider is ready.
 */
function EarlyBootstrap() {
  const { isAppReady } = useUI();

  useFonts();
  useTelemetry();

  // Hide splash screen as soon as critical UI assets are ready
  useEffect(() => {
    if (isAppReady) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [isAppReady]);

  return null;
}

/**
 * Stage 2: Background Data path (Bootstrap, Widgets)
 * Runs once a Workplace is loaded from the database.
 */
function WorkplaceBootstrap() {
  const { workplaceId, defaultCurrencyCode } = useWorkplace();

  useAppBootstrap(workplaceId, defaultCurrencyCode);
  useWidgetSync(workplaceId, defaultCurrencyCode);

  return null;
}

/**
 * Analytics wrapper to handle conditional client initialization.
 */
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
