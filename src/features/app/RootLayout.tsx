import { AppConfig } from '@/src/constants/app-config';
import { analytics, navigationIntegration } from '@/src/services/analytics-service';
import * as SplashScreen from 'expo-splash-screen';
import { useNavigationContainerRef } from 'expo-router';
import * as Sentry from '@sentry/react-native';
import React from 'react';

import { AppProviders } from './components/AppProviders';
import { TelemetryTracker } from './components/TelemetryTracker';
import { AppContent } from './components/AppNavigation';

import '@/src/services/audit-handlers';

// Prevent splash screen from auto-hiding before we are ready
SplashScreen.preventAutoHideAsync().catch(() => {
  /* ignore */
});

// Initialize telemetry at module load time — runs once during JS bundle evaluation,
// before any component mounts. This eliminates an extra render cycle that was
// previously gated on a useEffect + useState.
analytics.initialize();

/**
 * Root Layout
 *
 * Segregated into:
 * 1. AppProviders: Global context orchestration
 * 2. TelemetryTracker: Screen-view and behavior tracking
 * 3. AppContent: Navigation and auth-flow orchestration
 */
function RootLayout() {
  const navigationRef = useNavigationContainerRef();

  // Register navigation container with Sentry for distributed tracing
  React.useEffect(() => {
    if (navigationRef && AppConfig.features.enableSentry) {
      navigationIntegration.registerNavigationContainer(navigationRef);
    }
  }, [navigationRef]);

  return (
    <AppProviders analyticsClient={analytics.posthog}>
      <TelemetryTracker />
      <AppContent />
    </AppProviders>
  );
}

export default Sentry.wrap(RootLayout);
