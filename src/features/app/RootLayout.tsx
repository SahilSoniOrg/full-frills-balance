import { ChartInteractionProvider } from '@/src/components/charts/ChartInteractionProvider';
import { AlertContainer } from '@/src/components/common/AlertContainer';
import { ToastContainer } from '@/src/components/common/Toast';
import { ErrorBoundary } from '@/src/components/core';
import { AppConfig } from '@/src/constants/app-config';
import { UIProvider, useUI } from '@/src/contexts/UIContext';
import { WorkplaceProvider, useWorkplace } from '@/src/contexts/WorkplaceContext';
import { database } from '@/src/data/database/Database';
import { analytics, navigationIntegration } from '@/src/services/analytics-service';
import { logger } from '@/src/utils/logger';
import { DatabaseProvider } from '@nozbe/watermelondb/react';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import * as Sentry from '@sentry/react-native';
import { useNavigationContainerRef } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import PostHog, { PostHogProvider } from 'posthog-react-native';
import React, { useEffect } from 'react';
import { View, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppLockInterceptor } from './components/AppLockInterceptor';
import { AppContent } from './components/AppNavigation';
import { useAppBootstrap } from './hooks/useAppBootstrap';
import { useAppForegroundMaintenance } from './hooks/useAppForegroundMaintenance';
import { useFonts } from './hooks/useFonts';
import { useTelemetry } from './hooks/useTelemetry';
import { useWidgetSync } from './hooks/useWidgetSync';

import '@/src/services/audit-handlers';

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
      <View style={{ flex: 1, backgroundColor: '#000000' }}>
        <ChartInteractionProvider>
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
        </ChartInteractionProvider>
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
  useAppForegroundMaintenance();
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
    logger.debug(
      `[Splash] Status update: isAppReady=${isAppReady}, isDataHydrated=${isDataHydrated}, hasCompletedOnboarding=${hasCompletedOnboarding}, isFullyReady=${isFullyReady}`,
    );
  }, [isAppReady, isDataHydrated, hasCompletedOnboarding, isFullyReady]);

  useEffect(() => {
    if (isFullyReady) {
      const hideStart = performance.now();
      logger.info(
        `[Splash] Hiding splash screen at ${Math.round(hideStart)}ms (isAppReady: ${isAppReady}, isDataHydrated: ${isDataHydrated})`,
      );
      SplashScreen.hideAsync()
        .then(() => {
          logger.info(
            `[Splash] Splash screen hidden in ${Math.round(performance.now() - hideStart)}ms`,
          );
        })
        .catch(err => {
          logger.warn('[Splash] Failed to hide splash screen', err);
        });
    }
  }, [isFullyReady, isAppReady, isDataHydrated]);

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
