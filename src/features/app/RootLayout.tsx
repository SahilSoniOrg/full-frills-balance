import { ChartInteractionProvider } from '@/src/components/charts/ChartInteractionProvider';
import { PlannedPaymentFxReviewContainer } from '@/src/components/overlays/PlannedPaymentFxReviewContainer';
import { AlertContainer } from '@/src/components/overlays/AlertContainer';
import { IncompleteFxDetailsContainer } from '@/src/components/overlays/IncompleteFxDetailsContainer';
import { ToastContainer } from '@/src/components/overlays/Toast';
import { ErrorBoundary } from '@/src/components/core';
import { AppConfig } from '@/src/constants/app-config';
import { UIProvider } from '@/src/contexts/UIContext';
import { useAppReady } from '@/src/contexts/app-shell/AppReadyProvider';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { database } from '@/src/data/database/Database';
import { smsReviewNotificationService } from '@/src/services/sms/SmsReviewNotificationService';
import { analytics, navigationIntegration } from '@/src/services/analytics';
import { logger } from '@/src/utils/logger';
import { DatabaseProvider } from '@nozbe/watermelondb/react';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import * as Sentry from '@sentry/react-native';
import { useNavigationContainerRef } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useSyncExternalStore } from 'react';
import {
  SmsNotificationResponseObserver,
  SmsNotificationNavigation,
} from './hooks/useSmsNotificationLifecycle';
import { Platform, View, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  SafeAreaProvider,
  initialWindowMetrics,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { AppLockInterceptor } from './components/AppLockInterceptor';
import { AppContent } from './components/AppNavigation';
import {
  LaunchCoordinatorContent,
  LaunchCoordinatorProvider,
  type LaunchSetupDraft,
  useLaunchCoordinator,
} from './LaunchCoordinator';
import {
  readSetupDraftSnapshot,
  subscribeToSetupDraft,
} from '@/src/services/setup/launchProjection';
import { readBlockingSetupProjection } from '@/src/features/setup';
import { useAppBootstrap } from './hooks/useAppBootstrap';
import { useAppForegroundMaintenance } from './hooks/useAppForegroundMaintenance';
import { useFonts } from './hooks/useFonts';
import { useTelemetry } from './hooks/useTelemetry';
import { snapshotService } from '@/src/utils/SnapshotService';
import { widgetProjectionService } from '@/src/services/widgets/WidgetProjectionService';
import { useWidgetLaunchTracking } from './hooks/useWidgetLaunchTracking';
import { useWidgetSync } from './hooks/useWidgetSync';
import { UpdateGate } from './UpdateGate';
import {
  NATIVE_SPLASH_BACKGROUND,
  hasMeasuredSafeAreaInsets,
  resolveSafeAreaInitialMetrics,
  shouldHideNativeSplash,
} from './splashHandoff';

/**
 * Root Layout
 */
function RootLayout() {
  const navigationRef = useNavigationContainerRef();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? DarkTheme : DefaultTheme;
  const setupDraftSnapshot = useSyncExternalStore(
    subscribeToSetupDraft,
    readSetupDraftSnapshot,
    readSetupDraftSnapshot,
  );
  const setupDraft = React.useMemo<LaunchSetupDraft | undefined>(
    () => readBlockingSetupProjection(setupDraftSnapshot),
    [setupDraftSnapshot],
  );

  useEffect(() => {
    if (navigationRef && AppConfig.features.enableSentry) {
      navigationIntegration.registerNavigationContainer(navigationRef);
    }
  }, [navigationRef]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: NATIVE_SPLASH_BACKGROUND }}>
        <ChartInteractionProvider>
          <SafeAreaProvider
            initialMetrics={resolveSafeAreaInitialMetrics(initialWindowMetrics)}
            style={{ flex: 1, backgroundColor: NATIVE_SPLASH_BACKGROUND }}
          >
            <ErrorBoundary>
              <DatabaseProvider database={database}>
                <UIProvider>
                  <EarlyBootstrap />
                  <SmsNotificationResponseObserver />
                  <ThemeProvider value={theme}>
                    <LaunchCoordinatorProvider setupDraft={setupDraft}>
                      <SplashOrchestrator />
                      <ToastContainer />
                      <UpdateGate>
                        <LaunchCoordinatorContent gateChildren={<AppContent />}>
                          <WorkplaceBootstrap />
                          <AppLockInterceptor>
                            <SmsNotificationNavigation />
                            <AppContent />
                          </AppLockInterceptor>
                        </LaunchCoordinatorContent>
                        <AlertContainer />
                        <IncompleteFxDetailsContainer />
                        <PlannedPaymentFxReviewContainer />
                      </UpdateGate>
                    </LaunchCoordinatorProvider>
                  </ThemeProvider>
                </UIProvider>
              </DatabaseProvider>
            </ErrorBoundary>
          </SafeAreaProvider>
        </ChartInteractionProvider>
      </View>
    </GestureHandlerRootView>
  );
}

function EarlyBootstrap() {
  useFonts();
  useTelemetry();
  useWidgetLaunchTracking();
  useEffect(() => {
    const retryWidgetCleanup =
      Platform.OS === 'web' ? Promise.resolve() : widgetProjectionService.recoverPendingCleanup();
    void Promise.all([
      retryWidgetCleanup,
      Promise.resolve().then(() => snapshotService.retryPendingCleanup()),
      Platform.OS === 'web' ? Promise.resolve() : smsReviewNotificationService.reconcilePrivacy(),
    ])
      .then(([_, snapshotsCleared]) => {
        if (!snapshotsCleared)
          logger.warn('[EarlyBootstrap] Snapshot cleanup retry remains pending');
      })
      .catch(error => logger.warn('[EarlyBootstrap] Projection cleanup retry failed', { error }));
  }, []);
  return null;
}

function WorkplaceBootstrap() {
  const { workplaceId, defaultCurrencyCode } = useWorkplace();
  useAppBootstrap(workplaceId, defaultCurrencyCode);
  useAppForegroundMaintenance();
  useWidgetSync(workplaceId, defaultCurrencyCode);
  return null;
}

function SplashOrchestrator() {
  const { isAppReady, isDataHydrated } = useAppReady();
  const launch = useLaunchCoordinator();
  const insets = useSafeAreaInsets();
  const hasTrackedColdStartRef = React.useRef(false);

  const canHideSplash = shouldHideNativeSplash({
    isAppReady,
    isDataHydrated,
    launchState:
      launch.kind === 'open'
        ? 'open'
        : launch.kind === 'loading' || launch.kind === 'error'
          ? 'loading'
          : 'gate',
    hasSafeAreaInsets: hasMeasuredSafeAreaInsets(insets),
  });

  useEffect(() => {
    logger.debug(
      `[Splash] Status update: isAppReady=${isAppReady}, isDataHydrated=${isDataHydrated}, canHideSplash=${canHideSplash}`,
    );
  }, [isAppReady, isDataHydrated, canHideSplash]);

  useEffect(() => {
    if (!canHideSplash) {
      return;
    }

    let cancelled = false;
    const hideStart = performance.now();
    logger.info(
      `[Splash] Hiding splash screen at ${Math.round(hideStart)}ms (isAppReady: ${isAppReady}, isDataHydrated: ${isDataHydrated})`,
    );

    const hideAfterLayout = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) {
          return;
        }
        SplashScreen.hideAsync()
          .then(() => {
            const totalTtiMs = Math.round(performance.now());
            logger.info(
              `[Splash] Splash screen hidden in ${Math.round(performance.now() - hideStart)}ms (TTI: ${totalTtiMs}ms)`,
            );

            if (!hasTrackedColdStartRef.current) {
              hasTrackedColdStartRef.current = true;
              analytics.track('app_cold_start', {
                time_to_interactive_ms: totalTtiMs,
                time_to_interactive_sec: Math.round(totalTtiMs / 1000),
                is_data_hydrated: isDataHydrated,
              });
            }
          })
          .catch(err => {
            logger.warn('[Splash] Failed to hide splash screen', err);
          });
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(hideAfterLayout);
    };
  }, [canHideSplash, isAppReady, isDataHydrated]);

  return null;
}

export default Sentry.wrap(RootLayout);
