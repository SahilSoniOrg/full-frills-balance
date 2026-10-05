import { analytics } from '@/src/services/analytics';
import { ROUTE_MANIFEST, type RouteManifestEntry } from '@/src/navigation/routeManifest';
import { usePathname, useSegments } from 'expo-router';
import React from 'react';

type RouteMetadata = Pick<RouteManifestEntry, 'screenType' | 'flowContext' | 'isModal'>;

const findRoute = (name: string) => ROUTE_MANIFEST.find(route => route.name === name);

function resolveRouteMetadata(screenName: string): RouteMetadata {
  const baseSegment = screenName.split('/').pop() || screenName;
  return (
    findRoute(screenName) ??
    findRoute(baseSegment) ??
    findRoute(`(tabs)/${baseSegment}`) ??
    ROUTE_MANIFEST.find(route => screenName.includes(route.name)) ?? {
      screenType: 'other',
      flowContext: null,
      isModal: /entry|creation|edit|form|modal/.test(screenName),
    }
  );
}

export function useTelemetry() {
  const pathname = usePathname();
  const segments = useSegments();
  const currentScreenRef = React.useRef<string | null>(null);
  const screenStartTimeRef = React.useRef<number>(0);

  React.useEffect(() => {
    if (!pathname) return;

    const screenName = segments.join('/') || 'index';
    const previousScreen = currentScreenRef.current;
    const now = Date.now();

    if (previousScreen !== screenName) {
      const previousDwellMs = previousScreen ? now - screenStartTimeRef.current : 0;

      if (previousScreen) {
        analytics.track('screen_leave', {
          screen: previousScreen,
          dwell_time_ms: previousDwellMs,
          dwell_time_sec: Math.round(previousDwellMs / 1000),
          next_screen: screenName,
        });
      }

      currentScreenRef.current = screenName;
      screenStartTimeRef.current = now;

      const meta = resolveRouteMetadata(screenName);

      // Track screen view with enhanced context including previous screen
      analytics.screen(screenName, {
        pathname,
        screen_type: meta.screenType,
        flow_context: meta.flowContext || 'none',
        segment_count: segments.length,
        is_modal: meta.isModal,
        previous_screen: previousScreen || 'none',
        previous_screen_dwell_ms: previousDwellMs,
      });

      // Update activity for session tracking
      analytics.updateActivity();

      // Track user flow progression
      if (meta.flowContext) {
        analytics.trackUserInteraction('screen_view', {
          screen: screenName,
          previous_screen: previousScreen || 'none',
          flow: meta.flowContext,
          type: meta.screenType,
        });
      }
    }
  }, [pathname, segments]);
}
