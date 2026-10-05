import { analytics } from '@/src/services/analytics';
import { ROUTE_MANIFEST, type AppRouteName } from '@/src/navigation/routeManifest';
import { usePathname, useSegments } from 'expo-router';
import React from 'react';

interface RouteMetadata {
  screenType: string;
  flowContext: string | null;
  isModal: boolean;
}

const ROUTE_METADATA_MAP = Object.fromEntries(
  ROUTE_MANIFEST.map(route => [
    route.name,
    {
      screenType: route.screenType,
      flowContext: route.flowContext,
      isModal: route.isModal,
    },
  ]),
) as Record<AppRouteName, RouteMetadata>;

type RouteMetadataKey = keyof typeof ROUTE_METADATA_MAP;

const SHORT_TAB_ROUTE_ALIASES: Record<string, AppRouteName> = {
  accounts: '(tabs)/accounts',
  activity: '(tabs)/activity',
  commitments: '(tabs)/commitments',
  settings: '(tabs)/settings',
};

function resolveRouteMetadata(screenName: string): RouteMetadata {
  const direct = ROUTE_METADATA_MAP[screenName as RouteMetadataKey];
  if (direct) return direct;

  const baseSegment = screenName.split('/').pop() || screenName;
  const alias = SHORT_TAB_ROUTE_ALIASES[baseSegment];
  if (alias) {
    return ROUTE_METADATA_MAP[alias];
  }

  if (baseSegment in ROUTE_METADATA_MAP) {
    return ROUTE_METADATA_MAP[baseSegment as RouteMetadataKey];
  }

  const matchedKey = Object.keys(ROUTE_METADATA_MAP).find(k => screenName.includes(k));
  if (matchedKey) return ROUTE_METADATA_MAP[matchedKey as RouteMetadataKey];

  return {
    screenType: 'other',
    flowContext: null,
    isModal: /entry|creation|edit|form|modal/.test(screenName),
  };
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
